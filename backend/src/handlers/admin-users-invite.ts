import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, requireRole, errorResponse } from '../api/http';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  return errorResponse(501, 'NOT_IMPLEMENTED', 'User invitation requires Microsoft Graph API integration — pending PM4');
}

app.http('admin-users-invite', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/users/invite',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
