// Clove - Deep Merge Tests (including prototype pollution security checks)

import { describe, it, expect } from "vitest";
import { deepMerge } from "../../src/utils/merge";

describe("deepMerge", () => {
  it("should merge plain objects recursively", () => {
    const result = deepMerge({ a: 1, nested: { x: 10, y: 20 } }, { b: 2, nested: { y: 30 } });

    expect(result).toEqual({ a: 1, b: 2, nested: { x: 10, y: 30 } });
  });

  it("should not override with undefined values", () => {
    const result = deepMerge({ a: 1, b: 2 }, { a: undefined, b: 3 });

    expect(result).toEqual({ a: 1, b: 3 });
  });

  it("should allow null to override", () => {
    const result = deepMerge({ a: 1, b: "hello" } as Record<string, unknown>, { b: null });

    expect(result).toEqual({ a: 1, b: null });
  });

  it("should replace arrays (not concatenate)", () => {
    const result = deepMerge({ list: [1, 2, 3] } as Record<string, unknown>, { list: [4, 5] });

    expect(result).toEqual({ list: [4, 5] });
  });

  // # Prototype Pollution Security Tests

  it("should ignore __proto__ keys (prototype pollution prevention)", () => {
    const malicious = JSON.parse('{"__proto__": {"polluted": true}}');
    const result = deepMerge({}, malicious);

    // @ts-expect-error - checking for pollution on the prototype
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    // The result itself should NOT have __proto__ as an own property
    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(false);
  });

  it("should ignore constructor keys", () => {
    const malicious = { constructor: { prototype: { polluted: true } } };
    const result = deepMerge({} as Record<string, unknown>, malicious);

    expect(Object.prototype.hasOwnProperty.call(result, "constructor")).toBe(false);
    // @ts-expect-error - checking for pollution
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("should ignore prototype keys", () => {
    const malicious = { prototype: { polluted: true } };
    const result = deepMerge({} as Record<string, unknown>, malicious);

    expect(Object.prototype.hasOwnProperty.call(result, "prototype")).toBe(false);
  });

  it("should handle nested __proto__ attack vectors", () => {
    const malicious = JSON.parse('{"nested": {"__proto__": {"deep": true}}}');
    const result = deepMerge({ nested: {} } as Record<string, unknown>, malicious);

    // @ts-expect-error - checking for deep pollution
    expect(({} as Record<string, unknown>)["deep"]).toBeUndefined();
    expect(result).toHaveProperty("nested");
    expect(
      Object.prototype.hasOwnProperty.call(
        (result as Record<string, Record<string, unknown>>)["nested"],
        "__proto__",
      ),
    ).toBe(false);
  });

  it("should still merge valid keys alongside malicious ones", () => {
    const malicious = JSON.parse('{"safe": "value", "__proto__": {"polluted": true}}');
    const result = deepMerge({}, malicious);

    expect(result).toEqual({ safe: "value" });
    // @ts-expect-error - verifying no pollution
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
