import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { getRepository } from '../api/deps';
import { logger } from '../api/logger';

// Entra External ID custom authentication extension webhook.
// Called by Entra after a user confirms sign-up to provision the user record in Cosmos DB.
// Spec: https://learn.microsoft.com/en-us/azure/active-directory/develop/custom-extension-overview
async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON' } };
  }

  const data = (body.data as Record<string, unknown> | undefined) ?? {};
  const userAttributes = (data.userSignInName ?? {}) as Record<string, unknown>;
  const userId = (data.objectId as string | undefined) ?? '';
  const email = ((userAttributes as Record<string, unknown>).signInNames as string | undefined) ?? (data.mail as string | undefined) ?? '';
  const displayName = (data.displayName as string | undefined) ?? email;

  if (!userId) {
    logger.warn('auth-post-confirmation: missing objectId in payload');
    return { status: 200, jsonBody: { data: { '@odata.type': 'microsoft.graph.onAttributeCollectionSubmitResponseData', actions: [] } } };
  }

  try {
    const repo = getRepository();
    await repo.createUser({
      userId,
      email: email.toLowerCase(),
      displayName: displayName ?? email,
      role: 'guest',
      createdAt: new Date().toISOString(),
    });
    logger.info('User created via Entra post-confirmation webhook', { userId });
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'ConflictError' || name === 'ConditionalCheckFailedException') {
      logger.info('User already exists in Cosmos DB, skipping', { userId });
    } else {
      logger.error('Unexpected error in auth-post-confirmation', { err });
      throw err;
    }
  }

  // Entra expects a specific response shape to continue the auth flow
  return {
    status: 200,
    jsonBody: {
      data: {
        '@odata.type': 'microsoft.graph.onAttributeCollectionSubmitResponseData',
        actions: [{ '@odata.type': 'microsoft.graph.attributeCollectionSubmit.continueWithDefaultBehavior' }],
      },
    },
  };
}

app.http('auth-post-confirmation', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/post-confirmation',
  handler: rawHandler,
});

export const handler = rawHandler;
