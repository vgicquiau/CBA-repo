import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { withErrorHandling, requireRole, getPathParam, ok } from '../api/http';
import { getRepository, getCognitoClient } from '../api/deps';
import { logger } from '../api/logger';
import { NotFoundError } from '../data/repository';

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const userId = getPathParam(event, 'userId');
  const userPoolId = process.env.USER_POOL_ID ?? '';
  const repo = getRepository();
  const user = await repo.getUser(userId);
  if (!user) throw new NotFoundError('User', userId);

  // Delete from Cognito first
  await getCognitoClient().send(new AdminDeleteUserCommand({
    UserPoolId: userPoolId,
    Username: user.email,
  }));

  logger.info('User deleted', { userId, email: user.email });
  return ok({ deletedUserId: userId });
};

export const handler = withErrorHandling(rawHandler);
