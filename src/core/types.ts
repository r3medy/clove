// Clove - Core Type Definitions

// # HTTP Primitives

/** Supported HTTP methods. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * Standard HTTP header names with autocomplete support.
 * The `(string & {})` allows custom headers while preserving IDE autocompletion.
 */
export type HttpHeaderName =
  // Standard Request Headers
  | "Accept"
  | "Accept-Charset"
  | "Accept-Encoding"
  | "Accept-Language"
  | "Authorization"
  | "Cache-Control"
  | "Connection"
  | "Content-Disposition"
  | "Content-Encoding"
  | "Content-Language"
  | "Content-Length"
  | "Content-Type"
  | "Cookie"
  | "Date"
  | "Expect"
  | "Forwarded"
  | "From"
  | "Host"
  | "If-Match"
  | "If-Modified-Since"
  | "If-None-Match"
  | "If-Range"
  | "If-Unmodified-Since"
  | "Keep-Alive"
  | "Origin"
  | "Pragma"
  | "Range"
  | "Referer"
  | "User-Agent"
  | "Via"
  | "X-Forwarded-For"
  | "X-Forwarded-Host"
  | "X-Forwarded-Proto"
  | "X-Requested-With"
  // Standard Response Headers
  | "Access-Control-Allow-Origin"
  | "Access-Control-Allow-Methods"
  | "Access-Control-Allow-Headers"
  | "Access-Control-Expose-Headers"
  | "Access-Control-Max-Age"
  | "Age"
  | "Allow"
  | "ETag"
  | "Expires"
  | "Last-Modified"
  | "Location"
  | "Retry-After"
  | "Server"
  | "Set-Cookie"
  | "Vary"
  // Security Headers
  | "Content-Security-Policy"
  | "Strict-Transport-Security"
  | "X-Content-Type-Options"
  | "X-Frame-Options"
  | "X-XSS-Protection"
  // Custom header escape hatch — preserves autocomplete for known headers
  | (string & {});

/** HTTP headers map with autocomplete for standard header names. */
export type CloveHeaders = Partial<Record<HttpHeaderName, string>>;

/** Response body type hint. */
export type ResponseType = "json" | "text" | "blob" | "arrayBuffer" | "formData" | "stream";

// # Configuration

/**
 * Instance-level configuration. Set once when creating a Clove client.
 * Built-in plugin options are configured here — all plugins are auto-injected.
 */
export interface CloveInstanceConfig {
  /** Base URL prepended to all relative request URLs. */
  baseURL?: string;

  /** Default timeout in milliseconds. Default: 5000. Set to 0 for no timeout. */
  timeout?: number;

  /** Default headers sent with every request. */
  headers?: CloveHeaders;

  /** Default credentials mode. */
  credentials?: RequestCredentials;

  /** Default response body type. Default: 'json'. */
  responseType?: ResponseType;

  // Built-in plugin configuration (all auto-injected)
  // Set to `false` to disable a plugin entirely.

  /** Retry plugin config. Default: enabled with 3 attempts. */
  retry?: RetryConfig | false;

  /** Cache plugin config. Default: enabled with 5-minute TTL for GET requests. */
  cache?: CacheConfig | false;

  /** Deduplication plugin config. Default: enabled for GET/HEAD. */
  dedup?: DedupConfig | false;

  /** Security plugin config. Default: enabled with SSRF protection. */
  security?: SecurityConfig | false;
}

/** Per-request configuration. Merged with instance config at request time. */
export interface CloveRequestConfig {
  /** Request URL (relative to baseURL or absolute). */
  url?: string;

  /** HTTP method. Default: 'GET'. */
  method?: HttpMethod;

  /** Request headers (merged with instance defaults). */
  headers?: CloveHeaders;

  /** URL query parameters. Automatically serialized into the query string. */
  params?: Record<string, string | number | boolean | undefined | null>;

  /** Request body. Automatically serialized based on type. */
  body?: unknown;

  /** Timeout override for this request (ms). */
  timeout?: number;

  /** Credentials override for this request. */
  credentials?: RequestCredentials;

  /** Response type override for this request. */
  responseType?: ResponseType;

  /** AbortSignal for manual request cancellation. */
  signal?: AbortSignal;

  /**
   * Validation schema (Zod-compatible). Must implement `parse(data: unknown): T`.
   * When set, the response data is validated and the return type is inferred from the schema.
   */
  schema?: Schema;

  // Per-request plugin overrides

  /** Override retry config for this request. Set `false` to skip retry. */
  retry?: RetryConfig | false;

  /** Override cache config for this request. Set `false` to skip cache. */
  cache?: CacheConfig | false;

  /** Override dedup config for this request. Set `false` to skip dedup. */
  dedup?: DedupConfig | false;
}

/**
 * Fully resolved configuration after merging all layers.
 * Guaranteed to have all required fields populated.
 */
export interface ResolvedCloveConfig {
  baseURL: string;
  url: string;
  method: HttpMethod;
  headers: CloveHeaders;
  params: Record<string, string>;
  body?: unknown;
  timeout: number;
  credentials: RequestCredentials;
  responseType: ResponseType;
  signal?: AbortSignal;
  schema?: Schema;

  // Resolved plugin configs
  retry: RetryConfig | false;
  cache: CacheConfig | false;
  dedup: DedupConfig | false;
  security: SecurityConfig | false;
}

// # Response

/** Timing and diagnostic metadata attached to every response. */
export interface ResponseMeta {
  /** Timestamp (performance.now()) when the request was initiated. */
  start: number;

