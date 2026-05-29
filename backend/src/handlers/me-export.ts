import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, getCurrentUserId, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const userId = getCurrentUserId(request);
  const repo = getRepository();
  const [user, bookings] = await Promise.all([
    repo.getUser(userId),
    repo.listMyBookings(userId),
  ]);
  if (!user) throw new NotFoundError('User', userId);
  return ok({ exportedAt: new Date().toISOString(), user, bookings });
}

app.http('me-export', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me/export',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
