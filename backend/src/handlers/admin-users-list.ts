import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, requireRole, ok } from '../api/http';
import { getRepository } from '../api/deps';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const users = await getRepository().listUsers();
  return ok({ users });
}

app.http('admin-users-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/users',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
