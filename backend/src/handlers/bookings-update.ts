import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { withErrorHandling, getCurrentUserId, requireOwnership, getPathParam, parseBody, ok } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

const BodySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  people: z.number().int().min(1).optional(),
  notes: z.string().optional(),
});

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const userId = getCurrentUserId(request);
  const bookingId = getPathParam(request, 'bookingId');
  const body = await parseBody(request, BodySchema);
  const repo = getRepository();
  const existing = await repo.findBookingById(bookingId);
  if (!existing) throw new NotFoundError('Booking', bookingId);
  requireOwnership(existing, userId);
  const updated = await repo.updateBooking({ ...existing, ...body, updatedAt: new Date().toISOString() });
  logger.info('Booking updated', { bookingId, userId });
  await publishEvent({ type: 'BOOKING_UPDATED', bookingId, userId, roomId: existing.roomId, changes: body });
  return ok(updated);
}

app.http('bookings-update', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'bookings/{bookingId}',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
