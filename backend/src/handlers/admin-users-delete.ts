import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, requireRole, getPathParam, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const userId = getPathParam(request, 'userId');
  const repo = getRepository();
  const user = await repo.getUser(userId);
  if (!user) throw new NotFoundError('User', userId);

  await repo.deleteUser(userId);
  // TODO PM4: also delete from Entra External ID via Microsoft Graph API

  logger.info('User deleted from Cosmos DB', { userId, email: user.email });
  return ok({ deletedUserId: userId });
}

app.http('admin-users-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'admin/users/{userId}',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
