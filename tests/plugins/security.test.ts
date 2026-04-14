// ─────────────────────────────────────────────────────────────────────────────
// Tests — Security Plugin
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { createSecurityPlugin } from '../../src/plugins/security';
import { SecurityError } from '../../src/core/errors';
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
      dedup: false,
      security: { blockPrivateIPs: true, maxRedirects: 5, httpsOnly: false },
      ...overrides,
    },
    state: {},
  };
}

function createResponse(overrides: Partial<CloveResponse> = {}): CloveResponse {
  return {
    data: null,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    config: createContext().config,
    meta: { start: 0, end: 0, time: 0 },
    ...overrides,
  };
}

const next = () => Promise.resolve(createResponse());

describe('Security Plugin', () => {
  const plugin = createSecurityPlugin();
  const mw = plugin.middleware!();

  it('should pass through when security is disabled', async () => {
    const ctx = createContext({ security: false });
    const res = await mw(ctx, next);
    expect(res.status).toBe(200);
  });

  describe('SSRF Prevention', () => {
    it('should block requests to 127.0.0.1', async () => {
      const ctx = createContext({ baseURL: '', url: 'http://127.0.0.1/admin' });
      await expect(mw(ctx, next)).rejects.toThrow(SecurityError);
    });

    it('should block requests to 10.x.x.x', async () => {
      const ctx = createContext({ baseURL: '', url: 'http://10.0.0.1/internal' });
      await expect(mw(ctx, next)).rejects.toThrow(SecurityError);
    });

    it('should block requests to 192.168.x.x', async () => {
      const ctx = createContext({ baseURL: '', url: 'http://192.168.1.1/admin' });
      await expect(mw(ctx, next)).rejects.toThrow(SecurityError);
    });

    it('should block requests to 172.16-31.x.x', async () => {
      const ctx = createContext({ baseURL: '', url: 'http://172.16.0.1/secret' });
      await expect(mw(ctx, next)).rejects.toThrow(SecurityError);
    });

    it('should block requests to localhost', async () => {
      const ctx = createContext({ baseURL: '', url: 'http://localhost:3000/api' });
      await expect(mw(ctx, next)).rejects.toThrow(SecurityError);
    });

    it('should allow requests to public IPs', async () => {
      const ctx = createContext({ baseURL: '', url: 'https://93.184.216.34/api' });
      const res = await mw(ctx, next);
      expect(res.status).toBe(200);
    });

    it('should allow when blockPrivateIPs is false', async () => {
      const ctx = createContext({
        baseURL: '',
        url: 'http://127.0.0.1/admin',
        security: { blockPrivateIPs: false },
      });
      const res = await mw(ctx, next);
      expect(res.status).toBe(200);
    });
  });

  describe('Protocol Enforcement', () => {
    it('should block non-http/https protocols', async () => {
      const ctx = createContext({ baseURL: '', url: 'file:///etc/passwd' });
      await expect(mw(ctx, next)).rejects.toThrow('disallowed protocol');
    });

    it('should enforce HTTPS when httpsOnly is true', async () => {
      const ctx = createContext({
        baseURL: '',
        url: 'http://api.example.com/data',
        security: { httpsOnly: true, blockPrivateIPs: true },
      });
      await expect(mw(ctx, next)).rejects.toThrow('HTTPS required');
    });

    it('should allow HTTP when httpsOnly is false', async () => {
      const ctx = createContext({ baseURL: '', url: 'http://api.example.com/data' });
      const res = await mw(ctx, next);
      expect(res.status).toBe(200);
    });
  });

  describe('Domain Allow/Block List', () => {
    it('should allow domains in the allow list', async () => {
      const ctx = createContext({
        baseURL: '',
        url: 'https://api.example.com/data',
        security: { allowedDomains: ['api.example.com'], blockPrivateIPs: true },
      });
      const res = await mw(ctx, next);
      expect(res.status).toBe(200);
    });

    it('should block domains NOT in the allow list', async () => {
      const ctx = createContext({
        baseURL: '',
        url: 'https://evil.com/data',
        security: { allowedDomains: ['api.example.com'], blockPrivateIPs: true },
      });
      await expect(mw(ctx, next)).rejects.toThrow('Domain not in allow list');
    });

    it('should support wildcard domains in allow list', async () => {
      const ctx = createContext({
        baseURL: '',
        url: 'https://sub.example.com/data',
        security: { allowedDomains: ['*.example.com'], blockPrivateIPs: true },
      });
      const res = await mw(ctx, next);
      expect(res.status).toBe(200);
    });

    it('should block domains in the block list', async () => {
      const ctx = createContext({
        baseURL: '',
        url: 'https://evil.com/data',
        security: { blockedDomains: ['evil.com'], blockPrivateIPs: true },
      });
      await expect(mw(ctx, next)).rejects.toThrow('Domain is blocked');
    });

    it('should allow domains NOT in the block list', async () => {
      const ctx = createContext({
        baseURL: '',
        url: 'https://good.com/data',
        security: { blockedDomains: ['evil.com'], blockPrivateIPs: true },
      });
      const res = await mw(ctx, next);
      expect(res.status).toBe(200);
    });
  });

  describe('Response Size', () => {
    it('should reject responses exceeding maxResponseSize', async () => {
      const ctx = createContext({
        security: { maxResponseSize: 1024, blockPrivateIPs: true },
      });
      const bigNext = () =>
        Promise.resolve(
          createResponse({
            headers: new Headers({ 'content-length': '2048' }),
          }),
        );
      await expect(mw(ctx, bigNext)).rejects.toThrow('exceeds limit');
    });

    it('should allow responses within maxResponseSize', async () => {
      const ctx = createContext({
        security: { maxResponseSize: 1024, blockPrivateIPs: true },
      });
      const smallNext = () =>
        Promise.resolve(
          createResponse({
            headers: new Headers({ 'content-length': '512' }),
          }),
        );
      const res = await mw(ctx, smallNext);
      expect(res.status).toBe(200);
    });
  });
});
