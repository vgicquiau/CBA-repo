import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { withErrorHandling, getCurrentUserId, getCurrentUserGroups, getPathParam, parseQuery, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

const QuerySchema = z.object({ from: z.string().optional() });

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const roomId = getPathParam(request, 'roomId');
  const { from } = parseQuery(request, QuerySchema);
  const currentUserId = getCurrentUserId(request);
  const groups = getCurrentUserGroups(request);
  const isAdmin = groups.includes('admin');
  const repo = getRepository();
  const room = await repo.getRoom(roomId);
  if (!room) throw new NotFoundError('Room', roomId);
  const bookings = await repo.listBookingsByRoom(roomId, from);
  const filtered = bookings.map((b) => {
    if (isAdmin || b.userId === currentUserId) return b;
    return { bookingId: b.bookingId, roomId: b.roomId, name: b.name, start: b.start, end: b.end, people: b.people };
  });
  return ok({ bookings: filtered });
}

app.http('room-bookings-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rooms/{roomId}/bookings',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
