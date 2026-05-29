import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { withErrorHandling, requireRole, parseBody, created as createdResponse } from '../api/http';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import type { User } from '@clos/shared-types';

const BodySchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  role: z.enum(['guest', 'admin']),
});

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const { email, displayName, role } = await parseBody(request, BodySchema);

  // TODO PM4: invite user via Microsoft Graph API (Entra External ID)
  // For now we generate a stable UUID — will be replaced by the Entra oid after Graph integration
  const userId = uuidv4();

  const now = new Date().toISOString();
  const user: User = { userId, email, displayName, role, createdAt: now };
  const repo = getRepository();
  const result = await repo.createUser(user);
  logger.info('User invited', { email, role });
  await publishEvent({ type: 'USER_INVITED', userId, email, role });
  return createdResponse(result);
}

app.http('admin-users-invite', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/users/invite',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
