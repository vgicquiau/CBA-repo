import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, requireRole, ok } from '../api/http';
import { getRepository } from '../api/deps';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const config = await getRepository().getHouseConfig();
  return ok(config);
}

app.http('admin-house-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/house',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
