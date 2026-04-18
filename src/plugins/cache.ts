// Clove - Cache Plugin

import type { ClovePlugin, CloveResponse } from "../core/types.js";
import { hashRequest } from "../utils/hash.js";

/** A single entry in the cache store. */
interface CacheEntry {
  /** The cached response (cloned — safe to return to multiple callers). */
  response: CloveResponse;

  /** Timestamp (performance.now()) when this entry was stored. */
  timestamp: number;

  /** Time-to-live in milliseconds. */
  ttl: number;

  /** ETag from the response (for conditional requests). */
  etag?: string;

  /** Last-Modified from the response (for conditional requests). */
  lastModified?: string;
}

/** Cache control interface — exposed on the plugin for programmatic access. */
export interface CacheControl {
  /** Invalidate a specific cache entry by key. */
  invalidate(key: string): boolean;

  /** Invalidate all entries whose key starts with the given prefix. */
  invalidateByPrefix(prefix: string): number;

  /**
   * Invalidate all entries matching a glob pattern against the URL in the key.
   *
   * Supported patterns:
   * - `*` matches any single path segment (e.g., `/users/*` matches `/users/123`)
   * - `**` matches any number of segments (e.g., `/api/**` matches `/api/v1/users/123`)
   *
   * @returns Number of entries invalidated.
   */
  invalidateByPattern(pattern: string): number;

  /** Clear the entire cache. */
  clear(): void;

  /** Get the current number of cached entries. */
  size(): number;

  /** Check if a key exists in the cache (may be expired). */
  has(key: string): boolean;

  /** Get all cached keys (useful for debugging). */
  keys(): string[];
}

/**
 * Cache plugin — stores responses in memory with TTL-based expiration.
 *
 * Priority: 20 (runs after security, before dedup)
 *
 * Features:
 * - In-memory LRU cache with configurable max entries
 * - TTL-based expiration
 * - Conditional requests via ETag / If-Modified-Since
 * - Configurable methods to cache (default: GET only)
 * - Custom key generator support
 * - Cache control API for manual invalidation
 * - Glob-pattern cache invalidation
 *
 * @example
 * ```ts
 * const api = clove.create({
 *   cache: {
 *     ttl: 60_000,       // 1 minute
 *     maxEntries: 200,
 *     methods: ['GET'],
 *   },
 * });
 * ```
 */
export function createCachePlugin(): ClovePlugin & { cache: CacheControl } {
  const store = new Map<string, CacheEntry>();

  /**
   * Evict least-recently-used entries until we're at or below maxEntries.
   * Map iteration order is insertion order, and we re-insert on access,
   * so the oldest entries are at the front.
   */
  function evictToSize(maxEntries: number): void {
    while (store.size > maxEntries) {
      const firstKey = store.keys().next().value as string;
      store.delete(firstKey);
    }
  }

  /** Move an entry to the "most recently used" position by deleting and re-inserting. */
  function touch(key: string, entry: CacheEntry): void {
    store.delete(key);
    store.set(key, entry);
  }

  // Cache control API
  const cacheControl: CacheControl = {
    invalidate(key: string): boolean {
      return store.delete(key);
    },

    invalidateByPrefix(prefix: string): number {
      let count = 0;
      for (const key of Array.from(store.keys())) {
        if (key.startsWith(prefix)) {
          store.delete(key);
          count++;
        }
      }
      return count;
    },

    invalidateByPattern(pattern: string): number {
      const regex = globToRegex(pattern);
      let count = 0;
      for (const key of Array.from(store.keys())) {
        if (regex.test(key)) {
          store.delete(key);
          count++;
        }
      }
      return count;
    },

    clear(): void {
      store.clear();
    },

    size(): number {
      return store.size;
    },

    has(key: string): boolean {
      return store.has(key);
    },

    keys(): string[] {
      return Array.from(store.keys());
    },
  };

  return {
    name: "cache",
    priority: 20,
    cache: cacheControl,

    middleware() {
      return async (ctx, next) => {
        const cacheConfig = ctx.config.cache;

        // Plugin disabled for this request
        if (cacheConfig === false) return next();

        // Only cache configured methods
        const methods = cacheConfig.methods ?? ["GET"];
        if (!methods.includes(ctx.config.method)) return next();

        // Generate cache key
        const key = cacheConfig.keyGenerator ? cacheConfig.keyGenerator(ctx) : hashRequest(ctx);

        // Check Cache
        const cached = store.get(key);

        if (cached) {
          const age = performance.now() - cached.timestamp;

          // Cache hit & fresh — return immediately
          if (age < cached.ttl) {
            touch(key, cached);
            return {
              ...cached.response,
              config: ctx.config, // Use current request's config
              meta: { ...cached.response.meta, cached: true },
            };
          }

          // Cache hit but stale — try conditional request
          if (cached.etag) {
            ctx.config.headers = {
              ...ctx.config.headers,
              "If-None-Match": cached.etag,
            };
          }
          if (cached.lastModified) {
            ctx.config.headers = {
              ...ctx.config.headers,
              "If-Modified-Since": cached.lastModified,
            };
          }
        }

        // Execute Request
        const response = await next();

        // Handle 304 Not Modified
        if (response.status === 304 && cached) {
          // Refresh the TTL on the cached entry
          cached.timestamp = performance.now();
          touch(key, cached);
          return {
            ...cached.response,
            config: ctx.config,
            meta: { ...cached.response.meta, cached: true },
          };
        }

        // Store in Cache
        const ttl = cacheConfig.ttl ?? 300_000;
        const maxEntries = cacheConfig.maxEntries ?? 100;

        const entry: CacheEntry = {
          response: { ...response },
          timestamp: performance.now(),
          ttl,
          etag: response.headers.get("etag") ?? undefined,
          lastModified: response.headers.get("last-modified") ?? undefined,
        };

        store.set(key, entry);
        evictToSize(maxEntries);

        return response;
      };
    },

    teardown() {
      store.clear();
    },
  };
}

/**
 * Convert a glob pattern to a regular expression.
 *
 * - `**` → matches any number of path segments (including none)
 * - `*` → matches any single path segment (non-slash)
 * - All other regex special characters are escaped.
 */
function globToRegex(pattern: string): RegExp {
  // Escape regex special characters (except * which we handle)
  let regex = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

  // Replace ** first (greedy multi-segment match)
  regex = regex.replace(/\*\*/g, "___DOUBLE_STAR___");

  // Replace single * (single segment — no slashes)
  regex = regex.replace(/\*/g, "[^/]*");

  // Restore double star
  regex = regex.replace(/___DOUBLE_STAR___/g, ".*");

  return new RegExp(regex);
}
