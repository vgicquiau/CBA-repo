import { vi } from 'vitest';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export type HandlerResult = APIGatewayProxyStructuredResultV2;

export async function callHandler(
  handler: (event: APIGatewayProxyEventV2WithJWTAuthorizer, ctx: unknown, cb: unknown) => Promise<unknown>,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<HandlerResult> {
  return (await handler(event, {}, () => {})) as HandlerResult;
}
import type { Repository } from '../data/repository';
import type { Room, Booking, User, HouseConfig } from '@clos/shared-types';

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

export function makeEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
  authOverrides: { sub?: string; groups?: string } = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  const sub = authOverrides.sub ?? 'user-123';
  const groups = authOverrides.groups ?? 'guest';
  return {
    version: '2.0',
    routeKey: 'GET /test',
    rawPath: '/v1/test',
    rawQueryString: '',
    headers: {},
    isBase64Encoded: false,
    requestContext: {
      accountId: '123',
      apiId: 'abc',
      domainName: 'test',
      domainPrefix: 'test',
      http: { method: 'GET', path: '/v1/test', protocol: 'HTTP/1.1', sourceIp: '1.2.3.4', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: 'GET /test',
      stage: 'dev',
      time: '',
      timeEpoch: 0,
      authorizer: {
        jwt: {
          claims: { sub, 'cognito:groups': groups, email: 'claire@example.com' },
          scopes: [],
        },
        principalId: sub,
        integrationLatency: 0,
      },
    },
    ...overrides,
  } as APIGatewayProxyEventV2WithJWTAuthorizer;
}

export function makeAdminEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return makeEvent(overrides, { sub: 'admin-123', groups: 'admin' });
}
