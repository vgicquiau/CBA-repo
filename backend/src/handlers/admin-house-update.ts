import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { withErrorHandling, requireRole, parseBody, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { logger } from '../api/logger';

const BodySchema = z.object({
  name: z.string().optional(),
  region: z.string().optional(),
  address: z.string().optional(),
  welcomeNote: z.string().optional(),
  wings: z.array(z.string()).optional(),
  equipmentSuggestions: z.array(z.string()).optional(),
  linenSuggestions: z.array(z.string()).optional(),
});

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const body = await parseBody(request, BodySchema);
  const updated = await getRepository().updateHouseConfig({ ...body, updatedAt: new Date().toISOString() });
  logger.info('HouseConfig updated');
  return ok(updated);
}

app.http('admin-house-update', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'admin/house',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
