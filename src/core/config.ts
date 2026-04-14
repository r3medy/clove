// Clove - Configuration System

import type {
  CloveInstanceConfig,
  CloveRequestConfig,
  ResolvedCloveConfig,
  CloveHeaders,
  HttpMethod,
  ResponseType,
  RetryConfig,
  CacheConfig,
  DedupConfig,
  SecurityConfig,
} from "./types.js";
import { serializeParams } from "../utils/url.js";

// # Defaults

/**
 * Default instance configuration values.
 * All built-in plugins are enabled by default.
 */
export const DEFAULT_INSTANCE_CONFIG: Required<
  Pick<CloveInstanceConfig, "baseURL" | "timeout" | "headers" | "credentials" | "responseType">
> & {
  retry: RetryConfig;
  cache: CacheConfig;
  dedup: DedupConfig;
  security: SecurityConfig;
} = {
  baseURL: "",
  timeout: 5000,
  headers: {},
  credentials: "same-origin",
  responseType: "json",

  // Built-in plugin defaults
  retry: {
    attempts: 3,
    delay: 300,
    backoff: "exponential",
    jitter: true,
    retryOn: [408, 429, 500, 502, 503, 504],
  },
  cache: {
    ttl: 300_000, // 5 minutes
    methods: ["GET"],
    maxEntries: 100,
  },
  dedup: {
    methods: ["GET", "HEAD"],
  },
  security: {
    blockPrivateIPs: true,
    maxRedirects: 5,
    httpsOnly: false,
  },
};

// # Merge Logic

/**
 * Merge headers from two sources. Later values override earlier ones.
 * Only defined values are applied — undefined headers don't erase existing ones.
 */
function mergeHeaders(base: CloveHeaders, override: CloveHeaders): CloveHeaders {
  const result: CloveHeaders = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Merge a plugin config with possible per-request override.
 *
 * - Instance says `false` → disabled (per-request can't re-enable).
 * - Per-request says `false` → disabled for this request.
 * - Both are objects → shallow merge.
 * - Per-request is undefined → use instance value.
 */
function mergePluginConfig<T extends Record<string, unknown>>(
  instanceValue: T | false,
  requestValue: T | false | undefined,
): T | false {
  // Instance disabled → stays disabled
  if (instanceValue === false) return false;

  // Per-request not specified → use instance
  if (requestValue === undefined) return instanceValue;

  // Per-request disabled → disabled for this request
  if (requestValue === false) return false;

  // Both are objects → shallow merge
  return { ...instanceValue, ...requestValue };
}

/**
 * Normalize a params record: stringify all values, drop undefined/null.
 */
function normalizeParams(
  params?: Record<string, string | number | boolean | undefined | null>,
): Record<string, string> {
  if (!params) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
}

/**
 * Resolve the final configuration by merging all three layers:
 * Global Defaults → Instance Config → Per-Request Config.
 *
 * Returns a fully populated `ResolvedCloveConfig` with no optional fields.
 */
export function resolveConfig(
  instanceConfig: CloveInstanceConfig,
  requestConfig: CloveRequestConfig,
): ResolvedCloveConfig {
  // Layer 1: Defaults
  const defaults = DEFAULT_INSTANCE_CONFIG;

  // Layer 2: Instance overrides
  const baseURL = instanceConfig.baseURL ?? defaults.baseURL;
  const timeout = requestConfig.timeout ?? instanceConfig.timeout ?? defaults.timeout;
  const credentials =
    requestConfig.credentials ?? instanceConfig.credentials ?? defaults.credentials;
  const responseType =
    requestConfig.responseType ?? instanceConfig.responseType ?? defaults.responseType;

  // Headers: defaults → instance → per-request
  const headers = mergeHeaders(
    mergeHeaders(defaults.headers, instanceConfig.headers ?? {}),
    requestConfig.headers ?? {},
  );

  // Params: instance doesn't have params, only per-request
  const params = normalizeParams(requestConfig.params);

  // Plugin configs: merge instance + per-request
  const retry = mergePluginConfig(
    instanceConfig.retry === false ? false : { ...defaults.retry, ...(instanceConfig.retry ?? {}) },
    requestConfig.retry,
  ) as RetryConfig | false;

  const cache = mergePluginConfig(
    instanceConfig.cache === false ? false : { ...defaults.cache, ...(instanceConfig.cache ?? {}) },
    requestConfig.cache,
  ) as CacheConfig | false;

  const dedup = mergePluginConfig(
    instanceConfig.dedup === false ? false : { ...defaults.dedup, ...(instanceConfig.dedup ?? {}) },
    requestConfig.dedup,
  ) as DedupConfig | false;

  const security =
    instanceConfig.security === false
      ? false
      : ({ ...defaults.security, ...(instanceConfig.security ?? {}) } satisfies SecurityConfig);

  return {
    baseURL,
    url: requestConfig.url ?? "",
    method: (requestConfig.method ?? "GET") as HttpMethod,
    headers,
    params,
    body: requestConfig.body,
    timeout,
    credentials,
    responseType: responseType as ResponseType,
    signal: requestConfig.signal,
    schema: requestConfig.schema,
    retry,
    cache,
    dedup,
    security,
  };
}
