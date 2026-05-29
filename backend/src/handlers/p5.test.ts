import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRepo, mockUser, mockBooking } from '../__tests__/helpers';

// ─── ACS Email mock ───────────────────────────────────────────────────────────

const mockPollUntilDone = vi.fn();
const mockBeginSend = vi.fn();

vi.mock('@azure/communication-email', () => ({
  EmailClient: vi.fn().mockImplementation(() => ({ beginSend: mockBeginSend })),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({})),
}));

// ─── deps mock ────────────────────────────────────────────────────────────────

vi.mock('../api/deps', () => ({
  getRepository: vi.fn(),
  getBlobServiceClient: vi.fn(),
  publishEvent: vi.fn().mockResolvedValue(undefined),
  _resetRepository: vi.fn(),
  _resetClients: vi.fn(),
}));

import { getRepository, publishEvent } from '../api/deps';

beforeEach(() => {
  vi.mocked(getRepository).mockReturnValue(makeRepo());
  vi.mocked(publishEvent).mockClear();
  mockBeginSend.mockClear();
  mockBeginSend.mockResolvedValue({ pollUntilDone: mockPollUntilDone });
  mockPollUntilDone.mockClear();
  mockPollUntilDone.mockResolvedValue({ status: 'Succeeded' });
  process.env.ACS_ENDPOINT = 'test.communication.azure.com';
  process.env.EMAIL_FROM_ADDRESS = 'noreply@test.fr';
  process.env.ADMIN_EMAIL = 'admin@test.fr';
  vi.resetModules();
});

// ─── notification-dispatcher ─────────────────────────────────────────────────
// Tests the exported `dispatch()` function directly.

describe('notification-dispatcher dispatch()', () => {
  it('sends confirmation email to guest on BOOKING_CREATED', async () => {
    const { dispatch } = await import('./notification-dispatcher');
    await dispatch({ type: 'BOOKING_CREATED', bookingId: 'b-123', userId: 'user-123', roomId: 'glycine', start: '2026-07-01', end: '2026-07-05' });
    expect(mockBeginSend).toHaveBeenCalledOnce();
    const msg = mockBeginSend.mock.calls[0][0];
    expect(msg.recipients.to[0].address).toBe(mockUser.email);
    expect(msg.content.subject).toContain('Confirmation');
    expect(msg.content.html).toContain('b-123');
  });

  it('sends update email to guest on BOOKING_UPDATED', async () => {
    const { dispatch } = await import('./notification-dispatcher');
    await dispatch({ type: 'BOOKING_UPDATED', bookingId: 'b-123', userId: 'user-123', roomId: 'glycine', changes: {} });
    expect(mockBeginSend).toHaveBeenCalledOnce();
    const msg = mockBeginSend.mock.calls[0][0];
    expect(msg.recipients.to[0].address).toBe(mockUser.email);
    expect(msg.content.subject).toContain('Modification');
  });

  it('sends cancellation email to guest on BOOKING_CANCELLED (USER_CANCELLED)', async () => {
    const { dispatch } = await import('./notification-dispatcher');
    await dispatch({ type: 'BOOKING_CANCELLED', bookingId: 'b-123', userId: 'user-123', roomId: 'glycine', reason: 'USER_CANCELLED' });
    expect(mockBeginSend).toHaveBeenCalledOnce();
    const msg = mockBeginSend.mock.calls[0][0];
    expect(msg.recipients.to[0].address).toBe(mockUser.email);
    expect(msg.content.subject).toContain('Annulation');
  });

  it('skips email on BOOKING_CANCELLED with reason USER_DELETED', async () => {
    const { dispatch } = await import('./notification-dispatcher');
    await dispatch({ type: 'BOOKING_CANCELLED', bookingId: 'b-123', userId: 'user-123', roomId: 'glycine', reason: 'USER_DELETED' });
    expect(mockBeginSend).not.toHaveBeenCalled();
  });

  it('skips email when userId is null', async () => {
    const { dispatch } = await import('./notification-dispatcher');
    await dispatch({ type: 'BOOKING_CREATED', bookingId: 'b-123', userId: null, roomId: 'glycine', start: '2026-07-01', end: '2026-07-05' });
    expect(mockBeginSend).not.toHaveBeenCalled();
  });

  it('sends conflict alert to admin email on BOOKING_CONFLICT_DETECTED', async () => {
    const { dispatch } = await import('./notification-dispatcher');
    await dispatch({ type: 'BOOKING_CONFLICT_DETECTED', bookingIds: ['b-1', 'b-2'], roomId: 'glycine', detectedAt: '2026-05-26T01:00:00.000Z' });
    expect(mockBeginSend).toHaveBeenCalledOnce();
    const msg = mockBeginSend.mock.calls[0][0];
    expect(msg.recipients.to[0].address).toBe('admin@test.fr');
    expect(msg.content.subject).toContain('ALERTE');
    expect(msg.content.html).toContain('b-1');
  });

  it('skips email on USER_INVITED (Entra handles it)', async () => {
    const { dispatch } = await import('./notification-dispatcher');
    await dispatch({ type: 'USER_INVITED', userId: 'u-1', email: 'x@x.com', role: 'guest' });
    expect(mockBeginSend).not.toHaveBeenCalled();
  });

  it('skips email when user not found', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      getUser: vi.fn().mockResolvedValue(null),
    }));
    const { dispatch } = await import('./notification-dispatcher');
    await expect(dispatch({ type: 'BOOKING_CREATED', bookingId: 'b-123', userId: 'missing-user', roomId: 'glycine', start: '2026-07-01', end: '2026-07-05' })).resolves.toBeUndefined();
    expect(mockBeginSend).not.toHaveBeenCalled();
  });

  it('uses EMAIL_FROM_ADDRESS env var as senderAddress', async () => {
    const { dispatch } = await import('./notification-dispatcher');
    await dispatch({ type: 'BOOKING_CREATED', bookingId: 'b-123', userId: 'user-123', roomId: 'glycine', start: '2026-07-01', end: '2026-07-05' });
    const msg = mockBeginSend.mock.calls[0][0];
    expect(msg.senderAddress).toBe('noreply@test.fr');
  });
});

