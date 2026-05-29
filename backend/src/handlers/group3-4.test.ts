import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, makeAdminRequest, makeRepo, mockBooking, callHandler } from '../__tests__/helpers';

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

// ─── bookings-list-mine ──────────────────────────────────────────────────────
describe('GET /v1/bookings/me', () => {
  it('returns 200 with bookings', async () => {
    const { handler } = await import('./bookings-list-mine');
    const res = await callHandler(handler, makeRequest());
    expect(res.status).toBe(200);
    const body = res.jsonBody as { bookings: unknown[] };
    expect(Array.isArray(body.bookings)).toBe(true);
  });
});

// ─── bookings-get ────────────────────────────────────────────────────────────
describe('GET /v1/bookings/{bookingId}', () => {
  it('returns 200 when owner', async () => {
    const { handler } = await import('./bookings-get');
    const req = makeRequest({ params: { bookingId: 'b-123' } });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(200);
  });

  it('returns 403 when not owner', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      findBookingById: vi.fn().mockResolvedValue({ ...mockBooking, userId: 'other-user' }),
    }));
    const { handler } = await import('./bookings-get');
    const req = makeRequest({ params: { bookingId: 'b-123' } });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(403);
  });

  it('returns 404 when not found', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({ findBookingById: vi.fn().mockResolvedValue(null) }));
    const { handler } = await import('./bookings-get');
    const req = makeRequest({ params: { bookingId: 'x' } });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(404);
  });
});

// ─── bookings-create ─────────────────────────────────────────────────────────
describe('POST /v1/bookings', () => {
  it('returns 201 with created booking', async () => {
    const { handler } = await import('./bookings-create');
    const req = makeRequest({
      method: 'POST',
      body: JSON.stringify({ roomId: 'glycine', start: '2026-07-01', end: '2026-07-05', people: 2, name: 'Claire', notes: '' }),
    });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(201);
  });
});

// ─── bookings-update ─────────────────────────────────────────────────────────
describe('PATCH /v1/bookings/{bookingId}', () => {
  it('returns 200 with updated booking', async () => {
    const { handler } = await import('./bookings-update');
    const req = makeRequest({
      method: 'PATCH',
      params: { bookingId: 'b-123' },
      body: JSON.stringify({ notes: 'New note' }),
    });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(200);
  });

  it('returns 403 when not owner', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      findBookingById: vi.fn().mockResolvedValue({ ...mockBooking, userId: 'other' }),
    }));
    const { handler } = await import('./bookings-update');
    const req = makeRequest({
      method: 'PATCH',
      params: { bookingId: 'b-123' },
      body: JSON.stringify({ notes: 'x' }),
    });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(403);
  });
});

// ─── bookings-delete ─────────────────────────────────────────────────────────
describe('DELETE /v1/bookings/{bookingId}', () => {
  it('returns 204', async () => {
    const { handler } = await import('./bookings-delete');
    const req = makeRequest({ method: 'DELETE', params: { bookingId: 'b-123' } });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(204);
  });
});

// ─── admin-dashboard ─────────────────────────────────────────────────────────
describe('GET /v1/admin/dashboard', () => {
  it('returns 200 with dashboard data', async () => {
    const { handler } = await import('./admin-dashboard');
    const res = await callHandler(handler, makeAdminRequest());
    expect(res.status).toBe(200);
    const body = res.jsonBody as { todayCount: number };
    expect(typeof body.todayCount).toBe('number');
  });

  it('returns 403 for guest', async () => {
    const { handler } = await import('./admin-dashboard');
    const res = await callHandler(handler, makeRequest());
    expect(res.status).toBe(403);
  });
});

// ─── admin-bookings-list ─────────────────────────────────────────────────────
describe('GET /v1/admin/bookings', () => {
  it('returns 200 with bookings', async () => {
    const { handler } = await import('./admin-bookings-list');
    const res = await callHandler(handler, makeAdminRequest());
    expect(res.status).toBe(200);
  });
});

// ─── admin-bookings-get ──────────────────────────────────────────────────────
describe('GET /v1/admin/bookings/{bookingId}', () => {
  it('returns 200 with booking', async () => {
    const { handler } = await import('./admin-bookings-get');
    const req = makeAdminRequest({ params: { bookingId: 'b-123' } });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(200);
  });
});

// ─── admin-bookings-create ───────────────────────────────────────────────────
describe('POST /v1/admin/bookings', () => {
  it('returns 201 with created booking', async () => {
    const { handler } = await import('./admin-bookings-create');
    const req = makeAdminRequest({
      method: 'POST',
      body: JSON.stringify({ roomId: 'glycine', start: '2026-07-01', end: '2026-07-05', people: 2, name: 'Pierre', notes: '', userId: null }),
    });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(201);
  });
});

// ─── admin-bookings-update ───────────────────────────────────────────────────
describe('PATCH /v1/admin/bookings/{bookingId}', () => {
  it('returns 200', async () => {
    const { handler } = await import('./admin-bookings-update');
    const req = makeAdminRequest({
      method: 'PATCH',
      params: { bookingId: 'b-123' },
      body: JSON.stringify({ notes: 'Admin note' }),
    });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(200);
  });
});

// ─── admin-bookings-delete ───────────────────────────────────────────────────
describe('DELETE /v1/admin/bookings/{bookingId}', () => {
  it('returns 204', async () => {
    const { handler } = await import('./admin-bookings-delete');
    const req = makeAdminRequest({ method: 'DELETE', params: { bookingId: 'b-123' } });
    const res = await callHandler(handler, req);
    expect(res.status).toBe(204);
  });
});
