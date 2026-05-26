import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRepo, mockBooking, mockUser } from '../__tests__/helpers';

vi.mock('../api/deps', () => ({
  getRepository: vi.fn(),
  getSesClient: vi.fn(),
  getSsmClient: vi.fn(),
  getSnsClient: vi.fn(),
  _resetRepository: vi.fn(),
  _resetClients: vi.fn(),
}));

import { getRepository, getSesClient, getSsmClient, getSnsClient } from '../api/deps';

const sesSend = vi.fn().mockResolvedValue({});
const ssmSend = vi.fn().mockResolvedValue({ Parameter: { Value: 'admin@example.com' } });
const snsSend = vi.fn().mockResolvedValue({});

beforeEach(() => {
  vi.mocked(getRepository).mockReturnValue(makeRepo());
  vi.mocked(getSesClient).mockReturnValue({ send: sesSend } as never);
  vi.mocked(getSsmClient).mockReturnValue({ send: ssmSend } as never);
  vi.mocked(getSnsClient).mockReturnValue({ send: snsSend } as never);
  sesSend.mockClear();
  ssmSend.mockClear();
  snsSend.mockClear();
  vi.resetModules();
});

// ─── auth-post-confirmation ───────────────────────────────────────────────────

function makePostConfirmEvent(overrides: Record<string, unknown> = {}) {
  return {
    version: '1',
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    region: 'eu-west-3',
    userPoolId: 'eu-west-3_test',
    userName: 'user-123',
    callerContext: { awsSdkVersion: '', clientId: '' },
    request: {
      userAttributes: {
        sub: 'user-123',
        email: 'claire@example.com',
        name: 'Claire',
        email_verified: 'true',
      },
    },
    response: {},
    ...overrides,
  };
}

describe('POST Cognito post-confirmation trigger', () => {
  it('creates user from Cognito attributes and returns event', async () => {
    const { handler } = await import('./auth-post-confirmation');
    const event = makePostConfirmEvent();
    const result = await handler(event as never, {} as never, () => {});
    expect(vi.mocked(getRepository)().createUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', email: 'claire@example.com', displayName: 'Claire' }),
    );
    expect(result).toMatchObject({ request: event.request });
  });

  it('silently ignores ConditionalCheckFailedException (user already exists)', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      createUser: vi.fn().mockRejectedValue(
        Object.assign(new Error('Condition failed'), { name: 'ConditionalCheckFailedException' }),
      ),
    }));
    const { handler } = await import('./auth-post-confirmation');
    await expect(handler(makePostConfirmEvent() as never, {} as never, () => {})).resolves.toBeDefined();
  });

  it('rethrows unexpected errors', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      createUser: vi.fn().mockRejectedValue(new Error('DynamoDB unreachable')),
    }));
    const { handler } = await import('./auth-post-confirmation');
    await expect(handler(makePostConfirmEvent() as never, {} as never, () => {})).rejects.toThrow('DynamoDB unreachable');
  });
});

// ─── notification-dispatcher ──────────────────────────────────────────────────

function makeSnsEvent(message: string) {
  return {
    Records: [{
      Sns: {
        Message: message,
        MessageId: 'msg-1',
        Type: 'Notification',
        TopicArn: 'arn:aws:sns:eu-west-3:123:clos-notifications-dev',
        Timestamp: '',
        SignatureVersion: '',
        Signature: '',
        SigningCertUrl: '',
        UnsubscribeUrl: '',
        MessageAttributes: {},
        Subject: null,
      },
      EventSource: 'aws:sns',
      EventVersion: '1.0',
      EventSubscriptionArn: '',
    }],
  };
}

