import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Service Bus mock ─────────────────────────────────────────────────────────

const mockSendMessages = vi.fn();
const mockClose = vi.fn();
const mockCreateSender = vi.fn().mockReturnValue({
  sendMessages: mockSendMessages,
  close: mockClose,
});

vi.mock('@azure/service-bus', () => ({
  ServiceBusClient: vi.fn().mockImplementation(() => ({ createSender: mockCreateSender })),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../data/repository.cosmos', () => ({
  createCosmosRepository: vi.fn().mockReturnValue({}),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('publishEvent()', () => {
  beforeEach(() => {
    mockSendMessages.mockClear();
    mockSendMessages.mockResolvedValue(undefined);
    mockClose.mockClear();
    mockClose.mockResolvedValue(undefined);
    mockCreateSender.mockClear();
    mockCreateSender.mockReturnValue({ sendMessages: mockSendMessages, close: mockClose });
    process.env.SERVICEBUS_FULLY_QUALIFIED_NAMESPACE = 'test.servicebus.windows.net';
    process.env.SERVICEBUS_TOPIC_NAME = 'clos-notifications-test';
    vi.resetModules();
  });

  it('sends event body to the configured Service Bus topic', async () => {
    const { publishEvent } = await import('./deps');
    const event = { type: 'BOOKING_CREATED' as const, bookingId: 'b-1', userId: 'u-1', roomId: 'r-1', start: '2026-07-01', end: '2026-07-05' };
    await publishEvent(event);
    expect(mockCreateSender).toHaveBeenCalledWith('clos-notifications-test');
    expect(mockSendMessages).toHaveBeenCalledOnce();
    expect(mockSendMessages).toHaveBeenCalledWith(
      expect.objectContaining({ body: event, contentType: 'application/json' }),
    );
  });

  it('closes the sender after a successful send', async () => {
    const { publishEvent } = await import('./deps');
    await publishEvent({ type: 'USER_INVITED', userId: 'u-1', email: 'x@x.com', role: 'guest' });
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('closes the sender even when sendMessages throws', async () => {
    mockSendMessages.mockRejectedValueOnce(new Error('Service Bus unreachable'));
    const { publishEvent } = await import('./deps');
    await expect(
      publishEvent({ type: 'USER_INVITED', userId: 'u-1', email: 'x@x.com', role: 'guest' }),
    ).rejects.toThrow('Service Bus unreachable');
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('falls back to clos-notifications topic when SERVICEBUS_TOPIC_NAME is not set', async () => {
    delete process.env.SERVICEBUS_TOPIC_NAME;
    const { publishEvent } = await import('./deps');
    await publishEvent({ type: 'USER_INVITED', userId: 'u-1', email: 'x@x.com', role: 'guest' });
    expect(mockCreateSender).toHaveBeenCalledWith('clos-notifications');
  });

  it('throws when SERVICEBUS_FULLY_QUALIFIED_NAMESPACE is missing', async () => {
    delete process.env.SERVICEBUS_FULLY_QUALIFIED_NAMESPACE;
    const { publishEvent } = await import('./deps');
    await expect(
      publishEvent({ type: 'USER_INVITED', userId: 'u-1', email: 'x@x.com', role: 'guest' }),
    ).rejects.toThrow('SERVICEBUS_FULLY_QUALIFIED_NAMESPACE');
  });
});