  /** Timestamp (performance.now()) when the response was received. */
  end: number;

  /** Total round-trip time in milliseconds (end - start). */
  time: number;

  /** Number of retries executed (set by retry plugin). */
  retries?: number;

  /** Whether this response was served from cache (set by cache plugin). */
  cached?: boolean;

  /** Whether this response was shared via deduplication (set by dedup plugin). */
  deduplicated?: boolean;
}

/** The enriched response object returned from every Clove request. */
export interface CloveResponse<T = unknown> {
  /** Parsed response body. */
  data: T;

  /** HTTP status code. */
  status: number;

  /** HTTP status text. */
  statusText: string;

  /** Response headers. */
  headers: Headers;

  /** The resolved config that produced this request. */
  config: ResolvedCloveConfig;

  /** Timing and diagnostic metadata. */
  meta: ResponseMeta;
}

// # Middleware

/**
 * Express.js-style middleware function.
 * Call `next()` to pass control to the next middleware in the stack.
 * The return value of `next()` is the response from downstream.
 */
export type CloveMiddleware = (
  context: MiddlewareContext,
  next: () => Promise<CloveResponse>,
) => Promise<CloveResponse>;

/**
 * Context object passed through the middleware pipeline.
 * Provides access to the resolved config and a `state` bag for inter-middleware data.
 */
export interface MiddlewareContext {
  /** Fully resolved request configuration. */
  config: ResolvedCloveConfig;

  /**
   * Arbitrary key-value store for middlewares to communicate.
   * Example: a timing middleware sets `state.startTime`, a logging middleware reads it.
   */
  state: Record<string, unknown>;
}

// # Plugin System

/**
 * A Clove plugin extends functionality by contributing a middleware function
 * and optional setup/teardown lifecycle hooks.
 *
 * Built-in plugins (retry, cache, dedup, security, zod, serializer) are
 * auto-injected. Custom plugins can be added via `client.plugins.add()`.
 */
export interface ClovePlugin {
  /** Unique plugin name used for identification and removal. */
  name: string;

  /**
   * Execution priority. Lower numbers run outermost (first in before-phase,
   * last in after-phase). Built-in plugins use 0–100.
   * User plugins default to 50 if not specified.
   *
   * Built-in priority map:
   *  - security: 10
   *  - cache: 20
   *  - dedup: 30
   *  - (user middlewares: 50)
   *  - retry: 70
   *  - serializer: 80
   *  - zod: 90
   */
  priority?: number;

  /** Called once when the plugin is registered on a client. */
  setup?(client: unknown): void;

  /** Returns a middleware function to be inserted into the pipeline. */
  middleware?(): CloveMiddleware;

  /** Called when the plugin is removed from a client. */
  teardown?(): void;
}

// # Schema (Zod-compatible interface)

/**
 * Generic validation schema interface compatible with Zod (and any library
 * that implements `parse()`). Avoids a hard dependency on Zod.
 */
export interface Schema<T = unknown> {
  parse(data: unknown): T;
}

// # Plugin Configs

/** Configuration for the retry plugin. */
export interface RetryConfig {
  /** Maximum number of retry attempts. Default: 3. */
  attempts?: number;

  /** Base delay between retries in milliseconds. Default: 300. */
  delay?: number;

  /** Backoff strategy. Default: 'exponential'. */
  backoff?: "linear" | "exponential";

  /** Add random jitter to prevent thundering herd. Default: true. */
  jitter?: boolean;

  /** HTTP status codes that trigger a retry. Default: [408, 429, 500, 502, 503, 504]. */
  retryOn?: number[];

  /** Custom predicate to decide if an error is retryable. */
  retryCondition?: (error: Error, attempt: number) => boolean;
}

/** Configuration for the cache plugin. */
export interface CacheConfig {
  /** Time-to-live for cached entries in milliseconds. Default: 300_000 (5 minutes). */
  ttl?: number;

  /** HTTP methods to cache. Default: ['GET']. */
  methods?: HttpMethod[];

  /** Maximum number of cached entries (LRU eviction). Default: 100. */
  maxEntries?: number;

  /** Custom function to generate cache keys. */
  keyGenerator?: (context: MiddlewareContext) => string;
}

/** Configuration for the deduplication plugin. */
export interface DedupConfig {
  /** HTTP methods to deduplicate. Default: ['GET', 'HEAD']. */
  methods?: HttpMethod[];

  /** Custom function to generate dedup keys. */
  keyGenerator?: (context: MiddlewareContext) => string;
}

/** Configuration for the security plugin. */
export interface SecurityConfig {
  /** Block requests to private/internal IP ranges (SSRF prevention). Default: true. */
  blockPrivateIPs?: boolean;

  /** Whitelist mode: only these domains are allowed. Supports wildcards. */
  allowedDomains?: string[];

  /** Blacklist mode: these domains are blocked. Supports wildcards. Ignored if allowedDomains is set. */
  blockedDomains?: string[];

  /** Maximum number of HTTP redirects to follow. Default: 5. Set to 0 to disallow redirects. */
  maxRedirects?: number;

  /** Only allow HTTPS requests. Default: false. */
  httpsOnly?: boolean;

  /** Maximum response body size in bytes. Default: Infinity. */
  maxResponseSize?: number;
}

// # atOnce

/** Request descriptor for `atOnce()` parallel requests. */
export interface AtOnceRequest extends Omit<CloveRequestConfig, "signal"> {
  /** Request URL (required for atOnce). */
  url: string;

  /** HTTP method. Default: 'GET'. */
  method?: HttpMethod;
}
