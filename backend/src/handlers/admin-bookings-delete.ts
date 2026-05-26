import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, requireRole, getPathParam, noContent } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const bookingId = getPathParam(event, 'bookingId');
  const repo = getRepository();
  const booking = await repo.findBookingById(bookingId);
  if (!booking) throw new NotFoundError('Booking', bookingId);
  await repo.deleteBooking(booking.roomId, booking.start, bookingId);
  logger.info('Admin deleted booking', { bookingId });
  await publishEvent({ type: 'BOOKING_CANCELLED', bookingId, userId: booking.userId, roomId: booking.roomId, reason: 'ADMIN_CANCELLED' });
  return noContent();
};

export const handler = withErrorHandling(rawHandler);
