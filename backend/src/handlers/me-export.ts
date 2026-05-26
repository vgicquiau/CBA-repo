import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, getCurrentUserId, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getCurrentUserId(event);
  const repo = getRepository();
  const [user, bookings] = await Promise.all([
    repo.getUser(userId),
    repo.listMyBookings(userId),
  ]);
  if (!user) throw new NotFoundError('User', userId);
  return ok({
    exportedAt: new Date().toISOString(),
    user,
    bookings,
  });
};

export const handler = withErrorHandling(rawHandler);
