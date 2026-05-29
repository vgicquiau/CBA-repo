import { CosmosClient, SqlQuerySpec } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { Room, Booking, User, HouseConfig } from '@clos/shared-types';
import { Repository, IdempotencyRecord, ConflictError, NotFoundError } from './repository';

// ─── Cosmos item types ────────────────────────────────────────────────────────

type CosmosBase = {
  pk: string;
  id: string;
  entityType: string;
  ttl?: number;
  _etag?: string;
};

type RoomDoc = CosmosBase & Room & { entityType: 'Room' };
type BookingDoc = CosmosBase & Booking & { entityType: 'Booking' };
type BookingRefDoc = CosmosBase & { entityType: 'BookingRef'; roomId: string; bookingId: string };
type UserDoc = CosmosBase & User & { entityType: 'User' };
type HouseConfigDoc = CosmosBase & HouseConfig & { entityType: 'HouseConfig' };
type IdempotencyDoc = CosmosBase & IdempotencyRecord & { entityType: 'Idempotency' };

// ─── Key helpers ──────────────────────────────────────────────────────────────

const pk = {
  room: (id: string) => `ROOM#${id}`,
  guest: (id: string) => `GUEST#${id}`,
  user: (id: string) => `USER#${id}`,
  house: () => 'HOUSE_CONFIG',
  idempotency: () => 'IDEMPOTENCY',
};

const docId = {
  room: (id: string) => `ROOM#${id}#METADATA`,
  booking: (id: string) => `BOOKING#${id}`,
  bookingRef: (id: string) => `BOOKING_REF#${id}`,
  user: (id: string) => `USER#${id}#METADATA`,
  house: () => 'HOUSE_CONFIG#MAIN',
  idempotency: (key: string) => `IDEMPOTENCY#${key}`,
};

// ─── Strip Cosmos metadata, returning only domain fields ──────────────────────

function strip<T>(doc: CosmosBase & T): T {
  const { pk: _pk, id: _id, entityType: _et, ttl: _ttl, _etag: _e, ...rest } = doc as CosmosBase & Record<string, unknown>;
  return rest as T;
}

function datesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && s2 < e1;
}

// ─── Client factory ───────────────────────────────────────────────────────────

function buildClient(): CosmosClient {
  const endpoint = process.env.COSMOS_ENDPOINT;
  if (!endpoint) throw new Error('COSMOS_ENDPOINT environment variable is required');
  return new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
}

// ─── Repository factory ───────────────────────────────────────────────────────

