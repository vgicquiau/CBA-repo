import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, requireRole, ok } from '../api/http';
import { getRepository } from '../api/deps';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const users = await getRepository().listUsers();
  return ok({ users });
};

export const handler = withErrorHandling(rawHandler);
