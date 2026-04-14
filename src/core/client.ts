// Clove -Client (Main Entry Point)

import type {
  CloveInstanceConfig,
  CloveRequestConfig,
  CloveResponse,
  CloveMiddleware,
  ClovePlugin,
  AtOnceRequest,
} from "./types.js";
import { resolveConfig } from "./config.js";
import { compose } from "./pipeline.js";
import { executeRequest } from "./request.js";
import { PluginRegistry } from "../plugins/registry.js";
import { createSecurityPlugin } from "../plugins/security.js";
import { createCachePlugin } from "../plugins/cache.js";
import { createDedupPlugin } from "../plugins/dedup.js";
import { createRetryPlugin } from "../plugins/retry.js";
import { createSerializerPlugin } from "../plugins/serializer.js";
import { createZodPlugin } from "../plugins/zod.js";

/**
 * Clove HTTP Client.
 *
 * A modular, plugin-based fetch wrapper with Express-like middleware support.
 * All essential plugins (retry, cache, dedup, security, zod, serializer) are
 * auto-injected by default and configurable via the instance config.
 *
 * @example
 * ```ts
 * const api = new CloveClient({
 *   baseURL: 'https://api.example.com',
 *   timeout: 10_000,
 *   retry: { attempts: 3 },
 * });
 *
 * // Add custom middleware
 * api.use(async (ctx, next) => {
 *   console.log(`→ ${ctx.config.method} ${ctx.config.url}`);
 *   const response = await next();
 *   console.log(`← ${response.status} (${response.meta.time}ms)`);
 *   return response;
 * });
 *
 * const { data, meta } = await api.get('/users');
 * ```
 */
export class CloveClient {
  /** The instance configuration (immutable after creation). */
  private readonly instanceConfig: CloveInstanceConfig;

  /** User-defined middlewares, in registration order. */
  private readonly middlewares: CloveMiddleware[] = [];

  /** Plugin registry — add, remove, list plugins. */
  public readonly plugins: PluginRegistry;

  constructor(config: CloveInstanceConfig = {}) {
    this.instanceConfig = { ...config };
    this.plugins = new PluginRegistry(this);

    // Auto-inject built-in plugins based on config
    this.initializeBuiltinPlugins();
  }

  // ── Middleware API ───────────────────────────────────────────────────────

  /**
   * Register an Express-like middleware function.
   *
   * Middlewares execute in registration order, sandwiched between the
   * built-in plugin middlewares:
   * ```
   * [security] → [cache] → [dedup] → [YOUR MIDDLEWARE] → [retry] → [serializer] → [zod] → fetch
   * ```
   *
   * @returns `this` for chaining.
   *
   * @example
   * ```ts
   * api.use(async (ctx, next) => {
   *   ctx.config.headers['X-Custom'] = 'value';
   *   const response = await next();
   *   console.log(`Took ${response.meta.time}ms`);
   *   return response;
   * });
   * ```
   */
  use(middleware: CloveMiddleware): this {
    if (typeof middleware !== "function") {
      throw new TypeError(`Middleware must be a function, got ${typeof middleware}`);
    }
    this.middlewares.push(middleware);
    return this;
  }

  // ── Core Request Method ─────────────────────────────────────────────────

  /**
   * Execute an HTTP request with the full middleware pipeline.
   *
   * This is the low-level method that all HTTP shortcut methods delegate to.
   * Most users should use `get()`, `post()`, etc. instead.
   */
  async request<T = unknown>(config: CloveRequestConfig): Promise<CloveResponse<T>> {
    // Resolve all config layers into a single flat object
    const resolved = resolveConfig(this.instanceConfig, config);

    // Create the middleware context
    const context = {
      config: resolved,
      state: {} as Record<string, unknown>,
    };

    // Build the middleware stack:
    // 1. Plugin middlewares sorted by priority (which interleaves around user middlewares)
    // 2. User middlewares injected at priority 50
    const stack = this.buildMiddlewareStack();

    // Compose and execute the pipeline
    const composed = compose(stack);
    return composed(context, () => executeRequest<T>(context)) as Promise<CloveResponse<T>>;
  }

  // ── HTTP Shortcut Methods ───────────────────────────────────────────────

  /** Send a GET request. */
  async get<T = unknown>(
    url: string,
    config?: Omit<CloveRequestConfig, "url" | "method" | "body">,
  ): Promise<CloveResponse<T>> {
    return this.request<T>({ ...config, url, method: "GET" });
  }

  /** Send a POST request. */
  async post<T = unknown>(
    url: string,
    body?: unknown,
    config?: Omit<CloveRequestConfig, "url" | "method" | "body">,
  ): Promise<CloveResponse<T>> {
    return this.request<T>({ ...config, url, method: "POST", body });
  }

  /** Send a PUT request. */
  async put<T = unknown>(
    url: string,
    body?: unknown,
    config?: Omit<CloveRequestConfig, "url" | "method" | "body">,
  ): Promise<CloveResponse<T>> {
    return this.request<T>({ ...config, url, method: "PUT", body });
  }

