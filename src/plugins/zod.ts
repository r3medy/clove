// Clove - Zod Validation Plugin

import type { ClovePlugin } from "../core/types.js";
import { ValidationError } from "../core/errors.js";

/**
 * Zod validation plugin — validates response data against a schema.
 *
 * Priority: 90 (innermost plugin — runs right before fetch on the way in,
 * first to process the response on the way out)
 *
 * The schema is passed per-request via the `schema` option in the request
 * config. Any object implementing `parse(data: unknown): T` is compatible
 * (Zod, Valibot, ArkType, or a custom validator).
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 *
 * const UserSchema = z.object({
 *   id: z.number(),
 *   name: z.string(),
 *   email: z.string().email(),
 * });
 *
 * // `data` is typed as { id: number; name: string; email: string }
 * const { data } = await api.get('/user/1', {
 *   schema: UserSchema,
 * });
 *
 * // Throws ValidationError if response doesn't match the schema
 * ```
 */
export function createZodPlugin(): ClovePlugin {
  return {
    name: "zod",
    priority: 90,

    middleware() {
      return async (ctx, next) => {
        // Execute the request first (this runs on the "after" phase)
        const response = await next();

        // No schema specified — skip validation
        const schema = ctx.config.schema;
        if (!schema) return response;

        // Validate Response Data
        try {
          const validated = schema.parse(response.data);

          // Return response with validated (potentially transformed) data
          return {
            ...response,
            data: validated,
          };
        } catch (error) {
          throw new ValidationError(
            `Response validation failed: ${formatValidationError(error)}`,
            error,
            ctx.config,
            response,
          );
        }
      };
    },
  };
}

/**
 * Format a validation error for the error message.
 * Handles Zod errors (which have an `issues` array) and generic errors.
 */
function formatValidationError(error: unknown): string {
  // Zod-style error with issues array
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as Record<string, unknown>)["issues"])
  ) {
    const issues = (error as { issues: Array<{ path?: unknown[]; message?: string }> })["issues"];
    return issues
      .slice(0, 5) // Show at most 5 issues
      .map((issue) => {
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
        return path ? `${path}: ${issue.message}` : (issue.message ?? "Unknown error");
      })
      .join("; ");
  }

  // Generic error
  if (error instanceof Error) return error.message;
  return String(error);
}
