// Clove - Main Entry Point

import { CloveClient } from "./core/client.js";
import type { CloveInstanceConfig } from "./core/types.js";

// # Factory

/**
 * The `clove` namespace provides the primary factory for creating Clove clients.
 *
 * @example
 * ```ts
 * import { clove } from 'clove';
 *
 * const api = clove.create({
 *   baseURL: 'https://api.example.com',
 *   timeout: 10_000,
 *   retry: { attempts: 3 },
 *   security: { httpsOnly: true },
 * });
 *
 * const { data } = await api.get('/users');
 * ```
 */
export const clove = {
  /**
   * Create a new Clove client instance with the given configuration.
   * All built-in plugins are auto-injected and can be configured or
   * disabled through the config object.
   */
  create(config?: CloveInstanceConfig): CloveClient {
    return new CloveClient(config);
  },
};

// # Re-exports

// Core
export { CloveClient } from "./core/client.js";
export { resolveConfig, DEFAULT_INSTANCE_CONFIG } from "./core/config.js";
export { compose } from "./core/pipeline.js";
export { executeRequest } from "./core/request.js";

// Errors
export {
  CloveError,
  TimeoutError,
  CancelledError,
  NetworkError,
  ValidationError,
  HttpError,
  SecurityError,
} from "./core/errors.js";
export type { CloveErrorCode } from "./core/errors.js";

// Types
export type {
  HttpMethod,
  HttpHeaderName,
  CloveHeaders,
  ResponseType,
  CloveInstanceConfig,
  CloveRequestConfig,
  ResolvedCloveConfig,
  ResponseMeta,
  CloveResponse,
  CloveMiddleware,
  MiddlewareContext,
  ClovePlugin,
  Schema,
  RetryConfig,
  CacheConfig,
  DedupConfig,
  SecurityConfig,
  AtOnceRequest,
} from "./core/types.js";

// Utilities
export { buildURL, serializeParams, extractHostname, extractProtocol } from "./utils/url.js";
export { deepMerge } from "./utils/merge.js";
export { hashRequest } from "./utils/hash.js";
export { isPrivateHost, matchesDomain } from "./utils/ip.js";

// Plugin Registry
export { PluginRegistry } from "./plugins/registry.js";

// Built-in Plugin Factories
export { createSecurityPlugin } from "./plugins/security.js";
export { createCachePlugin } from "./plugins/cache.js";
export type { CacheControl } from "./plugins/cache.js";
export { createDedupPlugin } from "./plugins/dedup.js";
export { createRetryPlugin } from "./plugins/retry.js";
export { createSerializerPlugin } from "./plugins/serializer.js";
export { createZodPlugin } from "./plugins/zod.js";