  /** Send a PATCH request. */
  async patch<T = unknown>(
    url: string,
    body?: unknown,
    config?: Omit<CloveRequestConfig, "url" | "method" | "body">,
  ): Promise<CloveResponse<T>> {
    return this.request<T>({ ...config, url, method: "PATCH", body });
  }

  /** Send a DELETE request. */
  async delete<T = unknown>(
    url: string,
    config?: Omit<CloveRequestConfig, "url" | "method">,
  ): Promise<CloveResponse<T>> {
    return this.request<T>({ ...config, url, method: "DELETE" });
  }

  /** Send a HEAD request. */
  async head(
    url: string,
    config?: Omit<CloveRequestConfig, "url" | "method" | "body">,
  ): Promise<CloveResponse<void>> {
    return this.request<void>({ ...config, url, method: "HEAD" });
  }

  /** Send an OPTIONS request. */
  async options<T = unknown>(
    url: string,
    config?: Omit<CloveRequestConfig, "url" | "method" | "body">,
  ): Promise<CloveResponse<T>> {
    return this.request<T>({ ...config, url, method: "OPTIONS" });
  }

  // ── Parallel Requests ───────────────────────────────────────────────────

  /**
   * Execute multiple requests in parallel using `Promise.allSettled()`.
   *
   * Every request runs through the full middleware pipeline independently.
   * All requests are fired simultaneously — none blocks the others.
   * A shared AbortController can be passed to cancel all at once.
   *
   * @example
   * ```ts
   * const results = await api.atOnce([
   *   { url: '/users' },
   *   { url: '/posts', method: 'GET' },
   *   { url: '/comments', params: { postId: 1 } },
   * ]);
   *
   * for (const result of results) {
   *   if (result.status === 'fulfilled') {
   *     console.log(result.value.data);
   *   } else {
   *     console.error(result.reason);
   *   }
   * }
   * ```
   */
  async atOnce(requests: AtOnceRequest[]): Promise<PromiseSettledResult<CloveResponse>[]> {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error("atOnce() requires a non-empty array of request descriptors");
    }

    const promises = requests.map((req) =>
      this.request({
        url: req.url,
        method: req.method ?? "GET",
        headers: req.headers,
        params: req.params,
        body: req.body,
        timeout: req.timeout,
        credentials: req.credentials,
        responseType: req.responseType,
        schema: req.schema,
        retry: req.retry,
        cache: req.cache,
        dedup: req.dedup,
      }),
    );

    return Promise.allSettled(promises);
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /**
   * Build the complete middleware stack by interleaving plugin middlewares
   * and user middlewares based on priority.
   *
   * Plugin middlewares are sorted by priority. User middlewares are inserted
   * at the position where priority === 50 (between infrastructure plugins
   * and request-transforming plugins).
   */
  private buildMiddlewareStack(): CloveMiddleware[] {
    const pluginMiddlewares = this.plugins.getMiddlewares();

    // If no user middlewares, just return plugin middlewares
    if (this.middlewares.length === 0) {
      return pluginMiddlewares;
    }

    // Find the insertion point for user middlewares.
    // Plugin middlewares are sorted by priority. We insert user MWs after
    // all plugins with priority < 50 and before plugins with priority >= 50.
    const sortedPlugins = this.plugins.list();
    let insertIndex = 0;

    for (let i = 0; i < sortedPlugins.length; i++) {
      const plugin = sortedPlugins[i];
      if (plugin && (plugin.priority ?? 50) < 50) {
        // Count how many of these low-priority plugins actually have middleware
        if (plugin.middleware) insertIndex++;
      }
    }

    // Build the interleaved stack
    const stack: CloveMiddleware[] = [
      ...pluginMiddlewares.slice(0, insertIndex),
      ...this.middlewares,
      ...pluginMiddlewares.slice(insertIndex),
    ];

    return stack;
  }

  /**
   * Initialize built-in plugins based on instance configuration.
   *
   * All essential plugins are auto-injected. Each plugin is conditionally
   * registered based on its config value — set to `false` to disable.
   *
   * Execution order (by priority):
   *  10: security   — URL validation, SSRF prevention, domain lists
   *  20: cache      — Response caching with TTL
   *  30: dedup      — In-flight request deduplication
   *  50: (user middlewares inserted here)
   *  70: retry      — Retry failed requests with backoff
   *  80: serializer — Auto Content-Type detection
   *  90: zod        — Response schema validation
   */
  private initializeBuiltinPlugins(): void {
    // Security (priority: 10, disabled if config.security === false)
    if (this.instanceConfig.security !== false) {
      this.plugins.add(createSecurityPlugin());
    }

    // Cache (priority: 20, disabled if config.cache === false)
    if (this.instanceConfig.cache !== false) {
      this.plugins.add(createCachePlugin());
    }

    // Dedup (priority: 30, disabled if config.dedup === false)
    if (this.instanceConfig.dedup !== false) {
      this.plugins.add(createDedupPlugin());
    }

    // Retry (priority: 70, disabled if config.retry === false)
    if (this.instanceConfig.retry !== false) {
      this.plugins.add(createRetryPlugin());
    }

    // Serializer (priority: 80, always enabled)
    this.plugins.add(createSerializerPlugin());

    // Zod (priority: 90, always enabled)
    this.plugins.add(createZodPlugin());
  }
}
