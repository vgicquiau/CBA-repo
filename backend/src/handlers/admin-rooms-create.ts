import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { withErrorHandling, requireRole, parseBody, created as createdResponse } from '../api/http';
import { getRepository } from '../api/deps';
import { logger } from '../api/logger';
import type { Room } from '@clos/shared-types';

const BodySchema = z.object({
  roomId: z.string().min(1),
  name: z.string().min(1),
  wing: z.string().min(1),
  floor: z.union([z.literal(0), z.literal(1)]),
  area: z.number().int().positive(),
  capacity: z.number().int().min(1).max(10),
  beds: z.string().min(1),
  closet: z.string().default(''),
  equipment: z.array(z.string()).default([]),
  linen: z.array(z.string()).default([]),
  pricePerPerson: z.number().int().min(0),
  photoTint: z.enum(['rosé','rouge','vert','ocre','bleu','pêche','gris','bois','pierre','lin','nuit','mousse']),
  blurb: z.string().default(''),
});

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const body = await parseBody(request, BodySchema);
  const now = new Date().toISOString();
  const room: Room = { ...body, photoUrl: null, createdAt: now, updatedAt: now };
  const result = await getRepository().createRoom(room);
  logger.info('Room created', { roomId: body.roomId });
  return createdResponse(result);
}

app.http('admin-rooms-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/rooms',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
