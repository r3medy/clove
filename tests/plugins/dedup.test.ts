// ─────────────────────────────────────────────────────────────────────────────
// Tests — Dedup Plugin
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDedupPlugin } from '../../src/plugins/dedup';
import type { MiddlewareContext, CloveResponse, ResolvedCloveConfig } from '../../src/core/types';

function createContext(overrides: Partial<ResolvedCloveConfig> = {}): MiddlewareContext {
  return {
    config: {
      baseURL: 'https://api.example.com',
      url: '/users',
      method: 'GET',
      headers: {},
      params: {},
      timeout: 5000,
      credentials: 'same-origin',
      responseType: 'json',
      retry: false,
      cache: false,
      dedup: { methods: ['GET', 'HEAD'] },
      security: false,
      ...overrides,
    },
    state: {},
  };
}

function createResponse(data: unknown = { id: 1 }): CloveResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    config: createContext().config,
    meta: { start: 0, end: 0, time: 10 },
  };
}

describe('Dedup Plugin', () => {
  let plugin: ReturnType<typeof createDedupPlugin>;

  beforeEach(() => {
    plugin = createDedupPlugin();
  });

  it('should pass through when dedup is disabled', async () => {
    const mw = plugin.middleware!();
    const ctx = createContext({ dedup: false });
    const next = vi.fn().mockResolvedValue(createResponse());
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it('should pass through POST requests by default', async () => {
    const mw = plugin.middleware!();
    const ctx = createContext({ method: 'POST' });
    const next = vi.fn().mockResolvedValue(createResponse());
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it('should deduplicate concurrent identical GET requests', async () => {
    const mw = plugin.middleware!();
    let resolveNext!: (value: CloveResponse) => void;
    const nextPromise = new Promise<CloveResponse>((r) => { resolveNext = r; });
    const next = vi.fn().mockReturnValue(nextPromise);

    // Fire 3 identical requests simultaneously
    const p1 = mw(createContext(), next);
    const p2 = mw(createContext(), next);
    const p3 = mw(createContext(), next);

    // Only ONE should call next()
    expect(next).toHaveBeenCalledTimes(1);

    // Resolve the single network call
    resolveNext(createResponse('shared'));

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // All should get the data
    expect(r1.data).toBe('shared');
    expect(r2.data).toBe('shared');
    expect(r3.data).toBe('shared');

    // The deduped responses should be marked
    expect(r2.meta.deduplicated).toBe(true);
    expect(r3.meta.deduplicated).toBe(true);
  });

  it('should NOT deduplicate requests with different URLs', async () => {
    const mw = plugin.middleware!();
    const next = vi.fn().mockResolvedValue(createResponse());

    await Promise.all([
      mw(createContext({ url: '/users' }), next),
      mw(createContext({ url: '/posts' }), next),
    ]);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should clean up after request completes', async () => {
    const mw = plugin.middleware!();
    const next = vi.fn().mockResolvedValue(createResponse());

    // First request
    await mw(createContext(), next);
    expect(next).toHaveBeenCalledTimes(1);

    // Second request (after first completed) — should NOT be deduped
    await mw(createContext(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should clean up on error', async () => {
    const mw = plugin.middleware!();
    const error = new Error('network failed');
    const failingNext = vi.fn().mockRejectedValue(error);

    // This should fail
    await expect(mw(createContext(), failingNext)).rejects.toThrow('network failed');

    // Next request should NOT be deduped (the failed promise was cleaned up)
    const successNext = vi.fn().mockResolvedValue(createResponse());
    await mw(createContext(), successNext);
    expect(successNext).toHaveBeenCalledTimes(1);
  });
});
