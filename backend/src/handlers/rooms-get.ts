import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, getPathParam, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const roomId = getPathParam(request, 'roomId');
  const room = await getRepository().getRoom(roomId);
  if (!room) throw new NotFoundError('Room', roomId);
  return ok(room);
}

app.http('rooms-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rooms/{roomId}',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
