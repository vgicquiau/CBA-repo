import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { HttpRequest } from '@azure/functions';
import {
  ok, created, noContent, errorResponse,
  getCurrentUserId, getCurrentUserGroups, requireRole, requireOwnership,
  parseBody, parseQuery, getPathParam,
  withErrorHandling,
} from './http';
import {
  ConflictError, NotFoundError, ValidationError,
  CapacityReductionError, ForbiddenError,
} from '../data/repository';
import type { Booking } from '@clos/shared-types';
import { makeRequest, makeContext } from '../__tests__/helpers';

const mockBooking: Booking = {
  bookingId: 'b-1', roomId: 'glycine', userId: 'u-1',
  name: 'Claire', start: '2026-05-16', end: '2026-05-19',
  people: 2, notes: '', reference: 'CLOS-ABCD1234',
  createdAt: '2026-05-01T10:00:00.000Z', updatedAt: '2026-05-01T10:00:00.000Z',
  createdBy: 'u-1',
};

// ─── ok / created / noContent ────────────────────────────────────────────────

describe('ok', () => {
  it('returns status 200', () => {
    expect(ok({ foo: 'bar' }).status).toBe(200);
  });

  it('sets jsonBody', () => {
    expect(ok({ x: 1 }).jsonBody).toEqual({ x: 1 });
  });
});

describe('created', () => {
  it('returns status 201', () => {
    expect(created({ id: 'x' }).status).toBe(201);
  });
});

describe('noContent', () => {
  it('returns status 204', () => {
    expect(noContent().status).toBe(204);
  });
});

// ─── errorResponse ───────────────────────────────────────────────────────────

describe('errorResponse', () => {
  it('structures jsonBody with error.code and error.message', () => {
    const res = errorResponse(404, 'NOT_FOUND', 'Not found');
    expect((res.jsonBody as { error: { code: string; message: string } }).error.code).toBe('NOT_FOUND');
    expect((res.jsonBody as { error: { code: string; message: string } }).error.message).toBe('Not found');
  });

  it('includes details when provided', () => {
    const res = errorResponse(400, 'VALIDATION_FAILED', 'Bad', { field: 'x' });
    expect((res.jsonBody as { error: { details: unknown } }).error.details).toEqual({ field: 'x' });
  });
});

// ─── getCurrentUserId ─────────────────────────────────────────────────────────

