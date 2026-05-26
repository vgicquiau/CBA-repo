import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
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

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const body = parseBody(event, BodySchema);
  const updated = await getRepository().updateHouseConfig({ ...body, updatedAt: new Date().toISOString() });
  logger.info('HouseConfig updated');
  return ok(updated);
};

export const handler = withErrorHandling(rawHandler);
