import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, getCurrentUserId, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const userId = getCurrentUserId(request);
  const repo = getRepository();
  const user = await repo.getUser(userId);
  if (!user) throw new NotFoundError('User', userId);
  return ok(user);
}

app.http('me-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