// ─── reconciliation-job ───────────────────────────────────────────────────────

describe('reconciliation-job run()', () => {
  it('calls publishEvent with BOOKING_CONFLICT_DETECTED when overlapping', async () => {
    const overlapping = { ...mockBooking, bookingId: 'b-456', start: '2026-06-03', end: '2026-06-08' };
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      listAllBookings: vi.fn().mockResolvedValue([mockBooking, overlapping]),
    }));
    const { run } = await import('./reconciliation-job');
    await run({}, {} as never);
    expect(vi.mocked(publishEvent)).toHaveBeenCalledOnce();
    const call = vi.mocked(publishEvent).mock.calls[0][0];
    expect(call.type).toBe('BOOKING_CONFLICT_DETECTED');
    expect((call as { roomId: string }).roomId).toBe('glycine');
  });

  it('does not call publishEvent when bookings do not overlap', async () => {
    const nonOverlapping = { ...mockBooking, bookingId: 'b-789', start: '2026-06-10', end: '2026-06-15' };
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      listAllBookings: vi.fn().mockResolvedValue([mockBooking, nonOverlapping]),
    }));
    const { run } = await import('./reconciliation-job');
    await run({}, {} as never);
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it('does not call publishEvent when bookings list is empty', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      listAllBookings: vi.fn().mockResolvedValue([]),
    }));
    const { run } = await import('./reconciliation-job');
    await expect(run({}, {} as never)).resolves.toBeUndefined();
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it('calls publishEvent once per conflicting room', async () => {
    const b2 = { ...mockBooking, bookingId: 'b-2', start: '2026-06-03', end: '2026-06-08' };
    const b3 = { ...mockBooking, bookingId: 'b-3', start: '2026-06-04', end: '2026-06-06' };
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      listAllBookings: vi.fn().mockResolvedValue([mockBooking, b2, b3]),
    }));
    const { run } = await import('./reconciliation-job');
    await run({}, {} as never);
    expect(vi.mocked(publishEvent)).toHaveBeenCalledOnce();
    const call = vi.mocked(publishEvent).mock.calls[0][0] as { bookingIds: string[] };
    expect(call.bookingIds.length).toBeGreaterThanOrEqual(2);
  });
});
