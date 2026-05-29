import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, getCurrentUserId, ok } from '../api/http';
import { getRepository } from '../api/deps';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const userId = getCurrentUserId(request);
  const bookings = await getRepository().listMyBookings(userId);
  return ok({ bookings });
}

app.http('bookings-list-mine', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'bookings/me',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
