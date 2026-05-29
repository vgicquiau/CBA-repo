import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { withErrorHandling, getCurrentUserId, parseBody, created as createdResponse } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { generateBookingReference } from '../shared/identifiers';
import { todayIsoInAppTz, type Booking } from '@clos/shared-types';

function isValidCalendarDate(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  isValidCalendarDate,
  { message: 'Invalid calendar date' },
);

const BodySchema = z.object({
  roomId: z.string().min(1).max(100),
  start: DateSchema,
  end: DateSchema,
  people: z.number().int().min(1).max(20),
  name: z.string().min(1).max(200),
  notes: z.string().max(2000).default(''),
}).refine(
  (data) => data.start < data.end,
  { message: 'start must be before end', path: ['end'] },
).refine(
  (data) => data.start >= todayIsoInAppTz(),
  { message: 'start cannot be in the past', path: ['start'] },
);

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const userId = getCurrentUserId(request);
  const body = await parseBody(request, BodySchema);
  const idempotencyKey = request.headers.get('idempotency-key');
  const repo = getRepository();

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
}

app.http('bookings-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'bookings',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
