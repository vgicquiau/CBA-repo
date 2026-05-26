import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { z } from 'zod';
import {
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { withErrorHandling, requireRole, parseBody, created as createdResponse } from '../api/http';
import { getRepository, getCognitoClient, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import type { User } from '@clos/shared-types';

const BodySchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  role: z.enum(['guest', 'admin']),
});

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const { email, displayName, role } = parseBody(event, BodySchema);
  const userPoolId = process.env.USER_POOL_ID ?? '';
  const cognito = getCognitoClient();

  // Create user in Cognito — sends invitation email automatically
  const cognitoResult = await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: displayName },
    ],
    DesiredDeliveryMediums: ['EMAIL'],
  }));

  const sub = cognitoResult.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
  if (!sub) throw new Error('Cognito did not return sub');

  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: email,
    GroupName: role,
  }));

  const now = new Date().toISOString();
  const user: User = { userId: sub, email, displayName, role, createdAt: now };
  const repo = getRepository();
  const result = await repo.createUser(user);
  logger.info('User invited', { email, role });
  await publishEvent({ type: 'USER_INVITED', userId: sub, email, role });
  return createdResponse(result);
};

export const handler = withErrorHandling(rawHandler);
