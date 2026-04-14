// Clove - Middleware Pipeline (Express.js-style Composition)

import type { CloveMiddleware, MiddlewareContext, CloveResponse } from "./types.js";

/**
 * Compose an array of middleware functions into a single middleware.
 *
 * Uses the Express.js-style "onion model": each middleware wraps the next.
 * The first middleware in the array is the outermost (runs first on the way
 * in, last on the way out). The final handler (fetch) sits at the center.
 *
 * Each middleware MUST either:
 * 1. Call `next()` to pass control downstream, OR
 * 2. Return a `CloveResponse` directly (short-circuit).
 *
 * Calling `next()` more than once throws an error.
 *
 * @example
 * ```ts
 * const composed = compose([loggingMiddleware, authMiddleware]);
 * const response = await composed(context, () => executeFetch(context));
 * ```
 */
export function compose(middlewares: CloveMiddleware[]): CloveMiddleware {
  // Validate at composition time
  for (const fn of middlewares) {
    if (typeof fn !== "function") {
      throw new TypeError(`Middleware must be a function, got ${typeof fn}`);
    }
  }

  return function composed(
    context: MiddlewareContext,
    finalHandler: () => Promise<CloveResponse>,
  ): Promise<CloveResponse> {
    let index = -1;

    function dispatch(i: number): Promise<CloveResponse> {
      // Guard against multiple next() calls
      if (i <= index) {
        return Promise.reject(
          new Error("next() was called multiple times within a single middleware"),
        );
      }
      index = i;

      const fn = middlewares[i];

      // No more middleware — call the final handler (fetch)
      if (!fn) {
        return finalHandler();
      }

      try {
        return Promise.resolve(fn(context, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}
