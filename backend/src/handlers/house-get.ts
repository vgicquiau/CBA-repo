import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, ok } from '../api/http';
import { getRepository } from '../api/deps';

async function rawHandler(_request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const config = await getRepository().getHouseConfig();
  const { address: _address, ...publicConfig } = config;
  return ok(publicConfig);
}

app.http('house-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'house',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
