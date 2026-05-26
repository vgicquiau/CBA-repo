import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, requireRole, getPathParam, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { NotFoundError } from '../data/repository';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const bookingId = getPathParam(event, 'bookingId');
  const repo = getRepository();
  const booking = await repo.findBookingById(bookingId);
  if (!booking) throw new NotFoundError('Booking', bookingId);
  return ok(booking);
};

export const handler = withErrorHandling(rawHandler);
