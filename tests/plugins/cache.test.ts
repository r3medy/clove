// ─────────────────────────────────────────────────────────────────────────────
// Tests — Cache Plugin
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCachePlugin } from '../../src/plugins/cache';
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
      cache: { ttl: 60_000, methods: ['GET'], maxEntries: 100 },
      dedup: false,
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
    headers: new Headers({ 'content-type': 'application/json' }),
    config: createContext().config,
    meta: { start: 0, end: 0, time: 10 },
  };
}

describe('Cache Plugin', () => {
  let plugin: ReturnType<typeof createCachePlugin>;

  beforeEach(() => {
    plugin = createCachePlugin();
  });

  it('should pass through when cache is disabled', async () => {
    const mw = plugin.middleware!();
    const ctx = createContext({ cache: false });
    const next = vi.fn().mockResolvedValue(createResponse());
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it('should pass through non-cacheable methods', async () => {
    const mw = plugin.middleware!();
    const ctx = createContext({ method: 'POST' });
    const next = vi.fn().mockResolvedValue(createResponse());
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it('should cache responses and return cached on second call', async () => {
    const mw = plugin.middleware!();
    const ctx = createContext();
    const next = vi.fn().mockResolvedValue(createResponse({ id: 1 }));

    // First call — should hit next()
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Second call — should return from cache, NOT call next()
    const next2 = vi.fn();
    const cached = await mw(createContext(), next2);
    expect(next2).not.toHaveBeenCalled();
    expect(cached.meta.cached).toBe(true);
    expect(cached.data).toEqual({ id: 1 });
  });

  it('should return stale data after TTL expires', async () => {
    const mw = plugin.middleware!();
    const ctx = createContext({ cache: { ttl: 1, methods: ['GET'], maxEntries: 100 } });

    const next = vi.fn().mockResolvedValue(createResponse('first'));
    await mw(ctx, next);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 10));

    const next2 = vi.fn().mockResolvedValue(createResponse('second'));
    const res = await mw(createContext({ cache: { ttl: 1, methods: ['GET'], maxEntries: 100 } }), next2);

    // After TTL, should call next() again
    expect(next2).toHaveBeenCalled();
    expect(res.data).toBe('second');
  });

  it('should expose cache control API', () => {
    expect(plugin.cache).toBeDefined();
    expect(typeof plugin.cache.clear).toBe('function');
    expect(typeof plugin.cache.invalidate).toBe('function');
    expect(typeof plugin.cache.size).toBe('function');
    expect(typeof plugin.cache.has).toBe('function');
  });

  it('should respect maxEntries via LRU eviction', async () => {
    const mw = plugin.middleware!();

    // Set max entries to 2
    for (let i = 0; i < 5; i++) {
      const ctx = createContext({
        url: `/item/${i}`,
        cache: { ttl: 60_000, methods: ['GET'], maxEntries: 2 },
      });
      const next = vi.fn().mockResolvedValue(createResponse({ id: i }));
      await mw(ctx, next);
    }

    // Should only have 2 entries
    expect(plugin.cache.size()).toBe(2);
  });

  it('should clear cache on teardown', async () => {
    const mw = plugin.middleware!();
    const ctx = createContext();
    await mw(ctx, () => Promise.resolve(createResponse()));

    expect(plugin.cache.size()).toBeGreaterThan(0);
    plugin.teardown!();
    expect(plugin.cache.size()).toBe(0);
  });
});
