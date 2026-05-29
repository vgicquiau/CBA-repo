import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, getCurrentUserId, requireOwnership, getPathParam, noContent } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const userId = getCurrentUserId(request);
  const bookingId = getPathParam(request, 'bookingId');
  const repo = getRepository();
  const booking = await repo.findBookingById(bookingId);
  if (!booking) throw new NotFoundError('Booking', bookingId);
  requireOwnership(booking, userId);
  await repo.deleteBooking(booking.roomId, booking.start, bookingId);
  logger.info('Booking deleted', { bookingId, userId });
  await publishEvent({ type: 'BOOKING_CANCELLED', bookingId, userId, roomId: booking.roomId, reason: 'USER_CANCELLED' });
  return noContent();
}

app.http('bookings-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'bookings/{bookingId}',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
