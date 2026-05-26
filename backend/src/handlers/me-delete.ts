import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { withErrorHandling, getCurrentUserId, noContent } from '../api/http';
import { getRepository, getCognitoClient, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getCurrentUserId(event);
  const userPoolId = process.env.USER_POOL_ID ?? '';
  const repo = getRepository();
  const user = await repo.getUser(userId);
  if (!user) throw new NotFoundError('User', userId);

  // Cancel all upcoming bookings
  const bookings = await repo.listMyBookings(userId);
  for (const booking of bookings) {
    await repo.deleteBooking(booking.roomId, booking.start, booking.bookingId);
    await publishEvent({ type: 'BOOKING_CANCELLED', bookingId: booking.bookingId, userId, roomId: booking.roomId, reason: 'USER_DELETED' });
  }

  // Delete from Cognito
  await getCognitoClient().send(new AdminDeleteUserCommand({
    UserPoolId: userPoolId,
    Username: user.email,
  }));

  logger.info('User self-deleted (RGPD)', { userId });
  return noContent();
};

export const handler = withErrorHandling(rawHandler);
