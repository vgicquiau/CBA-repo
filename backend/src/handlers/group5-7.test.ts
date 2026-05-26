import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeEvent, makeAdminEvent, makeRepo, mockHouseConfig, callHandler } from '../__tests__/helpers';

vi.mock('../api/deps', () => ({
  getRepository: vi.fn(),
  getCognitoClient: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue({ User: { Attributes: [{ Name: 'sub', Value: 'new-sub-123' }] } }),
  }),
  getS3Client: vi.fn().mockReturnValue({}),
  getSnsClient: vi.fn(),
  publishEvent: vi.fn().mockResolvedValue(undefined),
  _resetRepository: vi.fn(),
  _resetClients: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned?sig=abc'),
}));

import { getRepository } from '../api/deps';

beforeEach(() => {
  vi.mocked(getRepository).mockReturnValue(makeRepo());
  vi.resetModules();
});

// ─── admin-rooms-create ──────────────────────────────────────────────────────
describe('POST /v1/admin/rooms', () => {
  it('returns 201 with created room', async () => {
    const { handler } = await import('./admin-rooms-create');
    const event = makeAdminEvent({
      body: JSON.stringify({
        roomId: 'nouvelle', name: 'La Nouvelle', wing: 'Aile gauche',
        floor: 0, area: 15, capacity: 2, beds: '1 lit double',
        equipment: [], linen: [], pricePerPerson: 25, photoTint: 'lin', blurb: '',
      }),
    });
    const res = await callHandler(handler as never, event);
    expect(res.statusCode).toBe(201);
  });
});

// ─── admin-rooms-update ──────────────────────────────────────────────────────
describe('PATCH /v1/admin/rooms/{roomId}', () => {
  it('returns 200', async () => {
    const { handler } = await import('./admin-rooms-update');
    const event = makeAdminEvent({
      pathParameters: { roomId: 'glycine' },
      body: JSON.stringify({ name: 'La Glycine Modifiée' }),
    });
    const res = await callHandler(handler as never, event);
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when room not found', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({ getRoom: vi.fn().mockResolvedValue(null) }));
    const { handler } = await import('./admin-rooms-update');
    const event = makeAdminEvent({
      pathParameters: { roomId: 'unknown' },
      body: JSON.stringify({ name: 'X' }),
    });
    const res = await callHandler(handler as never, event);
    expect(res.statusCode).toBe(404);
  });
});

// ─── admin-rooms-delete ──────────────────────────────────────────────────────
describe('DELETE /v1/admin/rooms/{roomId}', () => {
  it('returns 200 with deletedRoomId', async () => {
    const { handler } = await import('./admin-rooms-delete');
    const event = makeAdminEvent({ pathParameters: { roomId: 'glycine' } });
    const res = await callHandler(handler as never, event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.deletedRoomId).toBe('glycine');
  });
});

// ─── admin-rooms-photo-url ───────────────────────────────────────────────────
describe('POST /v1/admin/rooms/{roomId}/photo-upload-url', () => {
  it('returns 200 with uploadUrl', async () => {
    const { handler } = await import('./admin-rooms-photo-url');
    const event = makeAdminEvent({ pathParameters: { roomId: 'glycine' } });
    const res = await callHandler(handler as never, event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(typeof body.uploadUrl).toBe('string');
  });
});

// ─── admin-users-list ────────────────────────────────────────────────────────
describe('GET /v1/admin/users', () => {
  it('returns 200 with users', async () => {
    const { handler } = await import('./admin-users-list');
    const res = await callHandler(handler as never, makeAdminEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(Array.isArray(body.users)).toBe(true);
  });
});

// ─── admin-users-invite ──────────────────────────────────────────────────────
describe('POST /v1/admin/users/invite', () => {
  it('returns 201 with user', async () => {
    const { handler } = await import('./admin-users-invite');
    const event = makeAdminEvent({
      body: JSON.stringify({ email: 'new@example.com', displayName: 'Pierre', role: 'guest' }),
    });
    const res = await callHandler(handler as never, event);
    expect(res.statusCode).toBe(201);
  });
});

// ─── admin-users-delete ──────────────────────────────────────────────────────
describe('DELETE /v1/admin/users/{userId}', () => {
  it('returns 200 with deletedUserId', async () => {
    const { handler } = await import('./admin-users-delete');
    const event = makeAdminEvent({ pathParameters: { userId: 'user-123' } });
    const res = await callHandler(handler as never, event);
    expect(res.statusCode).toBe(200);
  });
});

// ─── admin-house-get ─────────────────────────────────────────────────────────
describe('GET /v1/admin/house', () => {
  it('returns 200 with address included', async () => {
    const { handler } = await import('./admin-house-get');
    const res = await callHandler(handler as never, makeAdminEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.address).toBe(mockHouseConfig.address);
  });
});

// ─── admin-house-update ──────────────────────────────────────────────────────
describe('PATCH /v1/admin/house', () => {
  it('returns 200 with updated config', async () => {
    const { handler } = await import('./admin-house-update');
    const event = makeAdminEvent({ body: JSON.stringify({ welcomeNote: 'Nouveau mot.' }) });
    const res = await callHandler(handler as never, event);
    expect(res.statusCode).toBe(200);
  });
});

// ─── me-delete ───────────────────────────────────────────────────────────────
describe('DELETE /v1/me', () => {
  it('returns 204', async () => {
    const { handler } = await import('./me-delete');
    const res = await callHandler(handler as never, makeEvent());
    expect(res.statusCode).toBe(204);
  });
});

// ─── me-export ───────────────────────────────────────────────────────────────
describe('GET /v1/me/export', () => {
  it('returns 200 with user and bookings', async () => {
    const { handler } = await import('./me-export');
    const res = await callHandler(handler as never, makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.user).toBeDefined();
    expect(Array.isArray(body.bookings)).toBe(true);
  });
});
