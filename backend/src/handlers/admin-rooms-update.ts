import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { withErrorHandling, requireRole, getPathParam, parseBody, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

const BodySchema = z.object({
  name: z.string().optional(),
  wing: z.string().optional(),
  floor: z.union([z.literal(0), z.literal(1)]).optional(),
  area: z.number().int().positive().optional(),
  capacity: z.number().int().min(1).max(10).optional(),
  beds: z.string().optional(),
  closet: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  linen: z.array(z.string()).optional(),
  pricePerPerson: z.number().int().min(0).optional(),
  photoTint: z.enum(['rosé','rouge','vert','ocre','bleu','pêche','gris','bois','pierre','lin','nuit','mousse']).optional(),
  blurb: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
});

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const roomId = getPathParam(request, 'roomId');
  const body = await parseBody(request, BodySchema);
  const repo = getRepository();
  const room = await repo.getRoom(roomId);
  if (!room) throw new NotFoundError('Room', roomId);
  const updated = await repo.updateRoom(roomId, { ...body, updatedAt: new Date().toISOString() });
  logger.info('Room updated', { roomId });
  return ok(updated);
}

app.http('admin-rooms-update', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'admin/rooms/{roomId}',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