describe('SNS notification-dispatcher', () => {
  it('sends SES email on BOOKING_CREATED', async () => {
    const { handler } = await import('./notification-dispatcher');
    const msg = JSON.stringify({
      type: 'BOOKING_CREATED', bookingId: 'b-123', userId: 'user-123',
      roomId: 'glycine', start: '2026-07-01', end: '2026-07-05',
    });
    await handler(makeSnsEvent(msg) as never, {} as never, () => {});
    expect(sesSend).toHaveBeenCalledOnce();
    const call = sesSend.mock.calls[0][0];
    expect(call.input.Template).toBe('booking-created');
    expect(call.input.Destination.ToAddresses[0]).toBe(mockUser.email);
  });

  it('sends SES email on BOOKING_UPDATED', async () => {
    const { handler } = await import('./notification-dispatcher');
    const msg = JSON.stringify({
      type: 'BOOKING_UPDATED', bookingId: 'b-123', userId: 'user-123',
      roomId: 'glycine', changes: { notes: 'updated' },
    });
    await handler(makeSnsEvent(msg) as never, {} as never, () => {});
    expect(sesSend).toHaveBeenCalledOnce();
    expect(sesSend.mock.calls[0][0].input.Template).toBe('booking-updated');
  });

  it('sends SES email on BOOKING_CANCELLED (USER_CANCELLED)', async () => {
    const { handler } = await import('./notification-dispatcher');
    const msg = JSON.stringify({
      type: 'BOOKING_CANCELLED', bookingId: 'b-123', userId: 'user-123',
      roomId: 'glycine', reason: 'USER_CANCELLED',
    });
    await handler(makeSnsEvent(msg) as never, {} as never, () => {});
    expect(sesSend).toHaveBeenCalledOnce();
    expect(sesSend.mock.calls[0][0].input.Template).toBe('booking-cancelled');
  });

  it('skips email on BOOKING_CANCELLED with reason USER_DELETED', async () => {
    const { handler } = await import('./notification-dispatcher');
    const msg = JSON.stringify({
      type: 'BOOKING_CANCELLED', bookingId: 'b-123', userId: 'user-123',
      roomId: 'glycine', reason: 'USER_DELETED',
    });
    await handler(makeSnsEvent(msg) as never, {} as never, () => {});
    expect(sesSend).not.toHaveBeenCalled();
  });

  it('skips email when userId is null', async () => {
    const { handler } = await import('./notification-dispatcher');
    const msg = JSON.stringify({
      type: 'BOOKING_CREATED', bookingId: 'b-123', userId: null,
      roomId: 'glycine', start: '2026-07-01', end: '2026-07-05',
    });
    await handler(makeSnsEvent(msg) as never, {} as never, () => {});
    expect(sesSend).not.toHaveBeenCalled();
  });

  it('sends admin alert on BOOKING_CONFLICT_DETECTED', async () => {
    const { handler } = await import('./notification-dispatcher');
    const msg = JSON.stringify({
      type: 'BOOKING_CONFLICT_DETECTED', bookingIds: ['b-1', 'b-2'],
      roomId: 'glycine', detectedAt: '2026-05-26T01:00:00.000Z',
    });
    await handler(makeSnsEvent(msg) as never, {} as never, () => {});
    expect(sesSend).toHaveBeenCalledOnce();
    expect(sesSend.mock.calls[0][0].input.Template).toBe('admin-conflict-alert');
    expect(sesSend.mock.calls[0][0].input.Destination.ToAddresses[0]).toBe('admin@example.com');
  });

  it('skips email on USER_INVITED (Cognito handles it)', async () => {
    const { handler } = await import('./notification-dispatcher');
    const msg = JSON.stringify({ type: 'USER_INVITED', userId: 'u-1', email: 'x@x.com', role: 'guest' });
    await handler(makeSnsEvent(msg) as never, {} as never, () => {});
    expect(sesSend).not.toHaveBeenCalled();
  });

  it('continues processing remaining records when one dispatch fails', async () => {
    sesSend.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    ssmSend.mockResolvedValue({ Parameter: { Value: 'admin@example.com' } });
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      getUser: vi.fn()
        .mockRejectedValueOnce(new Error('DynamoDB error'))
        .mockResolvedValueOnce(mockUser),
    }));
    const { handler } = await import('./notification-dispatcher');
    const rec1 = JSON.stringify({ type: 'BOOKING_CREATED', bookingId: 'b-1', userId: 'u-1', roomId: 'glycine', start: '2026-07-01', end: '2026-07-05' });
    const rec2 = JSON.stringify({ type: 'BOOKING_UPDATED', bookingId: 'b-2', userId: 'u-2', roomId: 'glycine', changes: {} });
    const event = {
      Records: [makeSnsEvent(rec1).Records[0], makeSnsEvent(rec2).Records[0]],
    };
    await expect(handler(event as never, {} as never, () => {})).resolves.toBeUndefined();
    expect(sesSend).toHaveBeenCalledOnce(); // only second record succeeded
  });
});

// ─── reconciliation-job ───────────────────────────────────────────────────────

describe('EventBridge reconciliation-job', () => {
  it('publishes BOOKING_CONFLICT_DETECTED when overlapping bookings found', async () => {
    const overlapping = { ...mockBooking, bookingId: 'b-456', start: '2026-06-03', end: '2026-06-08' };
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      listAllBookings: vi.fn().mockResolvedValue([mockBooking, overlapping]),
    }));
    const { handler } = await import('./reconciliation-job');
    await handler({} as never, {} as never, () => {});
    expect(snsSend).toHaveBeenCalledOnce();
    const call = snsSend.mock.calls[0][0];
    const payload = JSON.parse(call.input.Message);
    expect(payload.type).toBe('BOOKING_CONFLICT_DETECTED');
    expect(payload.roomId).toBe('glycine');
    expect(payload.bookingIds).toContain('b-123');
    expect(payload.bookingIds).toContain('b-456');
  });

  it('does not publish when bookings do not overlap', async () => {
    const nonOverlapping = { ...mockBooking, bookingId: 'b-789', start: '2026-06-10', end: '2026-06-15' };
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      listAllBookings: vi.fn().mockResolvedValue([mockBooking, nonOverlapping]),
    }));
    const { handler } = await import('./reconciliation-job');
    await handler({} as never, {} as never, () => {});
    expect(snsSend).not.toHaveBeenCalled();
  });

  it('does not publish when bookings list is empty', async () => {
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      listAllBookings: vi.fn().mockResolvedValue([]),
    }));
    const { handler } = await import('./reconciliation-job');
    await expect(handler({} as never, {} as never, () => {})).resolves.toBeUndefined();
    expect(snsSend).not.toHaveBeenCalled();
  });

  it('publishes one SNS event per conflicting room (not per conflict pair)', async () => {
    const b2 = { ...mockBooking, bookingId: 'b-2', start: '2026-06-03', end: '2026-06-08' };
    const b3 = { ...mockBooking, bookingId: 'b-3', start: '2026-06-04', end: '2026-06-06' };
    vi.mocked(getRepository).mockReturnValue(makeRepo({
      listAllBookings: vi.fn().mockResolvedValue([mockBooking, b2, b3]),
    }));
    const { handler } = await import('./reconciliation-job');
    await handler({} as never, {} as never, () => {});
    expect(snsSend).toHaveBeenCalledOnce(); // 1 event for room "glycine"
    const payload = JSON.parse(snsSend.mock.calls[0][0].input.Message);
    expect(payload.bookingIds.length).toBeGreaterThanOrEqual(2);
  });
});
