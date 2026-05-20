import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Room, Booking, User, HouseConfig } from '@clos/shared-types';

export interface IdempotencyRecord {
  key: string;
  bookingId: string;
  createdAt: string;
  ttl: number;  // epoch seconds
}

export interface Repository {
  // Rooms
  getRoom(roomId: string): Promise<Room | null>;
  listRooms(): Promise<Room[]>;
  createRoom(room: Room): Promise<Room>;
  updateRoom(roomId: string, patch: Partial<Room>): Promise<Room>;
  deleteRoom(roomId: string): Promise<{ cancelledBookings: Booking[] }>;

  // Bookings
  getBooking(roomId: string, start: string, bookingId: string): Promise<Booking | null>;
  findBookingById(bookingId: string): Promise<Booking | null>;
  listBookingsByRoom(roomId: string, fromDate?: string): Promise<Booking[]>;
  listBookingsByRoomInRange(roomId: string, start: string, end: string): Promise<Booking[]>;
  listMyBookings(userId: string): Promise<Booking[]>;
  listAllBookings(opts?: { fromDate?: string; toDate?: string }): Promise<Booking[]>;
  searchBookings(text: string): Promise<Booking[]>;
  createBooking(booking: Booking): Promise<Booking>;
  updateBooking(booking: Booking): Promise<Booking>;
  deleteBooking(roomId: string, start: string, bookingId: string): Promise<void>;

  // Users
  getUser(userId: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  createUser(user: User): Promise<User>;

  // House config
  getHouseConfig(): Promise<HouseConfig>;
  updateHouseConfig(patch: Partial<HouseConfig>): Promise<HouseConfig>;

  // Idempotency
  getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null>;
  putIdempotencyRecord(record: IdempotencyRecord): Promise<void>;
}

// Erreurs métier typées — JAMAIS de Error nue dans le code handler
export class ConflictError extends Error {
  constructor(public readonly conflictingBookings: Booking[]) {
    super('Booking conflict');
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends Error {
  constructor(public readonly entity: string, public readonly id: string) {
    super(`${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(public readonly field: string, public readonly reason: string) {
    super(`Validation failed on ${field}: ${reason}`);
    this.name = 'ValidationError';
  }
}

export class CapacityReductionError extends Error {
  constructor(public readonly blockingBookings: Booking[]) {
    super('Capacity reduction blocked');
    this.name = 'CapacityReductionError';
  }
}

export class ForbiddenError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'ForbiddenError';
  }
}

// Stub factory — implémentation DynamoDB réelle à ajouter en P3+
export function createRepository(
  _ddb: DynamoDBDocumentClient,
  _tableName: string,
): Repository {
  return {
    async getRoom(_roomId) { return null; },
    async listRooms() { return []; },
    async createRoom(room) { return room; },
    async updateRoom(_roomId, _patch) { throw new NotFoundError('Room', _roomId); },
    async deleteRoom(_roomId) { return { cancelledBookings: [] }; },

    async getBooking(_roomId, _start, _bookingId) { return null; },
    async findBookingById(_bookingId) { return null; },
    async listBookingsByRoom(_roomId, _fromDate) { return []; },
    async listBookingsByRoomInRange(_roomId, _start, _end) { return []; },
    async listMyBookings(_userId) { return []; },
    async listAllBookings(_opts) { return []; },
    async searchBookings(_text) { return []; },
    async createBooking(booking) { return booking; },
    async updateBooking(booking) { return booking; },
    async deleteBooking(_roomId, _start, _bookingId) { return; },

    async getUser(_userId) { return null; },
    async listUsers() { return []; },
    async createUser(user) { return user; },

    async getHouseConfig() { throw new NotFoundError('HouseConfig', 'singleton'); },
    async updateHouseConfig(_patch) { throw new NotFoundError('HouseConfig', 'singleton'); },

    async getIdempotencyRecord(_key) { return null; },
    async putIdempotencyRecord(_record) { return; },
  };
}
