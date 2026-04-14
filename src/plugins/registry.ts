// Clove - Plugin Registry

import type { ClovePlugin, CloveMiddleware } from "../core/types.js";

/** Default priority for user-added plugins and middlewares. */
const DEFAULT_PRIORITY = 50;

/**
 * Plugin Registry - manages the lifecycle of plugins attached to a Clove client.
 *
 * Plugins are stored in priority order. Lower priority numbers run outermost
 * in the middleware pipeline (execute first before the request, last after).
 *
 * Built-in plugin priority map:
 *  - security:   10
 *  - cache:      20
 *  - dedup:      30
 *  - retry:      70
 *  - serializer: 80
 *  - zod:        90
 *  - (user middleware: 50)
 */
export class PluginRegistry {
  private plugins: Map<string, ClovePlugin> = new Map();
  private client: unknown;

  constructor(client: unknown) {
    this.client = client;
  }

  /**
   * Register a plugin. If a plugin with the same name already exists,
   * the existing one is replaced (teardown is called on the old one).
   */
  add(plugin: ClovePlugin): void {
    if (!plugin.name) {
      throw new Error('Plugin must have a "name" property');
    }

    // Remove existing plugin with same name first
    if (this.plugins.has(plugin.name)) {
      this.remove(plugin.name);
    }

    // Assign default priority if not specified so callers can inspect it
    if (plugin.priority === undefined) {
      plugin.priority = DEFAULT_PRIORITY;
    }

    this.plugins.set(plugin.name, plugin);

    // Call setup hook
    if (plugin.setup) {
      plugin.setup(this.client);
    }
  }

  /**
   * Remove a plugin by name. Calls the plugin's teardown hook if defined.
   * Returns `true` if the plugin was found and removed, `false` otherwise.
   */
  remove(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    // Call teardown hook
    if (plugin.teardown) {
      plugin.teardown();
    }

    return this.plugins.delete(name);
  }

  /** Get a plugin by name. Returns `null` if not found. */
  get(name: string): ClovePlugin | null {
    return this.plugins.get(name) ?? null;
  }

  /** Check if a plugin is registered. */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /** List all registered plugins, sorted by priority (ascending). */
  list(): ClovePlugin[] {
    return [...this.plugins.values()].sort(
      (a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY),
    );
  }

  /** Remove all plugins. Calls teardown on each. */
  clear(): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.teardown) {
        plugin.teardown();
      }
    }
    this.plugins.clear();
  }

  /**
   * Collect middleware functions from all registered plugins,
   * sorted by plugin priority.
   *
   * This is called by the client before each request to build
   * the complete middleware stack.
   */
  getMiddlewares(): CloveMiddleware[] {
    const sorted = this.list();
    const middlewares: CloveMiddleware[] = [];

    for (const plugin of sorted) {
      if (plugin.middleware) {
        const mw = plugin.middleware();
        if (mw) {
          middlewares.push(mw);
        }
      }
    }

    return middlewares;
  }
}
