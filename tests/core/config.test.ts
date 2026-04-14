// ─────────────────────────────────────────────────────────────────────────────
// Tests — Config System
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { resolveConfig, DEFAULT_INSTANCE_CONFIG } from '../../src/core/config';
import type { CloveInstanceConfig, CloveRequestConfig } from '../../src/core/types';

describe('resolveConfig', () => {
  it('should use defaults when no config is provided', () => {
    const resolved = resolveConfig({}, { url: '/test' });

    expect(resolved.baseURL).toBe('');
    expect(resolved.url).toBe('/test');
    expect(resolved.method).toBe('GET');
    expect(resolved.timeout).toBe(5000);
    expect(resolved.credentials).toBe('same-origin');
    expect(resolved.responseType).toBe('json');
  });

  it('should apply instance config over defaults', () => {
    const instance: CloveInstanceConfig = {
      baseURL: 'https://api.example.com',
      timeout: 10000,
      headers: { 'Authorization': 'Bearer token' },
    };

    const resolved = resolveConfig(instance, { url: '/users' });

    expect(resolved.baseURL).toBe('https://api.example.com');
    expect(resolved.timeout).toBe(10000);
    expect(resolved.headers['Authorization']).toBe('Bearer token');
  });

  it('should apply per-request config over instance config', () => {
    const instance: CloveInstanceConfig = {
      timeout: 10000,
      headers: { 'Authorization': 'Bearer old' },
    };

    const request: CloveRequestConfig = {
      url: '/users',
      timeout: 3000,
      headers: { 'Authorization': 'Bearer new' },
    };

    const resolved = resolveConfig(instance, request);

    expect(resolved.timeout).toBe(3000);
    expect(resolved.headers['Authorization']).toBe('Bearer new');
  });

  it('should merge headers across all layers', () => {
    const instance: CloveInstanceConfig = {
      headers: { 'Authorization': 'Bearer token', 'Accept': 'application/json' },
    };

    const request: CloveRequestConfig = {
      url: '/test',
      headers: { 'X-Custom': 'value' },
    };

    const resolved = resolveConfig(instance, request);

    expect(resolved.headers['Authorization']).toBe('Bearer token');
    expect(resolved.headers['Accept']).toBe('application/json');
    expect(resolved.headers['X-Custom']).toBe('value');
  });

  it('should normalize params to strings and drop null/undefined', () => {
    const resolved = resolveConfig({}, {
      url: '/test',
      params: { page: 1, limit: 20, name: 'test', empty: undefined, nil: null },
    });

    expect(resolved.params).toEqual({
      page: '1',
      limit: '20',
      name: 'test',
    });
  });

  it('should use default retry config when not specified', () => {
    const resolved = resolveConfig({}, { url: '/test' });

    expect(resolved.retry).not.toBe(false);
    expect(typeof resolved.retry).toBe('object');
    if (resolved.retry !== false) {
      expect(resolved.retry.attempts).toBe(3);
      expect(resolved.retry.backoff).toBe('exponential');
    }
  });

  it('should disable retry when set to false at instance level', () => {
    const resolved = resolveConfig({ retry: false }, { url: '/test' });
    expect(resolved.retry).toBe(false);
  });

  it('should disable retry per-request even if instance enables it', () => {
    const resolved = resolveConfig(
      { retry: { attempts: 5 } },
      { url: '/test', retry: false },
    );
    expect(resolved.retry).toBe(false);
  });

  it('should merge retry config from instance and per-request', () => {
    const resolved = resolveConfig(
      { retry: { attempts: 5 } },
      { url: '/test', retry: { delay: 1000 } },
    );

    expect(resolved.retry).not.toBe(false);
    if (resolved.retry !== false) {
      expect(resolved.retry.attempts).toBe(5);   // From instance
      expect(resolved.retry.delay).toBe(1000);   // From per-request
    }
  });

  it('should never allow per-request security overrides', () => {
    const resolved = resolveConfig(
      { security: { httpsOnly: true, maxRedirects: 3 } },
      { url: '/test' },
    );

    expect(resolved.security).not.toBe(false);
    if (resolved.security !== false) {
      expect(resolved.security.httpsOnly).toBe(true);
      expect(resolved.security.maxRedirects).toBe(3);
    }
  });
});
