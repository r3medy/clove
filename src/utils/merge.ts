// Clove - Deep Merge Utility

/** Check if a value is a plain object (not an array, Date, RegExp, etc.). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Deep merge two objects. `source` values override `target` values.
 *
 * Rules:
 * - Plain objects are recursively merged.
 * - Arrays are replaced, not concatenated.
 * - `undefined` values in source do NOT override target.
 * - `null` values in source DO override target (explicit null is intentional).
 * - Non-plain objects (Date, RegExp, FormData, etc.) are replaced, not merged.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    // Skip undefined — don't override with nothing
    if (sourceValue === undefined) {
      continue;
    }

    // Recursively merge plain objects
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      // Everything else: replace
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}
