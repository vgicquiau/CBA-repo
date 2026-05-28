import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCosmosRepository } from './repository.cosmos';
import { ConflictError, NotFoundError } from './repository';
import type { Room, Booking, User, HouseConfig } from '@clos/shared-types';

// ─── Mock @azure/cosmos ──────────────────────────────────────────────────────

const mockRead = vi.fn();
const mockCreate = vi.fn();
const mockReplace = vi.fn();
const mockDelete = vi.fn();
const mockUpsert = vi.fn();
const mockQuery = vi.fn();
const mockQueryFn = vi.fn().mockReturnValue({ fetchAll: mockQuery });

vi.mock('@azure/cosmos', () => ({
  CosmosClient: vi.fn().mockImplementation(() => ({
    database: vi.fn().mockReturnValue({
      container: vi.fn().mockReturnValue({
        item: vi.fn().mockReturnValue({
          read: mockRead,
          replace: mockReplace,
          delete: mockDelete,
        }),
        items: {
          create: mockCreate,
          upsert: mockUpsert,
          query: mockQueryFn,
        },
      }),
    }),
  })),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const room: Room = {
  roomId: 'glycine',
  name: 'La Glycine',
  wing: 'Aile gauche',
  floor: 0,
  area: 18,
  capacity: 2,
  beds: '1 lit double',
  closet: 'Armoire normande',
  equipment: ['Wi-Fi'],
  linen: ['Draps fournis'],
  pricePerPerson: 25,
  photoTint: 'vert',
  blurb: 'Petite chambre cosy.',
  photoUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const booking: Booking = {
  bookingId: 'b1',
  roomId: 'glycine',
  userId: 'user1',
  name: 'Claire Dupont',
  start: '2026-06-01',
  end: '2026-06-05',
  people: 2,
  notes: '',
  reference: 'CLOS-12345678',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'user1',
};

const user: User = {
  userId: 'user1',
  email: 'claire@example.com',
  displayName: 'Claire',
  role: 'guest',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const houseConfig: HouseConfig = {
  name: 'Le Clos Bon Accueil',
  region: 'Normandie',
  address: '1 chemin',
  welcomeNote: 'Bienvenue',
  wings: ['Aile gauche'],
  equipmentSuggestions: ['Wi-Fi'],
  linenSuggestions: ['Draps fournis'],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeRoomDoc(r: Room) {
  return { pk: `ROOM#${r.roomId}`, id: `ROOM#${r.roomId}#METADATA`, entityType: 'Room', _etag: '"etag1"', ...r };
}

function makeBookingDoc(b: Booking) {
  return { pk: `ROOM#${b.roomId}`, id: `BOOKING#${b.bookingId}`, entityType: 'Booking', _etag: '"etag2"', ...b };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryFn.mockReturnValue({ fetchAll: mockQuery });
  process.env.COSMOS_ENDPOINT = 'https://localhost:8081';
  process.env.COSMOS_KEY = 'test-key';
});

describe('createCosmosRepository', () => {
  describe('Rooms', () => {
    it('getRoom returns room when found', async () => {
      mockRead.mockResolvedValue({ resource: makeRoomDoc(room) });
      const repo = createCosmosRepository();
      const result = await repo.getRoom('glycine');
      expect(result).toMatchObject({ roomId: 'glycine', name: 'La Glycine' });
      expect(result).not.toHaveProperty('pk');
      expect(result).not.toHaveProperty('entityType');
    });

    it('getRoom returns null when not found', async () => {
      mockRead.mockRejectedValue({ code: 404 });
      const repo = createCosmosRepository();
      const result = await repo.getRoom('nonexistent');
      expect(result).toBeNull();
    });

    it('listRooms returns all rooms', async () => {
      mockQuery.mockResolvedValue({ resources: [makeRoomDoc(room)] });
      const repo = createCosmosRepository();
      const result = await repo.listRooms();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ roomId: 'glycine' });
    });

    it('createRoom creates and returns the room', async () => {
      mockCreate.mockResolvedValue({ resource: makeRoomDoc(room) });
      const repo = createCosmosRepository();
      const result = await repo.createRoom(room);
      expect(result).toEqual(room);
      expect(mockCreate).toHaveBeenCalledOnce();
      const created = mockCreate.mock.calls[0][0];
      expect(created.pk).toBe('ROOM#glycine');
      expect(created.entityType).toBe('Room');
    });

    it('updateRoom throws NotFoundError when room does not exist', async () => {
      mockRead.mockRejectedValue({ code: 404 });
      const repo = createCosmosRepository();
      await expect(repo.updateRoom('glycine', { name: 'Updated' })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('updateRoom updates and returns the room', async () => {
      mockRead.mockResolvedValue({ resource: makeRoomDoc(room) });
      mockReplace.mockResolvedValue({ resource: makeRoomDoc({ ...room, name: 'Updated' }) });
      const repo = createCosmosRepository();
      const result = await repo.updateRoom('glycine', { name: 'Updated' });
      expect(result.name).toBe('Updated');
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated' }),
        expect.objectContaining({ accessCondition: { type: 'IfMatch', condition: '"etag1"' } }),
      );
    });

    it('deleteRoom throws NotFoundError when room does not exist', async () => {
      mockRead.mockRejectedValue({ code: 404 });
      const repo = createCosmosRepository();
      await expect(repo.deleteRoom('nonexistent')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('deleteRoom deletes room and its bookings', async () => {
      mockRead.mockResolvedValue({ resource: makeRoomDoc(room) });
      mockQuery.mockResolvedValue({ resources: [makeBookingDoc(booking)] });
      mockDelete.mockResolvedValue({});
      const repo = createCosmosRepository();
      const result = await repo.deleteRoom('glycine');
      expect(result.cancelledBookings).toHaveLength(1);
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('Bookings', () => {
    it('getBooking returns booking when found', async () => {
      mockRead.mockResolvedValue({ resource: makeBookingDoc(booking) });
      const repo = createCosmosRepository();
      const result = await repo.getBooking('glycine', '2026-06-01', 'b1');
      expect(result).toMatchObject({ bookingId: 'b1' });
    });

    it('getBooking returns null when not found', async () => {
      mockRead.mockRejectedValue({ code: 404 });
      const repo = createCosmosRepository();
      const result = await repo.getBooking('glycine', '2026-06-01', 'nonexistent');
      expect(result).toBeNull();
    });

    it('findBookingById returns booking via cross-partition query', async () => {
      mockQuery.mockResolvedValue({ resources: [makeBookingDoc(booking)] });
      const repo = createCosmosRepository();
      const result = await repo.findBookingById('b1');
      expect(result).toMatchObject({ bookingId: 'b1' });
    });

    it('findBookingById returns null when not found', async () => {
      mockQuery.mockResolvedValue({ resources: [] });
      const repo = createCosmosRepository();
      const result = await repo.findBookingById('nonexistent');
      expect(result).toBeNull();
    });

    it('createBooking succeeds when no conflicts', async () => {
      mockQuery.mockResolvedValue({ resources: [] });
      mockCreate.mockResolvedValue({ resource: makeBookingDoc(booking) });
      mockUpsert.mockResolvedValue({});
      const repo = createCosmosRepository();
      const result = await repo.createBooking(booking);
      expect(result).toEqual(booking);
      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockUpsert).toHaveBeenCalledOnce();
    });

    it('createBooking throws ConflictError when dates overlap', async () => {
      const conflicting = makeBookingDoc({ ...booking, bookingId: 'b2', start: '2026-06-03', end: '2026-06-07' });
      mockQuery.mockResolvedValue({ resources: [conflicting] });
      const repo = createCosmosRepository();
      await expect(repo.createBooking(booking)).rejects.toBeInstanceOf(ConflictError);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('createBooking does not throw when bookings are adjacent (no overlap)', async () => {
      const adjacent = makeBookingDoc({ ...booking, bookingId: 'b2', start: '2026-06-05', end: '2026-06-10' });
      mockQuery.mockResolvedValue({ resources: [adjacent] });
      mockCreate.mockResolvedValue({});
      mockUpsert.mockResolvedValue({});
      const repo = createCosmosRepository();
      await expect(repo.createBooking(booking)).resolves.toEqual(booking);
    });

    it('createBooking with idempotency: duplicate key returns stored booking via idempotency check', async () => {
      // The handler-level idempotency check calls getIdempotencyRecord then createBooking.
      // At repo level: createBooking just creates; 409 from Cosmos on duplicate id is propagated.
      // This test verifies the repo doesn't suppress the Cosmos 409 conflict.
      mockQuery.mockResolvedValue({ resources: [] });
      const cosmosConflict = Object.assign(new Error('Conflict'), { code: 409 });
      mockCreate.mockRejectedValue(cosmosConflict);
      const repo = createCosmosRepository();
      await expect(repo.createBooking(booking)).rejects.toMatchObject({ code: 409 });
    });

    it('updateBooking throws NotFoundError when booking does not exist', async () => {
      mockRead.mockRejectedValue({ code: 404 });
      const repo = createCosmosRepository();
      await expect(repo.updateBooking(booking)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('updateBooking replaces the booking document', async () => {
      mockRead.mockResolvedValue({ resource: makeBookingDoc(booking) });
      mockReplace.mockResolvedValue({ resource: makeBookingDoc(booking) });
      const repo = createCosmosRepository();
      const result = await repo.updateBooking(booking);
      expect(result).toEqual(booking);
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'b1' }),
        expect.objectContaining({ accessCondition: { type: 'IfMatch', condition: '"etag2"' } }),
      );
    });

    it('deleteBooking throws NotFoundError when booking does not exist', async () => {
      mockRead.mockRejectedValue({ code: 404 });
      const repo = createCosmosRepository();
      await expect(repo.deleteBooking('glycine', '2026-06-01', 'nonexistent')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('deleteBooking deletes booking and guest ref', async () => {
      mockRead.mockResolvedValue({ resource: makeBookingDoc(booking) });
      mockDelete.mockResolvedValue({});
      const repo = createCosmosRepository();
      await repo.deleteBooking('glycine', '2026-06-01', 'b1');
      expect(mockDelete).toHaveBeenCalledTimes(2);
    });

    it('listBookingsByRoom filters by fromDate', async () => {
      mockQuery.mockResolvedValue({ resources: [makeBookingDoc(booking)] });
      const repo = createCosmosRepository();
      await repo.listBookingsByRoom('glycine', '2026-06-01');
      const querySpec = mockQueryFn.mock.calls[0];
      expect(JSON.stringify(querySpec)).toContain('@from');
    });

    it('listMyBookings resolves guest refs to bookings', async () => {
      const ref: BookingRefDoc = {
        pk: 'GUEST#user1', id: 'BOOKING_REF#b1', entityType: 'BookingRef', roomId: 'glycine', bookingId: 'b1',
      };
      mockQuery.mockResolvedValue({ resources: [ref] });
      mockRead.mockResolvedValue({ resource: makeBookingDoc(booking) });
      const repo = createCosmosRepository();
      const result = await repo.listMyBookings('user1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ bookingId: 'b1' });
    });
  });

  describe('Users', () => {
    it('getUser returns user when found', async () => {
      mockRead.mockResolvedValue({ resource: { pk: 'USER#user1', id: 'USER#user1#METADATA', entityType: 'User', ...user } });
      const repo = createCosmosRepository();
      const result = await repo.getUser('user1');
      expect(result).toMatchObject({ userId: 'user1' });
      expect(result).not.toHaveProperty('entityType');
    });

    it('getUser returns null when not found', async () => {
      mockRead.mockRejectedValue({ code: 404 });
      const repo = createCosmosRepository();
      const result = await repo.getUser('nonexistent');
      expect(result).toBeNull();
    });

    it('createUser creates and returns the user', async () => {
      mockCreate.mockResolvedValue({});
      const repo = createCosmosRepository();
      const result = await repo.createUser(user);
      expect(result).toEqual(user);
    });
  });

  describe('HouseConfig', () => {
    it('getHouseConfig throws NotFoundError when not seeded', async () => {
      mockRead.mockRejectedValue({ code: 404 });
      const repo = createCosmosRepository();
      await expect(repo.getHouseConfig()).rejects.toBeInstanceOf(NotFoundError);
    });

    it('getHouseConfig returns config when found', async () => {
      mockRead.mockResolvedValue({
        resource: { pk: 'HOUSE_CONFIG', id: 'HOUSE_CONFIG#MAIN', entityType: 'HouseConfig', _etag: '"e1"', ...houseConfig },
      });
      const repo = createCosmosRepository();
      const result = await repo.getHouseConfig();
      expect(result).toMatchObject({ name: 'Le Clos Bon Accueil' });
    });

    it('updateHouseConfig merges patch and updates updatedAt', async () => {
      mockRead.mockResolvedValue({
        resource: { pk: 'HOUSE_CONFIG', id: 'HOUSE_CONFIG#MAIN', entityType: 'HouseConfig', _etag: '"e1"', ...houseConfig },
      });
      mockReplace.mockResolvedValue({});
      const repo = createCosmosRepository();
      const result = await repo.updateHouseConfig({ welcomeNote: 'Nouveau mot' });
      expect(result.welcomeNote).toBe('Nouveau mot');
      expect(result.name).toBe('Le Clos Bon Accueil');
      expect(result.updatedAt).not.toBe(houseConfig.updatedAt);
    });
  });

  describe('Idempotency', () => {
    it('getIdempotencyRecord returns null when key not found', async () => {
      mockRead.mockRejectedValue({ code: 404 });
      const repo = createCosmosRepository();
      const result = await repo.getIdempotencyRecord('some-key');
      expect(result).toBeNull();
    });

    it('getIdempotencyRecord returns record when found', async () => {
      const record = { key: 'key1', bookingId: 'b1', createdAt: '2026-01-01T00:00:00.000Z', ttl: 86400 };
      mockRead.mockResolvedValue({
        resource: { pk: 'IDEMPOTENCY', id: 'IDEMPOTENCY#key1', entityType: 'Idempotency', ...record },
      });
      const repo = createCosmosRepository();
      const result = await repo.getIdempotencyRecord('key1');
      expect(result).toMatchObject({ key: 'key1', bookingId: 'b1' });
    });

    it('putIdempotencyRecord upserts with TTL 86400', async () => {
      mockUpsert.mockResolvedValue({});
      const repo = createCosmosRepository();
      await repo.putIdempotencyRecord({ key: 'key1', bookingId: 'b1', createdAt: '2026-01-01T00:00:00.000Z', ttl: 86400 });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ ttl: 86400, entityType: 'Idempotency' }),
      );
    });
  });
});

// Type alias for test
type BookingRefDoc = {
  pk: string; id: string; entityType: 'BookingRef'; roomId: string; bookingId: string;
};
