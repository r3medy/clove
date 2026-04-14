// Clove - Plugins Entry Point

// Plugin Registry
export { PluginRegistry } from "./registry.js";

// Built-in Plugin Factories
export { createSecurityPlugin } from "./security.js";
export { createCachePlugin } from "./cache.js";
export type { CacheControl } from "./cache.js";
export { createDedupPlugin } from "./dedup.js";
export { createRetryPlugin } from "./retry.js";
export { createSerializerPlugin } from "./serializer.js";
export { createZodPlugin } from "./zod.js";

// Re-export types relevant to plugin development
export type {
  ClovePlugin,
  CloveMiddleware,
  MiddlewareContext,
  CloveResponse,
  RetryConfig,
  CacheConfig,
  DedupConfig,
  SecurityConfig,
  Schema,
} from "../core/types.js";
