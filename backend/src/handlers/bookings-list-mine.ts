import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, getCurrentUserId, ok } from '../api/http';
import { getRepository } from '../api/deps';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getCurrentUserId(event);
  const repo = getRepository();
  const bookings = await repo.listMyBookings(userId);
  return ok({ bookings });
};

export const handler = withErrorHandling(rawHandler);
