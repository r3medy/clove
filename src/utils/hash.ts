// Clove - Request Hashing

import type { MiddlewareContext } from "../core/types.js";

/**
 * Generate a deterministic hash key for a request context.
 * Used by the cache and dedup plugins to identify identical requests.
 *
 * The key is composed of: method + full URL (with sorted params) + serialized body.
 * This ensures that two requests with the same method, URL, params, and body
 * produce the same key regardless of property insertion order.
 */
export function hashRequest(context: MiddlewareContext): string {
  const { method, url, params, body } = context.config;

  const parts: string[] = [method, url];

  // Sorted params for deterministic keys
  if (params && Object.keys(params).length > 0) {
    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    parts.push(`?${sortedParams}`);
  }

  // Serialize body for non-GET/HEAD requests
  if (body !== undefined && body !== null) {
    try {
      parts.push(stableStringify(body));
    } catch {
      // If body can't be stringified (e.g., FormData, Blob), use a placeholder.
      // These requests typically shouldn't be cached/deduped anyway.
      parts.push(`[unstringifiable:${typeof body}]`);
    }
  }

  return parts.join("|");
}

/**
 * Stable JSON.stringify that sorts object keys for deterministic output.
 * This ensures `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the same string.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return "{" + entries.join(",") + "}";
}
