import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, ok } from '../api/http';
import { getRepository } from '../api/deps';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async () => {
  const repo = getRepository();
  const config = await repo.getHouseConfig();
  // Filtre address — jamais exposée en endpoint public guest
  const { address: _address, ...publicConfig } = config;
  return ok(publicConfig);
};

export const handler = withErrorHandling(rawHandler);
