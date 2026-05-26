import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, getCurrentUserId, requireOwnership, getPathParam, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getCurrentUserId(event);
  const bookingId = getPathParam(event, 'bookingId');
  const repo = getRepository();
  const booking = await repo.findBookingById(bookingId);
  if (!booking) throw new NotFoundError('Booking', bookingId);
  requireOwnership(booking, userId);
  return ok(booking);
};

export const handler = withErrorHandling(rawHandler);
