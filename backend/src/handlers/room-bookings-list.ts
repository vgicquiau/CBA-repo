import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandling, getCurrentUserId, getCurrentUserGroups, getPathParam, parseQuery, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

const QuerySchema = z.object({ from: z.string().optional() });

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const roomId = getPathParam(event, 'roomId');
  const { from } = parseQuery(event, QuerySchema);
  const currentUserId = getCurrentUserId(event);
  const groups = getCurrentUserGroups(event);
  const isAdmin = groups.includes('admin');
  const repo = getRepository();
  const room = await repo.getRoom(roomId);
  if (!room) throw new NotFoundError('Room', roomId);
  const bookings = await repo.listBookingsByRoom(roomId, from);
  // Privacy filter — guests only see their own bookings details, others see name+dates only
  const filtered = bookings.map((b) => {
    if (isAdmin || b.userId === currentUserId) return b;
    return { bookingId: b.bookingId, roomId: b.roomId, name: b.name, start: b.start, end: b.end, people: b.people };
  });
  return ok({ bookings: filtered });
};

export const handler = withErrorHandling(rawHandler);
