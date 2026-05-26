import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { withErrorHandling, ok } from '../api/http';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async () => {
  return ok({ status: 'ok', timestamp: new Date().toISOString() });
};

export const handler = withErrorHandling(rawHandler);
