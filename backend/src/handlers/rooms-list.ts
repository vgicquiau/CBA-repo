import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, ok } from '../api/http';
import { getRepository } from '../api/deps';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async () => {
  const repo = getRepository();
  const rooms = await repo.listRooms();
  return ok({ rooms });
};

export const handler = withErrorHandling(rawHandler);
