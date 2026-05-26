import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { withErrorHandling, getCurrentUserId, parseBody, created as createdResponse } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { generateBookingReference } from '../shared/identifiers';
import type { Booking } from '@clos/shared-types';

const BodySchema = z.object({
  roomId: z.string().min(1),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  people: z.number().int().min(1),
  name: z.string().min(1),
  notes: z.string().default(''),
});

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getCurrentUserId(event);
  const body = parseBody(event, BodySchema);
  const idempotencyKey = event.headers?.['idempotency-key'];
  const repo = getRepository();

  // Idempotency check
  if (idempotencyKey) {
    const existing = await repo.getIdempotencyRecord(idempotencyKey);
    if (existing) {
      const booking = await repo.findBookingById(existing.bookingId);
      if (booking) {
        logger.info('Idempotent create — returning existing booking', { bookingId: booking.bookingId });
        return createdResponse(booking);
      }
    }
  }

  const now = new Date().toISOString();
  const bookingId = uuidv7();
  const booking: Booking = {
    bookingId,
    roomId: body.roomId,
    userId,
    name: body.name,
    start: body.start,
    end: body.end,
    people: body.people,
    notes: body.notes,
    reference: generateBookingReference(),
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };

  const result = await repo.createBooking(booking);
  logger.info('Booking created', { bookingId, userId, roomId: body.roomId });

  if (idempotencyKey) {
    await repo.putIdempotencyRecord({
      key: idempotencyKey,
      bookingId,
      createdAt: now,
      ttl: Math.floor(Date.now() / 1000) + 86400,
    });
  }

  await publishEvent({ type: 'BOOKING_CREATED', bookingId, userId, roomId: body.roomId, start: body.start, end: body.end });
  return createdResponse(result);
};

export const handler = withErrorHandling(rawHandler);
