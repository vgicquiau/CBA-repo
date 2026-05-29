import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, requireRole, getPathParam, ok } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const roomId = getPathParam(request, 'roomId');
  const repo = getRepository();
  const room = await repo.getRoom(roomId);
  if (!room) throw new NotFoundError('Room', roomId);
  const { cancelledBookings } = await repo.deleteRoom(roomId);
  logger.info('Room deleted', { roomId, cancelledCount: cancelledBookings.length });
  for (const booking of cancelledBookings) {
    await publishEvent({ type: 'BOOKING_CANCELLED', bookingId: booking.bookingId, userId: booking.userId, roomId, reason: 'ROOM_DELETED' });
  }
  return ok({ deletedRoomId: roomId, cancelledBookings: cancelledBookings.length });
}

app.http('admin-rooms-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'admin/rooms/{roomId}',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
