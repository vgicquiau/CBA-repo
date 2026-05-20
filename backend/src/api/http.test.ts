import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
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

const mockBooking: Booking = {
  bookingId: 'b-1', roomId: 'glycine', userId: 'u-1',
  name: 'Claire', start: '2026-05-16', end: '2026-05-19',
  people: 2, notes: '', reference: 'CLOS-ABCD1234',
  createdAt: '2026-05-01T10:00:00.000Z', updatedAt: '2026-05-01T10:00:00.000Z',
  createdBy: 'u-1',
};

function mockEvent(overrides: Record<string, unknown> = {}): Parameters<typeof getCurrentUserId>[0] {
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: 'user-123', 'cognito:groups': 'guest,member' },
          scopes: [],
        },
        principalId: 'user-123',
        integrationLatency: 0,
      },
      accountId: '123',
      apiId: 'abc',
      domainName: 'test',
      domainPrefix: 'test',
      http: { method: 'GET', path: '/v1/test', protocol: 'HTTP/1.1', sourceIp: '1.2.3.4', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: 'GET /test',
      stage: 'dev',
      time: '',
      timeEpoch: 0,
    },
    version: '2.0',
    routeKey: 'GET /test',
    rawPath: '/v1/test',
    rawQueryString: '',
    headers: {},
    isBase64Encoded: false,
    body: undefined,
    pathParameters: {},
    queryStringParameters: {},
    stageVariables: {},
    ...overrides,
  } as Parameters<typeof getCurrentUserId>[0];
}

// ─── ok / created / noContent ────────────────────────────────────────────────

describe('ok', () => {
  it('returns statusCode 200', () => {
    expect(ok({ foo: 'bar' }).statusCode).toBe(200);
  });

  it('serializes body as JSON', () => {
    const res = ok({ x: 1 });
    expect(JSON.parse(res.body as string)).toEqual({ x: 1 });
  });
});

describe('created', () => {
  it('returns statusCode 201', () => {
    expect(created({ id: 'x' }).statusCode).toBe(201);
  });
});

describe('noContent', () => {
  it('returns statusCode 204', () => {
    expect(noContent().statusCode).toBe(204);
  });
});

// ─── errorResponse ───────────────────────────────────────────────────────────

describe('errorResponse', () => {
  it('structures body with error.code and error.message', () => {
    const res = errorResponse(404, 'NOT_FOUND', 'Not found');
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Not found');
  });

  it('includes details when provided', () => {
    const res = errorResponse(400, 'VALIDATION_FAILED', 'Bad', { field: 'x' });
    const body = JSON.parse(res.body as string);
    expect(body.error.details).toEqual({ field: 'x' });
  });
});

// ─── getCurrentUserId ─────────────────────────────────────────────────────────

describe('getCurrentUserId', () => {
  it('returns the sub from JWT claims', () => {
    expect(getCurrentUserId(mockEvent())).toBe('user-123');
  });

  it('throws ForbiddenError if sub is missing', () => {
    const event = mockEvent();
    (event.requestContext.authorizer as unknown as Record<string, unknown>).jwt = { claims: {}, scopes: [] };
    expect(() => getCurrentUserId(event)).toThrow(ForbiddenError);
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe('requireRole', () => {
  it('does not throw when user has the role', () => {
    const event = mockEvent();
    expect(() => requireRole(event, 'guest')).not.toThrow();
  });

  it('throws ForbiddenError when user lacks the role', () => {
    const event = mockEvent();
    expect(() => requireRole(event, 'admin')).toThrow(ForbiddenError);
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
  it('parses a valid JSON body', () => {
    const schema = z.object({ name: z.string() });
    const event = mockEvent({ body: JSON.stringify({ name: 'Claire' }) });
    expect(parseBody(event, schema)).toEqual({ name: 'Claire' });
  });

  it('throws ZodError on invalid body', () => {
    const schema = z.object({ name: z.string() });
    const event = mockEvent({ body: JSON.stringify({ name: 123 }) });
    expect(() => parseBody(event, schema)).toThrow(z.ZodError);
  });

  it('throws ValidationError on non-JSON body', () => {
    const schema = z.object({ name: z.string() });
    const event = mockEvent({ body: 'not json' });
    expect(() => parseBody(event, schema)).toThrow(ValidationError);
  });
});

// ─── getPathParam ────────────────────────────────────────────────────────────

describe('getPathParam', () => {
  it('returns the path parameter value', () => {
    const event = mockEvent({ pathParameters: { roomId: 'glycine' } });
    expect(getPathParam(event, 'roomId')).toBe('glycine');
  });

  it('throws ValidationError if parameter is missing', () => {
    const event = mockEvent({ pathParameters: {} });
    expect(() => getPathParam(event, 'roomId')).toThrow(ValidationError);
  });
});

// ─── withErrorHandling ────────────────────────────────────────────────────────

describe('withErrorHandling', () => {
  const event = mockEvent();
  const ctx = {} as Parameters<typeof withErrorHandling>[0] extends infer H
    ? H extends (...args: infer A) => unknown ? A[1] : never
    : never;

  it('passes through the result on success', async () => {
    const handler = withErrorHandling(async () => ok({ status: 'ok' }));
    const res = await handler(event, ctx as never, () => {});
    expect(typeof res === 'object' && res !== null && 'statusCode' in res && res.statusCode).toBe(200);
  });

  it('maps ValidationError → 400 VALIDATION_FAILED', async () => {
    const handler = withErrorHandling(async () => {
      throw new ValidationError('field', 'reason');
    });
    const res = await handler(event, ctx as never, () => {}) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('maps ForbiddenError → 403 FORBIDDEN', async () => {
    const handler = withErrorHandling(async () => { throw new ForbiddenError('no'); });
    const res = await handler(event, ctx as never, () => {}) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('maps NotFoundError → 404 NOT_FOUND', async () => {
    const handler = withErrorHandling(async () => { throw new NotFoundError('Room', 'x'); });
    const res = await handler(event, ctx as never, () => {}) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('maps ConflictError → 409 BOOKING_CONFLICT', async () => {
    const handler = withErrorHandling(async () => { throw new ConflictError([]); });
    const res = await handler(event, ctx as never, () => {}) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('BOOKING_CONFLICT');
  });

  it('maps CapacityReductionError → 422 CAPACITY_REDUCTION_BLOCKED', async () => {
    const handler = withErrorHandling(async () => { throw new CapacityReductionError([]); });
    const res = await handler(event, ctx as never, () => {}) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error.code).toBe('CAPACITY_REDUCTION_BLOCKED');
  });

  it('maps unknown Error → 500 INTERNAL_ERROR', async () => {
    const handler = withErrorHandling(async () => { throw new Error('boom'); });
    const res = await handler(event, ctx as never, () => {}) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error.code).toBe('INTERNAL_ERROR');
  });

  it('maps ConditionalCheckFailedException → 409 BOOKING_CONFLICT', async () => {
    const handler = withErrorHandling(async () => {
      const e = new Error('Conditional check failed');
      e.name = 'ConditionalCheckFailedException';
      throw e;
    });
    const res = await handler(event, ctx as never, () => {}) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('BOOKING_CONFLICT');
  });
});
