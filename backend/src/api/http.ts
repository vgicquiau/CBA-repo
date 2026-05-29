import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
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

// ─── Response helpers ──────────────────────────────────────────────────────────
// CORS is handled by APIM — no CORS headers needed on Function responses.

export function ok<T>(body: T): HttpResponseInit {
  return { status: 200, jsonBody: body };
}

export function created<T>(body: T): HttpResponseInit {
  return { status: 201, jsonBody: body };
}

export function noContent(): HttpResponseInit {
  return { status: 204 };
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): HttpResponseInit {
  return {
    status,
    jsonBody: { error: { code, message, ...(details !== undefined ? { details } : {}) } },
  };
}

// ─── JWT decode ────────────────────────────────────────────────────────────────
// APIM validates the JWT and forwards it via X-Forwarded-User header.
// We decode (not verify) to extract claims — trust is established by APIM.

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) throw new ForbiddenError('Invalid token format');
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new ForbiddenError('Cannot decode token');
  }
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export function getCurrentUserId(request: HttpRequest): string {
  const token = request.headers.get('x-forwarded-user');
  if (!token) throw new ForbiddenError('Missing user identity');
  const claims = decodeJwtPayload(token);
  const oid = claims['oid'];
  if (!oid || typeof oid !== 'string') throw new ForbiddenError('Missing oid claim');
  return oid;
}

export function getCurrentUserGroups(request: HttpRequest): string[] {
  const token = request.headers.get('x-forwarded-user');
  if (!token) return [];
  try {
    const claims = decodeJwtPayload(token);
    const roles = claims['roles'];
    if (!roles) return [];
    if (Array.isArray(roles)) return roles as string[];
    if (typeof roles === 'string') return roles.split(' ');
  } catch {
    // fall through
  }
  return [];
}

export function requireRole(request: HttpRequest, role: 'admin' | 'guest'): void {
  const groups = getCurrentUserGroups(request);
  if (!groups.includes(role)) {
    throw new ForbiddenError(`Role '${role}' required`);
  }
}

export function requireOwnership(booking: Booking, userId: string): void {
  if (booking.userId !== userId) {
    throw new ForbiddenError('You do not own this booking');
  }
}

// ─── Parsing ───────────────────────────────────────────────────────────────────

export async function parseBody<T extends z.ZodType>(
  request: HttpRequest,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError('body', 'Invalid JSON');
  }
  return schema.parse(raw);
}

export function parseQuery<T extends z.ZodType>(
  request: HttpRequest,
  schema: T,
): z.infer<T> {
  const params: Record<string, string> = {};
  request.query.forEach((value, key) => { params[key] = value; });
  return schema.parse(params);
}

export function getPathParam(request: HttpRequest, name: string): string {
  const value = request.params[name];
  if (!value) {
    throw new ValidationError(name, `Path parameter '${name}' is required`);
  }
  return value;
}

// ─── Handler type ──────────────────────────────────────────────────────────────

export type AzureHttpHandler = (
  request: HttpRequest,
  context: InvocationContext,
) => Promise<HttpResponseInit>;

// ─── withErrorHandling ─────────────────────────────────────────────────────────

export function withErrorHandling(h: AzureHttpHandler): AzureHttpHandler {
  return async (request, context) => {
    try {
      return await h(request, context);
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
        return errorResponse(404, 'NOT_FOUND', 'Resource not found');
      }
      if (err instanceof ConflictError) {
        return errorResponse(409, 'BOOKING_CONFLICT', err.message, { conflicts: err.conflictingBookings });
      }
      if (err instanceof CapacityReductionError) {
        return errorResponse(422, 'CAPACITY_REDUCTION_BLOCKED', err.message, { blockingBookings: err.blockingBookings });
      }
      if (err instanceof Error) {
        if (err.name === 'ConditionalCheckFailedException') {
          return errorResponse(409, 'BOOKING_CONFLICT', 'Precondition failed', { reason: 'PRECONDITION_FAILED' });
        }
        if (err.name === 'TransactionCanceledException') {
          return errorResponse(409, 'BOOKING_CONFLICT', 'Transaction cancelled', { reason: 'TRANSACTION_CANCELLED' });
        }
      }
      console.error('[withErrorHandling] Unhandled error:', err);
      return errorResponse(500, 'INTERNAL_ERROR', 'An internal error occurred');
    }
  };
}
