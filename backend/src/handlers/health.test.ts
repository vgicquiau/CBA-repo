import { describe, it, expect } from 'vitest';
import { makeEvent, callHandler } from '../__tests__/helpers';
import { handler } from './health';

describe('GET /v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await callHandler(handler as never, makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });
});
