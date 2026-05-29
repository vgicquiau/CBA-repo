import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { withErrorHandling, requireRole, getCurrentUserId, parseBody, created as createdResponse } from '../api/http';
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
  userId: z.string().nullable().default(null),
});

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const adminId = getCurrentUserId(request);
  const body = await parseBody(request, BodySchema);
  const now = new Date().toISOString();
  const bookingId = uuidv7();
  const booking: Booking = {
    bookingId,
    roomId: body.roomId,
    userId: body.userId,
    name: body.name,
    start: body.start,
    end: body.end,
    people: body.people,
    notes: body.notes,
    reference: generateBookingReference(),
    createdAt: now,
    updatedAt: now,
    createdBy: adminId,
  };
  const result = await getRepository().createBooking(booking);
  logger.info('Admin created booking', { bookingId, adminId });
  await publishEvent({ type: 'BOOKING_CREATED', bookingId, userId: body.userId, roomId: body.roomId, start: body.start, end: body.end });
  return createdResponse(result);
}

app.http('admin-bookings-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/bookings',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
