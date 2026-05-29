import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, getCurrentUserId, noContent } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const userId = getCurrentUserId(request);
  const repo = getRepository();
  const user = await repo.getUser(userId);
  if (!user) throw new NotFoundError('User', userId);

  const bookings = await repo.listMyBookings(userId);
  for (const booking of bookings) {
    await repo.deleteBooking(booking.roomId, booking.start, booking.bookingId);
    await publishEvent({ type: 'BOOKING_CANCELLED', bookingId: booking.bookingId, userId, roomId: booking.roomId, reason: 'USER_DELETED' });
  }

  // TODO PM4: delete user from Entra External ID via Microsoft Graph API

  logger.info('User self-deleted (RGPD)', { userId });
  return noContent();
}

app.http('me-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'me',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
