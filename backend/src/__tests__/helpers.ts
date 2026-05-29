import { vi } from 'vitest';
import { HttpRequest, InvocationContext } from '@azure/functions';
import type { HttpResponseInit } from '@azure/functions';
import type { Repository } from '../data/repository';
import type { Room, Booking, User, HouseConfig } from '@clos/shared-types';

export type HandlerResult = HttpResponseInit;

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `fakeheader.${payload}.fakesig`;
}

// ─── Request factory ──────────────────────────────────────────────────────────

export function makeRequest(
  overrides: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: string | null;
  } = {},
  authOverrides: { oid?: string; roles?: string[] } = {},
): HttpRequest {
  const oid = authOverrides.oid ?? 'user-123';
  const roles = authOverrides.roles ?? ['guest'];
  const jwt = makeJwt({ oid, roles, email: 'claire@example.com' });

  return new HttpRequest({
    method: overrides.method ?? (overrides.body != null ? 'POST' : 'GET'),
    url: overrides.url ?? 'https://localhost/v1/test',
    headers: {
      'x-forwarded-user': jwt,
      ...(overrides.headers ?? {}),
    },
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body != null ? { string: overrides.body } : undefined,
  });
}

export function makeAdminRequest(
  overrides: Parameters<typeof makeRequest>[0] = {},
): HttpRequest {
  return makeRequest(overrides, { oid: 'admin-123', roles: ['admin'] });
}

// Backward-compat aliases: group3-4.test.ts and group5-7.test.ts pass
// { pathParameters, body } in the old AWS Lambda event shape.
type LegacyOpts = {
  pathParameters?: Record<string, string>;
  body?: string | null;
  query?: Record<string, string>;
  headers?: Record<string, string>;
};
export function makeEvent(opts: LegacyOpts = {}): HttpRequest {
  return makeRequest({ params: opts.pathParameters, body: opts.body, query: opts.query, headers: opts.headers });
}
export function makeAdminEvent(opts: LegacyOpts = {}): HttpRequest {
  return makeAdminRequest({ params: opts.pathParameters, body: opts.body, query: opts.query, headers: opts.headers });
}

export function makeContext(): InvocationContext {
  return new InvocationContext({ functionName: 'test' });
}

export async function callHandler(
  handler: (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>,
  request: HttpRequest,
): Promise<HandlerResult> {
  return handler(request, makeContext());
}

// ─── Mock data ────────────────────────────────────────────────────────────────

export const mockRoom: Room = {
  roomId: 'glycine', name: 'La Glycine', wing: 'Aile gauche', floor: 1,
  area: 22, capacity: 2, beds: '1 lit double', closet: 'Armoire ancienne',
  equipment: ['Bureau'], linen: ['Draps fournis'], pricePerPerson: 28,
  photoTint: 'rosé', blurb: 'Belle chambre.', photoUrl: null,
  createdAt: '2026-05-01T10:00:00.000Z', updatedAt: '2026-05-01T10:00:00.000Z',
};

export const mockBooking: Booking = {
  bookingId: 'b-123', roomId: 'glycine', userId: 'user-123',
  name: 'Claire', start: '2026-06-01', end: '2026-06-05',
  people: 2, notes: '', reference: 'CLOS-ABCD1234',
  createdAt: '2026-05-01T10:00:00.000Z', updatedAt: '2026-05-01T10:00:00.000Z',
  createdBy: 'user-123',
};

export const mockUser: User = {
  userId: 'user-123', email: 'claire@example.com',
  displayName: 'Claire', role: 'guest',
  createdAt: '2026-05-01T10:00:00.000Z',
};

export const mockHouseConfig: HouseConfig = {
  name: 'Le Clos Bon Accueil', region: 'Normandie',
  address: '5 chemin du Verger, 14XXX',
  welcomeNote: 'Les hortensias sont en fleur.',
  wings: ['Aile gauche', 'Aile droite'],
  equipmentSuggestions: ['Bureau', 'Velux'],
  linenSuggestions: ['Draps fournis'],
  updatedAt: '2026-05-01T10:00:00.000Z',
};

export function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    getRoom: vi.fn().mockResolvedValue(mockRoom),
    listRooms: vi.fn().mockResolvedValue([mockRoom]),
    createRoom: vi.fn().mockResolvedValue(mockRoom),
    updateRoom: vi.fn().mockResolvedValue(mockRoom),
    deleteRoom: vi.fn().mockResolvedValue({ cancelledBookings: [] }),
    getBooking: vi.fn().mockResolvedValue(mockBooking),
    findBookingById: vi.fn().mockResolvedValue(mockBooking),
    listBookingsByRoom: vi.fn().mockResolvedValue([mockBooking]),
    listBookingsByRoomInRange: vi.fn().mockResolvedValue([]),
    listMyBookings: vi.fn().mockResolvedValue([mockBooking]),
    listAllBookings: vi.fn().mockResolvedValue([mockBooking]),
    searchBookings: vi.fn().mockResolvedValue([mockBooking]),
    createBooking: vi.fn().mockResolvedValue(mockBooking),
    updateBooking: vi.fn().mockResolvedValue(mockBooking),
    deleteBooking: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue(mockUser),
    listUsers: vi.fn().mockResolvedValue([mockUser]),
    createUser: vi.fn().mockResolvedValue(mockUser),
    getHouseConfig: vi.fn().mockResolvedValue(mockHouseConfig),
    updateHouseConfig: vi.fn().mockResolvedValue(mockHouseConfig),
    getIdempotencyRecord: vi.fn().mockResolvedValue(null),
    putIdempotencyRecord: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
