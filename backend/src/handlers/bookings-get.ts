import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, getCurrentUserId, requireOwnership, getPathParam, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const userId = getCurrentUserId(request);
  const bookingId = getPathParam(request, 'bookingId');
  const booking = await getRepository().findBookingById(bookingId);
  if (!booking) throw new NotFoundError('Booking', bookingId);
  requireOwnership(booking, userId);
  return ok(booking);
}

app.http('bookings-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'bookings/{bookingId}',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
