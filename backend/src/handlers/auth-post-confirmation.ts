import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { getRepository } from '../api/deps';
import { logger } from '../api/logger';

// Cognito post-confirmation trigger : fallback idempotent si l'étape 3
// de admin-users-invite a échoué. Ne fait rien si l'utilisateur existe déjà.
export const handler: PostConfirmationTriggerHandler = async (event) => {
  const { sub: userId, email, name: displayName } = event.request.userAttributes;

  try {
    const repo = getRepository();
    await repo.createUser({
      userId,
      email: email.toLowerCase(),
      displayName: displayName ?? email,
      role: 'guest', // DynamoDB role is informational — JWT claims are source of truth
      createdAt: new Date().toISOString(),
    });
    logger.info('User created via post-confirmation', { userId });
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      logger.info('User already exists in DynamoDB, skipping', { userId });
    } else {
      logger.error('Unexpected error in post-confirmation', { err });
      throw err;
    }
  }

  return event;
};
