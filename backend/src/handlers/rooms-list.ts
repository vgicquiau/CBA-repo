import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, ok } from '../api/http';
import { getRepository } from '../api/deps';

async function rawHandler(_request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const rooms = await getRepository().listRooms();
  return ok({ rooms });
}

app.http('rooms-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rooms',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
