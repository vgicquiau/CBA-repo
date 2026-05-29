import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, requireRole, getPathParam, noContent } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const bookingId = getPathParam(request, 'bookingId');
  const repo = getRepository();
  const booking = await repo.findBookingById(bookingId);
  if (!booking) throw new NotFoundError('Booking', bookingId);
  await repo.deleteBooking(booking.roomId, booking.start, bookingId);
  logger.info('Admin deleted booking', { bookingId });
  await publishEvent({ type: 'BOOKING_CANCELLED', bookingId, userId: booking.userId, roomId: booking.roomId, reason: 'ADMIN_CANCELLED' });
  return noContent();
}

app.http('admin-bookings-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'admin/bookings/{bookingId}',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
