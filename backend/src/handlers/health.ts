import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, ok } from '../api/http';

async function rawHandler(_request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  return ok({ status: 'ok', timestamp: new Date().toISOString() });
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
