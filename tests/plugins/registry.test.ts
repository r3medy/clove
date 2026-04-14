// ─────────────────────────────────────────────────────────────────────────────
// Tests — Plugin Registry
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginRegistry } from '../../src/plugins/registry';
import type { ClovePlugin, CloveMiddleware, CloveResponse, MiddlewareContext } from '../../src/core/types';

// Helper to create a test plugin
function createPlugin(name: string, priority?: number, hasMiddleware = true): ClovePlugin {
  return {
    name,
    priority,
    setup: vi.fn(),
    teardown: vi.fn(),
    middleware: hasMiddleware
      ? vi.fn(() => {
          const mw: CloveMiddleware = async (ctx, next) => next();
          return mw;
        })
      : undefined,
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry({});
  });

  describe('add', () => {
    it('should register a plugin', () => {
      const plugin = createPlugin('test');
      registry.add(plugin);

      expect(registry.has('test')).toBe(true);
      expect(plugin.setup).toHaveBeenCalledOnce();
    });

    it('should throw if plugin has no name', () => {
      expect(() => registry.add({ } as ClovePlugin)).toThrow('Plugin must have a "name" property');
    });

    it('should replace existing plugin with same name', () => {
      const pluginA = createPlugin('test');
      const pluginB = createPlugin('test');

      registry.add(pluginA);
      registry.add(pluginB);

      expect(pluginA.teardown).toHaveBeenCalledOnce(); // Old one torn down
      expect(pluginB.setup).toHaveBeenCalledOnce();    // New one set up
      expect(registry.list()).toHaveLength(1);
    });

    it('should assign default priority of 50 if not specified', () => {
      const plugin = createPlugin('test');
      registry.add(plugin);

      expect(plugin.priority).toBe(50);
    });
  });

  describe('remove', () => {
    it('should remove a plugin and call teardown', () => {
      const plugin = createPlugin('test');
      registry.add(plugin);

      const removed = registry.remove('test');

      expect(removed).toBe(true);
      expect(registry.has('test')).toBe(false);
      expect(plugin.teardown).toHaveBeenCalledOnce();
    });

    it('should return false for non-existent plugin', () => {
      expect(registry.remove('nonexistent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return the plugin by name', () => {
      const plugin = createPlugin('test');
      registry.add(plugin);

      expect(registry.get('test')).toBe(plugin);
    });

    it('should return null for non-existent plugin', () => {
      expect(registry.get('nonexistent')).toBeNull();
    });
  });

  describe('list', () => {
    it('should return plugins sorted by priority (ascending)', () => {
      registry.add(createPlugin('high', 90));
      registry.add(createPlugin('low', 10));
      registry.add(createPlugin('mid', 50));

      const names = registry.list().map((p) => p.name);
      expect(names).toEqual(['low', 'mid', 'high']);
    });

    it('should return empty array when no plugins are registered', () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all plugins and call teardown on each', () => {
      const p1 = createPlugin('a');
      const p2 = createPlugin('b');
      registry.add(p1);
      registry.add(p2);

      registry.clear();

      expect(registry.list()).toHaveLength(0);
      expect(p1.teardown).toHaveBeenCalled();
      expect(p2.teardown).toHaveBeenCalled();
    });
  });

  describe('getMiddlewares', () => {
    it('should collect middlewares from all plugins sorted by priority', () => {
      registry.add(createPlugin('last', 90));
      registry.add(createPlugin('first', 10));
      registry.add(createPlugin('middle', 50));

      const middlewares = registry.getMiddlewares();
      expect(middlewares).toHaveLength(3);
    });

    it('should skip plugins without middleware', () => {
      registry.add(createPlugin('with-mw', 50, true));
      registry.add(createPlugin('without-mw', 50, false));

      const middlewares = registry.getMiddlewares();
      expect(middlewares).toHaveLength(1);
    });
  });
});
