import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, requireRole, getPathParam, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const bookingId = getPathParam(request, 'bookingId');
  const booking = await getRepository().findBookingById(bookingId);
  if (!booking) throw new NotFoundError('Booking', bookingId);
  return ok(booking);
}

app.http('admin-bookings-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/bookings/{bookingId}',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
