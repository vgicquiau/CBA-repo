import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, makeAdminRequest, makeRepo, mockUser, mockRoom, mockHouseConfig, callHandler } from '../__tests__/helpers';

vi.mock('../api/deps', () => ({
  getRepository: vi.fn(),
  getBlobServiceClient: vi.fn(),
  publishEvent: vi.fn().mockResolvedValue(undefined),
  _resetRepository: vi.fn(),
  _resetClients: vi.fn(),
}));

import { getRepository } from '../api/deps';

beforeEach(() => {
  vi.mocked(getRepository).mockReturnValue(makeRepo());
  vi.resetModules();
});

// ─── me-get ──────────────────────────────────────────────────────────────────
describe('GET /v1/me', () => {
  it('returns 200 with user', async () => {
    const { handler } = await import('./me-get');
    const res = await callHandler(handler, makeRequest());
    expect(res.status).toBe(200);
    const body = res.jsonBody as { userId: string };
    expect(body.userId).toBe(mockUser.userId);
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({ getUser: vi.fn().mockResolvedValue(null) }));
    const { handler } = await import('./me-get');
    const res = await callHandler(handler, makeRequest());
    expect(res.status).toBe(404);
  });
});

// ─── house-get ───────────────────────────────────────────────────────────────
describe('GET /v1/house', () => {
  it('returns 200 without address', async () => {
    const { handler } = await import('./house-get');
    const res = await callHandler(handler, makeRequest());
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.address).toBeUndefined();
    expect(body.name).toBe(mockHouseConfig.name);
  });
});

// ─── rooms-list ──────────────────────────────────────────────────────────────
describe('GET /v1/rooms', () => {
  it('returns 200 with rooms array', async () => {
    const { handler } = await import('./rooms-list');
    const res = await callHandler(handler, makeRequest());
    expect(res.status).toBe(200);
    const body = res.jsonBody as { rooms: unknown[] };
    expect(Array.isArray(body.rooms)).toBe(true);
    expect((body.rooms[0] as { roomId: string }).roomId).toBe(mockRoom.roomId);
  });
});

// ─── rooms-get ───────────────────────────────────────────────────────────────
describe('GET /v1/rooms/{roomId}', () => {
  it('returns 200 with room', async () => {
    const { handler } = await import('./rooms-get');
    const req = makeRequest({ params: { roomId: 'glycine' } });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(200);
  });

  it('returns 404 when room not found', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({ getRoom: vi.fn().mockResolvedValue(null) }));
    const { handler } = await import('./rooms-get');
    const req = makeRequest({ params: { roomId: 'unknown' } });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(404);
  });
});

// ─── room-bookings-list ──────────────────────────────────────────────────────
describe('GET /v1/rooms/{roomId}/bookings', () => {
  it('returns 200 with bookings', async () => {
    const { handler } = await import('./room-bookings-list');
    const req = makeRequest({ params: { roomId: 'glycine' } });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(200);
  });
});

// ─── room-availability ───────────────────────────────────────────────────────
describe('GET /v1/rooms/{roomId}/availability', () => {
  it('returns 200 with availability result', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({ listBookingsByRoomInRange: vi.fn().mockResolvedValue([]) }));
    const { handler } = await import('./room-availability');
    const req = makeRequest({
      params: { roomId: 'glycine' },
      query: { start: '2026-07-01', end: '2026-07-05' },
    });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(200);
    const body = res.jsonBody as { available: boolean };
    expect(body.available).toBe(true);
  });

  it('returns 400 when start >= end', async () => {
    const { handler } = await import('./room-availability');
    const req = makeRequest({
      params: { roomId: 'glycine' },
      query: { start: '2026-07-05', end: '2026-07-01' },
    });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(400);
  });
});