export function createCosmosRepository(): Repository {
  const client = buildClient();
  const db = client.database(process.env.COSMOS_DATABASE ?? 'clos-bon-accueil');
  const container = db.container(process.env.COSMOS_CONTAINER ?? 'main');

  // Point read — returns null on 404
  async function readItem<T extends CosmosBase>(
    itemId: string,
    partitionKey: string,
  ): Promise<T | null> {
    try {
      const { resource } = await container.item(itemId, partitionKey).read<T>();
      return resource ?? null;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  // Query (cross-partition when partitionKey is omitted)
  async function queryItems<T>(
    spec: SqlQuerySpec,
    partitionKey?: string,
  ): Promise<T[]> {
    const options = partitionKey ? { partitionKey } : undefined;
    const { resources } = await container.items.query<T>(spec, options).fetchAll();
    return resources;
  }

  return {
    // ── Rooms ──────────────────────────────────────────────────────────────────

    async getRoom(roomId: string): Promise<Room | null> {
      const doc = await readItem<RoomDoc>(docId.room(roomId), pk.room(roomId));
      return doc ? strip<Room>(doc) : null;
    },

    async listRooms(): Promise<Room[]> {
      const docs = await queryItems<RoomDoc>({
        query: 'SELECT * FROM c WHERE c.entityType = "Room"',
      });
      return docs.map((d) => strip<Room>(d));
    },

    async createRoom(room: Room): Promise<Room> {
      const doc: RoomDoc = {
        pk: pk.room(room.roomId),
        id: docId.room(room.roomId),
        entityType: 'Room',
        ...room,
      };
      await container.items.create(doc);
      return room;
    },

    async updateRoom(roomId: string, patch: Partial<Room>): Promise<Room> {
      const existing = await readItem<RoomDoc>(docId.room(roomId), pk.room(roomId));
      if (!existing) throw new NotFoundError('Room', roomId);
      const updated: Room = {
        ...strip<Room>(existing),
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      const updatedDoc: RoomDoc = {
        pk: pk.room(roomId),
        id: docId.room(roomId),
        entityType: 'Room',
        ...updated,
      };
      await container.item(docId.room(roomId), pk.room(roomId)).replace(updatedDoc, {
        accessCondition: { type: 'IfMatch', condition: existing._etag! },
      });
      return updated;
    },

    async deleteRoom(roomId: string): Promise<{ cancelledBookings: Booking[] }> {
      const existing = await readItem<RoomDoc>(docId.room(roomId), pk.room(roomId));
      if (!existing) throw new NotFoundError('Room', roomId);

      const bookingDocs = await queryItems<BookingDoc>(
        { query: 'SELECT * FROM c WHERE c.entityType = "Booking"' },
        pk.room(roomId),
      );
      const cancelledBookings = bookingDocs.map((d) => strip<Booking>(d));

      await Promise.all(
        bookingDocs.map((b) => container.item(b.id, pk.room(roomId)).delete()),
      );
      await container.item(docId.room(roomId), pk.room(roomId)).delete();

      await Promise.all(
        cancelledBookings
          .filter((b) => b.userId)
          .map((b) =>
            container
              .item(docId.bookingRef(b.bookingId), pk.guest(b.userId!))
              .delete()
              .catch(() => {}),
          ),
      );

      return { cancelledBookings };
    },

    // ── Bookings ───────────────────────────────────────────────────────────────

    async getBooking(roomId: string, _start: string, bookingId: string): Promise<Booking | null> {
      const doc = await readItem<BookingDoc>(docId.booking(bookingId), pk.room(roomId));
      return doc ? strip<Booking>(doc) : null;
    },

    async findBookingById(bookingId: string): Promise<Booking | null> {
      const docs = await queryItems<BookingDoc>({
        query: 'SELECT * FROM c WHERE c.id = @id AND c.entityType = "Booking"',
        parameters: [{ name: '@id', value: docId.booking(bookingId) }],
      });
      return docs.length > 0 ? strip<Booking>(docs[0]) : null;
    },

    async listBookingsByRoom(roomId: string, fromDate?: string): Promise<Booking[]> {
      const spec: SqlQuerySpec = fromDate
        ? {
            query: 'SELECT * FROM c WHERE c.entityType = "Booking" AND c.start >= @from',
            parameters: [{ name: '@from', value: fromDate }],
          }
        : { query: 'SELECT * FROM c WHERE c.entityType = "Booking"' };
      const docs = await queryItems<BookingDoc>(spec, pk.room(roomId));
      return docs.map((d) => strip<Booking>(d));
    },

    async listBookingsByRoomInRange(
      roomId: string,
      start: string,
      end: string,
    ): Promise<Booking[]> {
      const docs = await queryItems<BookingDoc>(
        {
          query:
            'SELECT * FROM c WHERE c.entityType = "Booking" AND c.start < @end AND c.end > @start',
          parameters: [
            { name: '@end', value: end },
            { name: '@start', value: start },
          ],
        },
        pk.room(roomId),
      );
      return docs.map((d) => strip<Booking>(d));
    },

    async listMyBookings(userId: string): Promise<Booking[]> {
      const refs = await queryItems<BookingRefDoc>(
        { query: 'SELECT * FROM c WHERE c.entityType = "BookingRef"' },
        pk.guest(userId),
      );
      const bookings = await Promise.all(
        refs.map((ref) => readItem<BookingDoc>(docId.booking(ref.bookingId), pk.room(ref.roomId))),
      );
      return bookings
        .filter((d): d is BookingDoc => d !== null)
        .map((d) => strip<Booking>(d));
    },

    async listAllBookings(opts?: { fromDate?: string; toDate?: string }): Promise<Booking[]> {
      const conditions: string[] = ['c.entityType = "Booking"'];
      const parameters: { name: string; value: string }[] = [];
      if (opts?.fromDate) {
        conditions.push('c.start >= @from');
        parameters.push({ name: '@from', value: opts.fromDate });
      }
      if (opts?.toDate) {
        conditions.push('c.end <= @to');
        parameters.push({ name: '@to', value: opts.toDate });
      }
      const docs = await queryItems<BookingDoc>({
        query: `SELECT * FROM c WHERE ${conditions.join(' AND ')}`,
        parameters,
      });
      return docs.map((d) => strip<Booking>(d));
    },

    async searchBookings(text: string): Promise<Booking[]> {
      const docs = await queryItems<BookingDoc>({
        query:
          'SELECT * FROM c WHERE c.entityType = "Booking" AND (CONTAINS(LOWER(c.name), LOWER(@text)) OR CONTAINS(c.reference, @ref))',
        parameters: [
          { name: '@text', value: text },
          { name: '@ref', value: text.toUpperCase() },
        ],
      });
      return docs.map((d) => strip<Booking>(d));
    },

    async createBooking(booking: Booking): Promise<Booking> {
      const existing = await queryItems<BookingDoc>(
        { query: 'SELECT * FROM c WHERE c.entityType = "Booking"' },
        pk.room(booking.roomId),
      );

      const conflicts = existing.filter((d) =>
        datesOverlap(booking.start, booking.end, d.start, d.end),
      );
      if (conflicts.length > 0) {
        throw new ConflictError(conflicts.map((d) => strip<Booking>(d)));
      }

      const bookingDoc: BookingDoc = {
        pk: pk.room(booking.roomId),
        id: docId.booking(booking.bookingId),
        entityType: 'Booking',
        ...booking,
      };
      await container.items.create(bookingDoc);

      if (booking.userId) {
        const refDoc: BookingRefDoc = {
          pk: pk.guest(booking.userId),
          id: docId.bookingRef(booking.bookingId),
          entityType: 'BookingRef',
          roomId: booking.roomId,
          bookingId: booking.bookingId,
        };
        await container.items.upsert(refDoc);
      }

      return booking;
    },

    async updateBooking(booking: Booking): Promise<Booking> {
      const existing = await readItem<BookingDoc>(
        docId.booking(booking.bookingId),
        pk.room(booking.roomId),
      );
      if (!existing) throw new NotFoundError('Booking', booking.bookingId);
      const updatedDoc: BookingDoc = {
        pk: pk.room(booking.roomId),
        id: docId.booking(booking.bookingId),
        entityType: 'Booking',
        ...booking,
      };
      await container
        .item(docId.booking(booking.bookingId), pk.room(booking.roomId))
        .replace(updatedDoc, {
          accessCondition: { type: 'IfMatch', condition: existing._etag! },
        });
      return booking;
    },

    async deleteBooking(roomId: string, _start: string, bookingId: string): Promise<void> {
      const existing = await readItem<BookingDoc>(docId.booking(bookingId), pk.room(roomId));
      if (!existing) throw new NotFoundError('Booking', bookingId);
      await container.item(docId.booking(bookingId), pk.room(roomId)).delete();
      if (existing.userId) {
        await container
          .item(docId.bookingRef(bookingId), pk.guest(existing.userId))
          .delete()
          .catch(() => {});
      }
    },

    // ── Users ──────────────────────────────────────────────────────────────────

    async getUser(userId: string): Promise<User | null> {
      const doc = await readItem<UserDoc>(docId.user(userId), pk.user(userId));
      return doc ? strip<User>(doc) : null;
    },

    async listUsers(): Promise<User[]> {
      const docs = await queryItems<UserDoc>({
        query: 'SELECT * FROM c WHERE c.entityType = "User"',
      });
      return docs.map((d) => strip<User>(d));
    },

    async createUser(user: User): Promise<User> {
      const doc: UserDoc = {
        pk: pk.user(user.userId),
        id: docId.user(user.userId),
        entityType: 'User',
        ...user,
      };
      await container.items.create(doc);
      return user;
    },

    async deleteUser(userId: string): Promise<void> {
      const existing = await readItem<UserDoc>(docId.user(userId), pk.user(userId));
      if (!existing) throw new NotFoundError('User', userId);
      const bookingRefs = await queryItems<BookingRefDoc>(
        { query: 'SELECT * FROM c WHERE c.entityType = "BookingRef"' },
        pk.guest(userId),
      );
      await Promise.all(
        bookingRefs.map((ref) =>
          container.item(docId.booking(ref.bookingId), pk.room(ref.roomId)).delete().catch(() => {}),
        ),
      );
      await Promise.all(
        bookingRefs.map((ref) =>
          container.item(docId.bookingRef(ref.bookingId), pk.guest(userId)).delete().catch(() => {}),
        ),
      );
      await container.item(docId.user(userId), pk.user(userId)).delete();
    },

    // ── HouseConfig ────────────────────────────────────────────────────────────

    async getHouseConfig(): Promise<HouseConfig> {
      const doc = await readItem<HouseConfigDoc>(docId.house(), pk.house());
      if (!doc) throw new NotFoundError('HouseConfig', 'singleton');
      return strip<HouseConfig>(doc);
    },

    async updateHouseConfig(patch: Partial<HouseConfig>): Promise<HouseConfig> {
      const existing = await readItem<HouseConfigDoc>(docId.house(), pk.house());
      if (!existing) throw new NotFoundError('HouseConfig', 'singleton');
      const updated: HouseConfig = {
        ...strip<HouseConfig>(existing),
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      const updatedDoc: HouseConfigDoc = {
        pk: pk.house(),
        id: docId.house(),
        entityType: 'HouseConfig',
        ...updated,
      };
      await container.item(docId.house(), pk.house()).replace(updatedDoc, {
        accessCondition: { type: 'IfMatch', condition: existing._etag! },
      });
      return updated;
    },

    // ── Idempotency ────────────────────────────────────────────────────────────

    async getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
      const doc = await readItem<IdempotencyDoc>(docId.idempotency(key), pk.idempotency());
      if (!doc) return null;
      return { key: doc.key, bookingId: doc.bookingId, createdAt: doc.createdAt, ttl: doc.ttl! };
    },

    async putIdempotencyRecord(record: IdempotencyRecord): Promise<void> {
      const doc: IdempotencyDoc = {
        ...record,
        pk: pk.idempotency(),
        id: docId.idempotency(record.key),
        entityType: 'Idempotency',
        ttl: 86400,
      };
      await container.items.upsert(doc);
    },
  };
}
