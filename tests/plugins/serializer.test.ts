// ─────────────────────────────────────────────────────────────────────────────
// Tests — Serializer Plugin
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { createSerializerPlugin } from '../../src/plugins/serializer';
import type { MiddlewareContext, CloveResponse, ResolvedCloveConfig } from '../../src/core/types';

function createContext(overrides: Partial<ResolvedCloveConfig> = {}): MiddlewareContext {
  return {
    config: {
      baseURL: 'https://api.example.com',
      url: '/users',
      method: 'POST',
      headers: {},
      params: {},
      timeout: 5000,
      credentials: 'same-origin',
      responseType: 'json',
      retry: false,
      cache: false,
      dedup: false,
      security: false,
      ...overrides,
    },
    state: {},
  };
}

function createResponse(): CloveResponse {
  return {
    data: null,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    config: createContext().config,
    meta: { start: 0, end: 0, time: 0 },
  };
}

const next = () => Promise.resolve(createResponse());

describe('Serializer Plugin', () => {
  const plugin = createSerializerPlugin();
  const mw = plugin.middleware!();

  it('should set application/json for plain objects', async () => {
    const ctx = createContext({ body: { name: 'John' } });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBe('application/json');
  });

  it('should set application/json for arrays', async () => {
    const ctx = createContext({ body: [1, 2, 3] });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBe('application/json');
  });

  it('should set text/plain for strings', async () => {
    const ctx = createContext({ body: 'hello world' });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBe('text/plain');
  });

  it('should set application/x-www-form-urlencoded for URLSearchParams', async () => {
    const ctx = createContext({ body: new URLSearchParams({ key: 'value' }) });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('should set application/octet-stream for ArrayBuffer', async () => {
    const ctx = createContext({ body: new ArrayBuffer(8) });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('should set blob type for Blob', async () => {
    const ctx = createContext({ body: new Blob(['test'], { type: 'image/png' }) });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBe('image/png');
  });

  it('should NOT set Content-Type for FormData (browser handles boundary)', async () => {
    const ctx = createContext({ body: new FormData() });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBeUndefined();
  });

  it('should NOT override user-set Content-Type', async () => {
    const ctx = createContext({
      body: { name: 'John' },
      headers: { 'Content-Type': 'text/xml' },
    });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBe('text/xml');
  });

  it('should skip body processing for GET requests', async () => {
    const ctx = createContext({ method: 'GET', body: { query: 'test' } });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBeUndefined();
  });

  it('should skip body processing for HEAD requests', async () => {
    const ctx = createContext({ method: 'HEAD', body: undefined });
    await mw(ctx, next);
    expect(ctx.config.headers['Content-Type']).toBeUndefined();
  });
});
