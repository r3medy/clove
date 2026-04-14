// Clove - Retry Plugin

import type { ClovePlugin, CloveResponse, RetryConfig } from "../core/types.js";
import { CloveError, HttpError } from "../core/errors.js";
import { executeRequest } from "../core/request.js";

/**
 * Retry plugin — automatically retries failed requests with configurable
 * backoff, jitter, and retry conditions.
 *
 * Priority: 70 (runs after user middleware, wraps serializer/zod/fetch)
 *
 * Retry strategy:
 * - First attempt uses the standard middleware pipeline (calls `next()`)
 * - Subsequent attempts call `executeRequest()` directly to avoid
 *   the compose pipeline's single-use `next()` constraint
 * - Respects `Retry-After` header on 429 responses
 * - Never retries cancelled requests or validation errors
 *
 * @example
 * ```ts
 * const api = clove.create({
 *   retry: {
 *     attempts: 3,
 *     delay: 500,
 *     backoff: 'exponential',
 *     jitter: true,
 *     retryOn: [408, 429, 500, 502, 503, 504],
 *   },
 * });
 * ```
 */
export function createRetryPlugin(): ClovePlugin {
  return {
    name: "retry",
    priority: 70,

    middleware() {
      return async (ctx, next) => {
        const retryConfig = ctx.config.retry;

        // Plugin disabled for this request
        if (retryConfig === false) return next();

        const {
          attempts = 3,
          delay = 300,
          backoff = "exponential",
          jitter = true,
          retryOn = [408, 429, 500, 502, 503, 504],
          retryCondition,
        } = retryConfig;

        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= attempts; attempt++) {
          try {
            let response: CloveResponse;

            if (attempt === 0) {
              // First attempt: use the standard pipeline
              response = await next();
            } else {
              // Retries: execute fetch directly (pipeline next() is single-use)
              response = await executeRequest(ctx);
            }

            // Tag the response with retry count
            if (attempt > 0) {
              response.meta.retries = attempt;
            }

            return response;
          } catch (error) {
            lastError = error as Error;

            // Check if this was the last attempt
            if (attempt >= attempts) break;

            // Check if the error is retryable
            if (!isRetryable(error as Error, retryOn, retryCondition, attempt)) break;

            // Calculate wait time
            const waitMs = calculateDelay(attempt, delay, backoff, jitter);

            // Respect Retry-After header (common on 429 Too Many Requests)
            const retryAfterMs = extractRetryAfter(error as Error);
            const actualWait = retryAfterMs ? Math.max(waitMs, retryAfterMs) : waitMs;

            await sleep(actualWait);
          }
        }

        throw lastError!;
      };
    },
  };
}

// # Retry Helpers

/**
 * Determine if an error should trigger a retry.
 */
function isRetryable(
  error: Error,
  retryOn: number[],
  retryCondition: RetryConfig["retryCondition"],
  attempt: number,
): boolean {
  // Never retry cancelled requests
  if (CloveError.isCloveError(error) && error.code === "CLOVE_CANCELLED") {
    return false;
  }

  // Never retry validation errors (data shape won't change on retry)
  if (CloveError.isCloveError(error) && error.code === "CLOVE_VALIDATION") {
    return false;
  }

  // Never retry security errors (the URL won't become valid on retry)
  if (CloveError.isCloveError(error) && error.code === "CLOVE_SECURITY") {
    return false;
  }

  // Custom retry condition takes precedence
  if (retryCondition) {
    return retryCondition(error, attempt);
  }

  // Network errors are always retryable
  if (CloveError.isCloveError(error) && error.code === "CLOVE_NETWORK") {
    return true;
  }

  // Timeout errors are retryable
  if (CloveError.isCloveError(error) && error.code === "CLOVE_TIMEOUT") {
    return true;
  }

  // HTTP errors: check if status code is in the retryOn list
  if (error instanceof HttpError) {
    return retryOn.includes(error.status);
  }

  return false;
}

/**
 * Calculate the delay before the next retry attempt.
 *
 * - Linear:      delay * (attempt + 1)
 * - Exponential: delay * 2^attempt
 * - Jitter adds ±25% randomness to prevent thundering herd
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  backoff: "linear" | "exponential",
  jitter: boolean,
): number {
  let delay: number;

  if (backoff === "exponential") {
    delay = baseDelay * Math.pow(2, attempt);
  } else {
    delay = baseDelay * (attempt + 1);
  }

  // Add jitter: ±25%
  if (jitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
    delay = Math.round(delay * jitterFactor);
  }

  // Cap at 30 seconds
  return Math.min(delay, 30_000);
}

/**
 * Extract the Retry-After header value from an error response.
 * Returns the delay in milliseconds, or undefined if not present.
 *
 * Handles both:
 * - Seconds: `Retry-After: 120`
 * - HTTP date: `Retry-After: Wed, 21 Oct 2025 07:28:00 GMT`
 */
function extractRetryAfter(error: Error): number | undefined {
  if (!(error instanceof HttpError) || !error.response) return undefined;

  const retryAfter = error.response.headers.get("retry-after");
  if (!retryAfter) return undefined;

  // Try as seconds
  const seconds = Number(retryAfter);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try as HTTP date
  const date = new Date(retryAfter).getTime();
  if (!isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return undefined;
}

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
