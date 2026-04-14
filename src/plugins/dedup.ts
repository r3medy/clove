// Clove - Deduplication Plugin

import type { ClovePlugin, CloveResponse } from "../core/types.js";
import { hashRequest } from "../utils/hash.js";

/**
 * Deduplication plugin — prevents identical concurrent requests from firing
 * multiple network calls. When multiple callers request the same resource
 * simultaneously, only one fetch is executed and all callers share the result.
 *
 * Priority: 30 (runs after cache — if cache misses, dedup kicks in)
 *
 * How it works:
 * 1. Before fetch: check if an identical request is already in-flight
 * 2. If yes → wait for the existing promise and return a copy of its result
 * 3. If no  → execute the request, store the promise, and clean up on completion
 *
 * @example
 * ```ts
 * const api = clove.create({
 *   dedup: { methods: ['GET', 'HEAD'] },
 * });
 *
 * // These fire simultaneously — only ONE actual fetch happens:
 * const [r1, r2, r3] = await Promise.all([
 *   api.get('/users'),
 *   api.get('/users'),
 *   api.get('/users'),
 * ]);
 * ```
 */
export function createDedupPlugin(): ClovePlugin {
  /** Map of request hash → in-flight promise. */
  const inFlight = new Map<string, Promise<CloveResponse>>();

  return {
    name: "dedup",
    priority: 30,

    middleware() {
      return async (ctx, next) => {
        const dedupConfig = ctx.config.dedup;

        // Plugin disabled for this request
        if (dedupConfig === false) return next();

        // Only dedup safe methods (mutations should always execute)
        const methods = dedupConfig.methods ?? ["GET", "HEAD"];
        if (!methods.includes(ctx.config.method)) return next();

        // Generate dedup key
        const key = dedupConfig.keyGenerator ? dedupConfig.keyGenerator(ctx) : hashRequest(ctx);

        // Check In-Flight Map
        const existing = inFlight.get(key);

        if (existing) {
          // Another caller already fired this request — wait for it
          const response = await existing;
          return {
            ...response,
            config: ctx.config,
            meta: { ...response.meta, deduplicated: true },
          };
        }

        // Execute & Store
        // Create the promise BEFORE awaiting it so concurrent callers
        // can find it in the map.
        const promise = next();
        inFlight.set(key, promise);

        try {
          return await promise;
        } finally {
          // Always clean up — whether resolved or rejected
          inFlight.delete(key);
        }
      };
    },

    teardown() {
      inFlight.clear();
    },
  };
}
