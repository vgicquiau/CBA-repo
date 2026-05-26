import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandling, getPathParam, parseQuery, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { ValidationError, NotFoundError } from '../data/repository';
import { intervalsOverlap } from '@clos/shared-types';

const QuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const roomId = getPathParam(event, 'roomId');
  const { start, end } = parseQuery(event, QuerySchema);
  if (start >= end) throw new ValidationError('end', 'must be after start');
  const repo = getRepository();
  const room = await repo.getRoom(roomId);
  if (!room) throw new NotFoundError('Room', roomId);
  const bookings = await repo.listBookingsByRoomInRange(roomId, start, end);
  const conflicts = bookings.filter((b) => intervalsOverlap(start, end, b.start, b.end));
  return ok({ roomId, start, end, available: conflicts.length === 0, conflicts });
};

export const handler = withErrorHandling(rawHandler);
