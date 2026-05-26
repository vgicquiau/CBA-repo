import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, requireRole, ok } from '../api/http';
import { getRepository } from '../api/deps';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const config = await getRepository().getHouseConfig();
  return ok(config); // admin voit l'adresse
};

export const handler = withErrorHandling(rawHandler);
