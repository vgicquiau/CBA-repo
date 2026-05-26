import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, getCurrentUserId, requireOwnership, getPathParam, noContent } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getCurrentUserId(event);
  const bookingId = getPathParam(event, 'bookingId');
  const repo = getRepository();
  const booking = await repo.findBookingById(bookingId);
  if (!booking) throw new NotFoundError('Booking', bookingId);
  requireOwnership(booking, userId);
  await repo.deleteBooking(booking.roomId, booking.start, bookingId);
  logger.info('Booking deleted', { bookingId, userId });
  await publishEvent({ type: 'BOOKING_CANCELLED', bookingId, userId, roomId: booking.roomId, reason: 'USER_CANCELLED' });
  return noContent();
};

export const handler = withErrorHandling(rawHandler);
