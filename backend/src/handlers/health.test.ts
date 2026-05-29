import { describe, it, expect } from 'vitest';
import { makeRequest, callHandler } from '../__tests__/helpers';
import { handler } from './health';

describe('GET /v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await callHandler(handler, makeRequest());
    expect(res.status).toBe(200);
    const body = res.jsonBody as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });
});
