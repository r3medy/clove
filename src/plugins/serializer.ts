// Clove - Smart Serializer Plugin

import type { ClovePlugin } from "../core/types.js";

/**
 * Smart serializer plugin — automatically sets the correct `Content-Type`
 * header based on the request body type.
 *
 * Priority: 80 (runs just before fetch, after retry)
 *
 * While core `executeRequest()` already handles basic JSON serialization,
 * this plugin provides enhanced Content-Type enforcement for all body types:
 *
 * | Body Type         | Content-Type Set                          |
 * |-------------------|-------------------------------------------|
 * | Plain object/array| `application/json`                        |
 * | `FormData`        | *(browser auto-sets with boundary)*       |
 * | `URLSearchParams` | `application/x-www-form-urlencoded`       |
 * | `Blob` / `File`   | `blob.type` or `application/octet-stream` |
 * | `ArrayBuffer`     | `application/octet-stream`                |
 * | `string`          | `text/plain`                              |
 *
 * @example
 * ```ts
 * // Auto-detected as JSON
 * await api.post('/users', { name: 'Jane' });
 *
 * // Auto-detected as form data
 * const formData = new FormData();
 * formData.append('file', myFile);
 * await api.post('/upload', formData);
 *
 * // Auto-detected as URL-encoded
 * const params = new URLSearchParams({ grant_type: 'client_credentials' });
 * await api.post('/oauth/token', params);
 * ```
 */
export function createSerializerPlugin(): ClovePlugin {
  return {
    name: "serializer",
    priority: 80,

    middleware() {
      return async (ctx, next) => {
        const { body, method } = ctx.config;

        // Only process bodies on methods that support them
        if (body === undefined || method === "GET" || method === "HEAD") {
          return next();
        }

        // Check if Content-Type is already explicitly set by the user
        const hasContentType = Object.keys(ctx.config.headers).some(
          (key) => key.toLowerCase() === "content-type",
        );

        if (hasContentType) {
          // User explicitly set Content-Type — don't override
          return next();
        }

        // Detect and Set Content-Type
        const detectedType = detectContentType(body);

        if (detectedType) {
          ctx.config.headers = {
            ...ctx.config.headers,
            "Content-Type": detectedType,
          };
        }

        return next();
      };
    },
  };
}

/**
 * Detect the appropriate Content-Type for a request body.
 * Returns `null` for types where the browser should auto-set the header.
 */
function detectContentType(body: unknown): string | null {
  // FormData — DO NOT set Content-Type; browser auto-sets it with the boundary
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return null;
  }

  // URLSearchParams
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return "application/x-www-form-urlencoded";
  }

  // Blob / File
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return body.type || "application/octet-stream";
  }

  // ArrayBuffer / TypedArray
  if (
    typeof ArrayBuffer !== "undefined" &&
    (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
  ) {
    return "application/octet-stream";
  }

  // ReadableStream — no Content-Type, let it pass through
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return null;
  }

  // String
  if (typeof body === "string") {
    return "text/plain";
  }

  // Plain object or array → JSON
  if (typeof body === "object" && body !== null) {
    return "application/json";
  }

  return "text/plain";
}