describe('getCurrentUserId', () => {
  it('returns the oid from JWT in x-forwarded-user', () => {
    expect(getCurrentUserId(makeRequest())).toBe('user-123');
  });

  it('throws ForbiddenError if header is missing', () => {
    const reqNoJwt = new HttpRequest({ method: 'GET', url: 'https://localhost/test' });
    expect(() => getCurrentUserId(reqNoJwt)).toThrow(ForbiddenError);
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe('requireRole', () => {
  it('does not throw when user has the role', () => {
    expect(() => requireRole(makeRequest(), 'guest')).not.toThrow();
  });

  it('throws ForbiddenError when user lacks the role', () => {
    expect(() => requireRole(makeRequest(), 'admin')).toThrow(ForbiddenError);
  });
});

// ─── requireOwnership ────────────────────────────────────────────────────────

describe('requireOwnership', () => {
  it('does not throw when userId matches', () => {
    expect(() => requireOwnership(mockBooking, 'u-1')).not.toThrow();
  });

  it('throws ForbiddenError when userId does not match', () => {
    expect(() => requireOwnership(mockBooking, 'u-999')).toThrow(ForbiddenError);
  });
});

// ─── parseBody ───────────────────────────────────────────────────────────────

describe('parseBody', () => {
  it('parses a valid JSON body', async () => {
    const schema = z.object({ name: z.string() });
    const req = makeRequest({ method: 'POST', body: JSON.stringify({ name: 'Claire' }) });
    await expect(parseBody(req, schema)).resolves.toEqual({ name: 'Claire' });
  });

  it('throws ZodError on invalid body', async () => {
    const schema = z.object({ name: z.string() });
    const req = makeRequest({ method: 'POST', body: JSON.stringify({ name: 123 }) });
    await expect(parseBody(req, schema)).rejects.toThrow(z.ZodError);
  });

  it('throws ValidationError on non-JSON body', async () => {
    const schema = z.object({ name: z.string() });
    const req = makeRequest({ method: 'POST', body: 'not json' });
    await expect(parseBody(req, schema)).rejects.toThrow(ValidationError);
  });
});

// ─── getPathParam ────────────────────────────────────────────────────────────

describe('getPathParam', () => {
  it('returns the path parameter value', () => {
    const req = makeRequest({ params: { roomId: 'glycine' } });
    expect(getPathParam(req, 'roomId')).toBe('glycine');
  });

  it('throws ValidationError if parameter is missing', () => {
    const req = makeRequest({ params: {} });
    expect(() => getPathParam(req, 'roomId')).toThrow(ValidationError);
  });
});

// ─── parseQuery ──────────────────────────────────────────────────────────────

describe('parseQuery', () => {
  it('parses query parameters', () => {
    const schema = z.object({ start: z.string() });
    const req = makeRequest({ query: { start: '2026-07-01' } });
    expect(parseQuery(req, schema)).toEqual({ start: '2026-07-01' });
  });
});

// ─── withErrorHandling ────────────────────────────────────────────────────────

describe('withErrorHandling', () => {
  const req = makeRequest();
  const ctx = makeContext();

  it('passes through the result on success', async () => {
    const handler = withErrorHandling(async () => ok({ status: 'ok' }));
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
  });

  it('maps ValidationError → 400 VALIDATION_FAILED', async () => {
    const handler = withErrorHandling(async () => { throw new ValidationError('field', 'reason'); });
    const res = await handler(req, ctx);
    expect(res.status).toBe(400);
    expect((res.jsonBody as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('maps ForbiddenError → 403 FORBIDDEN', async () => {
    const handler = withErrorHandling(async () => { throw new ForbiddenError('no'); });
    const res = await handler(req, ctx);
    expect(res.status).toBe(403);
    expect((res.jsonBody as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('maps NotFoundError → 404 NOT_FOUND', async () => {
    const handler = withErrorHandling(async () => { throw new NotFoundError('Room', 'x'); });
    const res = await handler(req, ctx);
    expect(res.status).toBe(404);
    expect((res.jsonBody as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  it('maps ConflictError → 409 BOOKING_CONFLICT', async () => {
    const handler = withErrorHandling(async () => { throw new ConflictError([]); });
    const res = await handler(req, ctx);
    expect(res.status).toBe(409);
    expect((res.jsonBody as { error: { code: string } }).error.code).toBe('BOOKING_CONFLICT');
  });

  it('maps CapacityReductionError → 422 CAPACITY_REDUCTION_BLOCKED', async () => {
    const handler = withErrorHandling(async () => { throw new CapacityReductionError([]); });
    const res = await handler(req, ctx);
    expect(res.status).toBe(422);
    expect((res.jsonBody as { error: { code: string } }).error.code).toBe('CAPACITY_REDUCTION_BLOCKED');
  });

  it('maps unknown Error → 500 INTERNAL_ERROR', async () => {
    const handler = withErrorHandling(async () => { throw new Error('boom'); });
    const res = await handler(req, ctx);
    expect(res.status).toBe(500);
    expect((res.jsonBody as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
  });

  it('maps ConditionalCheckFailedException → 409 BOOKING_CONFLICT', async () => {
    const handler = withErrorHandling(async () => {
      const e = new Error('Conditional check failed');
      e.name = 'ConditionalCheckFailedException';
      throw e;
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(409);
    expect((res.jsonBody as { error: { code: string } }).error.code).toBe('BOOKING_CONFLICT');
  });
});
