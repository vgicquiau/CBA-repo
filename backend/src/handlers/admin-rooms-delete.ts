import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, requireRole, getPathParam, ok } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const roomId = getPathParam(event, 'roomId');
  const repo = getRepository();
  const room = await repo.getRoom(roomId);
  if (!room) throw new NotFoundError('Room', roomId);
  const { cancelledBookings } = await repo.deleteRoom(roomId);
  logger.info('Room deleted', { roomId, cancelledCount: cancelledBookings.length });
  // Publish cancellation events for each affected booking
  for (const booking of cancelledBookings) {
    await publishEvent({
      type: 'BOOKING_CANCELLED',
      bookingId: booking.bookingId,
      userId: booking.userId,
      roomId,
      reason: 'ROOM_DELETED',
    });
  }
  return ok({ deletedRoomId: roomId, cancelledBookings: cancelledBookings.length });
};

export const handler = withErrorHandling(rawHandler);
