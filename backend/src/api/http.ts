import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyStructuredResultV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Handler,
} from 'aws-lambda';
import { ZodError } from 'zod';
import type { z } from 'zod';
import type { Booking } from '@clos/shared-types';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  CapacityReductionError,
  ForbiddenError,
} from '../data/repository';

// ─── CORS ────────────────────────────────────────────────────────────────────

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

// ─── Réponses 2xx ────────────────────────────────────────────────────────────

export function ok<T>(body: T): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

export function created<T>(body: T): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

export function noContent(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    headers: CORS_HEADERS,
    body: '',
  };
}

// ─── Réponses d'erreur ───────────────────────────────────────────────────────

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify({
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    }),
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function getCurrentUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const sub = event.requestContext.authorizer?.jwt?.claims?.['sub'];
  if (!sub || typeof sub !== 'string') {
    throw new ForbiddenError('Missing user identity');
  }
  return sub;
}

export function getCurrentUserGroups(event: APIGatewayProxyEventV2WithJWTAuthorizer): string[] {
  const groups = event.requestContext.authorizer?.jwt?.claims?.['cognito:groups'];
  if (!groups) return [];
  if (typeof groups === 'string') return groups.split(',');
  if (Array.isArray(groups)) return groups as string[];
  return [];
}

export function requireRole(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  role: 'admin' | 'guest',
): void {
  const groups = getCurrentUserGroups(event);
  if (!groups.includes(role)) {
    throw new ForbiddenError(`Role '${role}' required`);
  }
}

export function requireOwnership(booking: Booking, userId: string): void {
  if (booking.userId !== userId) {
    throw new ForbiddenError('You do not own this booking');
  }
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export function parseBody<T extends z.ZodType>(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  schema: T,
): z.infer<T> {
  let raw: unknown;
  try {
    raw = event.body ? JSON.parse(event.body) : {};
  } catch {
    throw new ValidationError('body', 'Invalid JSON');
  }
  return schema.parse(raw);
}

export function parseQuery<T extends z.ZodType>(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  schema: T,
): z.infer<T> {
  return schema.parse(event.queryStringParameters ?? {});
}

export function getPathParam(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  name: string,
): string {
  const value = event.pathParameters?.[name];
  if (!value) {
    throw new ValidationError(name, `Path parameter '${name}' is required`);
  }
  return value;
}

// ─── withErrorHandling ────────────────────────────────────────────────────────

type AnyHandler = Handler<APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2>;

export function withErrorHandling(h: AnyHandler): AnyHandler {
  return async (event, context, callback) => {
    try {
      return await (h as (e: typeof event, c: typeof context, cb: typeof callback) => Promise<APIGatewayProxyStructuredResultV2>)(event, context, callback);
    } catch (err) {
      if (err instanceof ZodError) {
        return errorResponse(400, 'VALIDATION_FAILED', 'Validation failed', err.flatten());
      }
      if (err instanceof ValidationError) {
        return errorResponse(400, 'VALIDATION_FAILED', err.message, { field: err.field, reason: err.reason });
      }
      if (err instanceof ForbiddenError) {
        return errorResponse(403, 'FORBIDDEN', err.message, { reason: err.reason });
      }
      if (err instanceof NotFoundError) {
        return errorResponse(404, 'NOT_FOUND', err.message, { entity: err.entity, id: err.id });
      }
      if (err instanceof ConflictError) {
        return errorResponse(409, 'BOOKING_CONFLICT', err.message, { conflicts: err.conflictingBookings });
      }
      if (err instanceof CapacityReductionError) {
        return errorResponse(422, 'CAPACITY_REDUCTION_BLOCKED', err.message, { blockingBookings: err.blockingBookings });
      }
      // DynamoDB errors by name
      if (err instanceof Error) {
        if (err.name === 'ConditionalCheckFailedException') {
          return errorResponse(409, 'BOOKING_CONFLICT', 'Precondition failed', { reason: 'PRECONDITION_FAILED' });
        }
        if (err.name === 'TransactionCanceledException') {
          return errorResponse(409, 'BOOKING_CONFLICT', 'Transaction cancelled', { reason: 'TRANSACTION_CANCELLED' });
        }
        if (err.name === 'UsernameExistsException') {
          return errorResponse(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists');
        }
      }
      // Fallback — never expose raw message in production
      console.error('[withErrorHandling] Unhandled error:', err);
      return errorResponse(500, 'INTERNAL_ERROR', 'An internal error occurred');
    }
  };
}
