// ─────────────────────────────────────────────────────────────────────────────
// Tests — Middleware Pipeline
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { compose } from '../../src/core/pipeline';
import type { CloveMiddleware, MiddlewareContext, CloveResponse } from '../../src/core/types';

// Helper to create a minimal context
function createContext(): MiddlewareContext {
  return {
    config: {
      baseURL: '',
      url: '/test',
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
    },
    state: {},
  };
}

// Helper to create a minimal response
function createResponse(data: unknown = null): CloveResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    config: createContext().config,
    meta: { start: 0, end: 0, time: 0 },
  };
}

describe('compose', () => {
  it('should call the final handler when no middleware is provided', async () => {
    const handler = vi.fn().mockResolvedValue(createResponse('ok'));
    const composed = compose([]);
    const context = createContext();

    const result = await composed(context, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(result.data).toBe('ok');
  });

  it('should execute middleware in order (before phase)', async () => {
    const order: number[] = [];

    const mw1: CloveMiddleware = async (ctx, next) => {
      order.push(1);
      return next();
    };
    const mw2: CloveMiddleware = async (ctx, next) => {
      order.push(2);
      return next();
    };
    const mw3: CloveMiddleware = async (ctx, next) => {
      order.push(3);
      return next();
    };

    const composed = compose([mw1, mw2, mw3]);
    await composed(createContext(), () => Promise.resolve(createResponse()));

    expect(order).toEqual([1, 2, 3]);
  });

  it('should execute middleware in reverse order (after phase)', async () => {
    const order: string[] = [];

    const mw1: CloveMiddleware = async (ctx, next) => {
      order.push('1-before');
      const res = await next();
      order.push('1-after');
      return res;
    };
    const mw2: CloveMiddleware = async (ctx, next) => {
      order.push('2-before');
      const res = await next();
      order.push('2-after');
      return res;
    };

    const composed = compose([mw1, mw2]);
    await composed(createContext(), () => Promise.resolve(createResponse()));

    expect(order).toEqual(['1-before', '2-before', '2-after', '1-after']);
  });

  it('should allow middleware to short-circuit without calling next()', async () => {
    const handler = vi.fn();
    const cachedResponse = createResponse('cached');

    const cacheMiddleware: CloveMiddleware = async () => {
      return cachedResponse; // Short-circuit: don't call next()
    };

    const composed = compose([cacheMiddleware]);
    const result = await composed(createContext(), handler);

    expect(handler).not.toHaveBeenCalled();
    expect(result.data).toBe('cached');
  });

  it('should reject if next() is called more than once', async () => {
    const badMiddleware: CloveMiddleware = async (ctx, next) => {
      await next();
      return next(); // Double call — should throw
    };

    const composed = compose([badMiddleware]);

    await expect(
      composed(createContext(), () => Promise.resolve(createResponse())),
    ).rejects.toThrow('next() was called multiple times');
  });

  it('should propagate errors from downstream', async () => {
    const mw: CloveMiddleware = async (ctx, next) => {
      return next();
    };

    const composed = compose([mw]);
    const error = new Error('downstream failure');

    await expect(
      composed(createContext(), () => Promise.reject(error)),
    ).rejects.toThrow('downstream failure');
  });

  it('should allow middleware to catch and handle errors', async () => {
    const fallbackResponse = createResponse('fallback');

    const errorHandler: CloveMiddleware = async (ctx, next) => {
      try {
        return await next();
      } catch {
        return fallbackResponse;
      }
    };

    const composed = compose([errorHandler]);
    const result = await composed(createContext(), () => Promise.reject(new Error('fail')));

    expect(result.data).toBe('fallback');
  });

  it('should allow middleware to modify context state', async () => {
    const mw: CloveMiddleware = async (ctx, next) => {
      ctx.state['injected'] = true;
      return next();
    };

    const context = createContext();
    const composed = compose([mw]);
    await composed(context, () => Promise.resolve(createResponse()));

    expect(context.state['injected']).toBe(true);
  });

  it('should throw TypeError for non-function middleware', () => {
    expect(() => compose(['not-a-function' as unknown as CloveMiddleware])).toThrow(TypeError);
  });

  it('should allow middleware to transform the response', async () => {
    const transformer: CloveMiddleware = async (ctx, next) => {
      const response = await next();
      return { ...response, data: 'transformed' };
    };

    const composed = compose([transformer]);
    const result = await composed(createContext(), () =>
      Promise.resolve(createResponse('original')),
    );

    expect(result.data).toBe('transformed');
  });
});
