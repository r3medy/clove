// ─────────────────────────────────────────────────────────────────────────────
// Tests — Zod Validation Plugin
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { createZodPlugin } from '../../src/plugins/zod';
import { ValidationError } from '../../src/core/errors';
import type { MiddlewareContext, CloveResponse, ResolvedCloveConfig, Schema } from '../../src/core/types';

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
      security: false,
      ...overrides,
    },
    state: {},
  };
}

function createResponse(data: unknown = { id: 1, name: 'John' }): CloveResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    config: createContext().config,
    meta: { start: 0, end: 0, time: 10 },
  };
}

// Simple schema mock (matches Zod's parse interface)
function createSchema<T>(validator: (data: unknown) => T): Schema<T> {
  return {
    parse: validator,
  };
}

describe('Zod Validation Plugin', () => {
  const plugin = createZodPlugin();
  const mw = plugin.middleware!();

  it('should pass through when no schema is provided', async () => {
    const ctx = createContext();
    const response = createResponse({ id: 1 });
    const next = () => Promise.resolve(response);

    const res = await mw(ctx, next);
    expect(res.data).toEqual({ id: 1 });
  });

  it('should validate and pass when data matches schema', async () => {
    const schema = createSchema((data) => {
      const obj = data as { id: number; name: string };
      if (typeof obj.id !== 'number' || typeof obj.name !== 'string') {
        throw new Error('Invalid shape');
      }
      return obj;
    });

    const ctx = createContext({ schema });
    const next = () => Promise.resolve(createResponse({ id: 1, name: 'John' }));

    const res = await mw(ctx, next);
    expect(res.data).toEqual({ id: 1, name: 'John' });
  });

  it('should throw ValidationError when data fails schema', async () => {
    const schema = createSchema((data) => {
      const obj = data as { id: number };
      if (typeof obj.id !== 'number') {
        throw new Error('Expected number');
      }
      return obj;
    });

    const ctx = createContext({ schema });
    const next = () => Promise.resolve(createResponse({ id: 'not-a-number' }));

    await expect(mw(ctx, next)).rejects.toThrow(ValidationError);
  });

  it('should include the original validation error in the thrown error', async () => {
    const zodLikeError = {
      issues: [
        { path: ['id'], message: 'Expected number, received string' },
        { path: ['name'], message: 'Required' },
      ],
    };

    const schema = createSchema(() => {
      throw zodLikeError;
    });

    const ctx = createContext({ schema });
    const next = () => Promise.resolve(createResponse({}));

    try {
      await mw(ctx, next);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationErr = error as ValidationError;
      expect(validationErr.validationError).toBe(zodLikeError);
      expect(validationErr.message).toContain('id');
      expect(validationErr.message).toContain('name');
    }
  });

  it('should transform data through the schema', async () => {
    // Schema that transforms the data (e.g., adds defaults, strips extra fields)
    const schema = createSchema((data) => {
      const obj = data as Record<string, unknown>;
      return { id: Number(obj['id']), clean: true };
    });

    const ctx = createContext({ schema });
    const next = () => Promise.resolve(createResponse({ id: '42', extra: 'removed' }));

    const res = await mw(ctx, next);
    expect(res.data).toEqual({ id: 42, clean: true });
  });
});
