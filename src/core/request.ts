// Clove - Request Execution

import type { MiddlewareContext, CloveResponse, ResolvedCloveConfig } from "./types.js";
import { CloveError, TimeoutError, CancelledError, NetworkError, HttpError } from "./errors.js";
import { buildURL } from "../utils/url.js";

/**
 * Execute the actual fetch request. This is the "innermost" handler in the
 * middleware pipeline — it sits at the center of the onion.
 *
 * Responsibilities:
 * 1. Build the full URL from baseURL + path + params
 * 2. Set up the AbortController (timeout + user signal)
 * 3. Prepare the Request object with auto JSON serialization
 * 4. Execute fetch()
 * 5. Parse the response body based on responseType
 * 6. Wrap everything in a CloveResponse with timing metadata
 */
export async function executeRequest<T = unknown>(
  context: MiddlewareContext,
): Promise<CloveResponse<T>> {
  const { config } = context;
  const meta = { start: performance.now(), end: 0, time: 0 };

  // Build URL
  const fullURL = buildURL(config.baseURL, config.url, config.params);

  // AbortController Setup
  const { signal, cleanup } = createCombinedSignal(config);

  try {
    // Prepare Request
    const requestInit: RequestInit = {
      method: config.method,
      headers: buildHeadersObject(config.headers),
      credentials: config.credentials,
      signal,
    };

    // Attach body for non-GET/HEAD methods
    if (config.body !== undefined && config.method !== "GET" && config.method !== "HEAD") {
      const { body, contentType } = serializeBody(config.body);
      requestInit.body = body;

      // Only set Content-Type if not already set by user and we have a detected type
      if (contentType && !hasHeader(config.headers, "Content-Type")) {
        (requestInit.headers as Record<string, string>)["Content-Type"] = contentType;
      }
    }

    // Execute Fetch
    const response = await fetch(fullURL, requestInit);

    // Record Timing
    meta.end = performance.now();
    meta.time = Math.round((meta.end - meta.start) * 100) / 100;

    // Parse Response Body
    const data = await parseResponseBody<T>(response, config);

    // Check for HTTP errors
    const cloveResponse: CloveResponse<T> = {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config,
      meta,
    };

    if (!response.ok) {
      throw new HttpError(
        response.status,
        response.statusText,
        config,
        cloveResponse as CloveResponse,
      );
    }

    return cloveResponse;
  } catch (error) {
    // Record timing even on error
    if (meta.end === 0) {
      meta.end = performance.now();
      meta.time = Math.round((meta.end - meta.start) * 100) / 100;
    }

    // Re-throw CloveErrors as-is
    if (CloveError.isCloveError(error)) {
      throw error;
    }

    // Translate DOMException (AbortError) into Clove errors
    if (error instanceof DOMException && error.name === "AbortError") {
      // Determine if it was a timeout or user cancellation
      if (config.signal?.aborted) {
        throw new CancelledError(config);
      }
      throw new TimeoutError(config.timeout, config);
    }

    // Translate TypeError (network errors from fetch)
    if (error instanceof TypeError) {
      throw new NetworkError(error.message || "Network request failed", config, error);
    }

    // Unknown error — wrap in CloveError
    throw new CloveError(
      (error as Error).message || "An unknown error occurred",
      "CLOVE_ERROR",
      config,
    );
  } finally {
    cleanup();
  }
}

// Helpers

/**
 * Create a combined AbortSignal that fires when either:
 * 1. The user's signal fires, OR
 * 2. The configured timeout expires.
 *
 * Returns the combined signal and a cleanup function to clear the timeout.
 */
function createCombinedSignal(config: ResolvedCloveConfig): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const timeoutController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Set up timeout (0 = no timeout)
  if (config.timeout > 0) {
    timeoutId = setTimeout(() => timeoutController.abort(), config.timeout);
  }

  // Combine signals
  const signals: AbortSignal[] = [timeoutController.signal];
  if (config.signal) {
    signals.push(config.signal);
  }

  // Use AbortSignal.any() if available (Node 20+, modern browsers)
  let combinedSignal: AbortSignal;
  if (typeof AbortSignal.any === "function") {
    combinedSignal = AbortSignal.any(signals);
  } else {
    // Fallback: listen to user signal and forward to timeout controller
    combinedSignal = timeoutController.signal;
    if (config.signal) {
      const onAbort = () => timeoutController.abort();
      config.signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    signal: combinedSignal,
    cleanup: () => {
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}

/**
 * Convert a CloveHeaders record into a plain object suitable for fetch.
 */
function buildHeadersObject(headers: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Check if a header name exists in the headers object (case-insensitive).
 */
function hasHeader(headers: Record<string, string | undefined>, name: string): boolean {
  const lowerName = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerName);
}

/**
 * Auto-serialize the request body based on its type.
 * Core handles JSON and pass-through types. The serializer plugin
 * can enhance this with Content-Type enforcement for more types.
 */
function serializeBody(body: unknown): { body: BodyInit; contentType: string | null } {
  // Pass-through types that fetch handles natively
  if (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof ReadableStream ||
    typeof body === "string"
  ) {
    return { body: body as BodyInit, contentType: null };
  }

  // Plain object or array → JSON
  if (typeof body === "object" && body !== null) {
    return {
      body: JSON.stringify(body),
      contentType: "application/json",
    };
  }

  // Fallback: convert to string
  return { body: String(body), contentType: "text/plain" };
}

/**
 * Parse the response body based on the configured responseType
 * or the Content-Type header.
 */
async function parseResponseBody<T>(response: Response, config: ResolvedCloveConfig): Promise<T> {
  // If response has no body (204, 304, etc.)
  if (response.status === 204 || response.status === 304) {
    return null as T;
  }

  switch (config.responseType) {
    case "json":
      return parseJSON<T>(response);
    case "text":
      return (await response.text()) as T;
    case "blob":
      return (await response.blob()) as T;
    case "arrayBuffer":
      return (await response.arrayBuffer()) as T;
    case "formData":
      return (await response.formData()) as T;
    case "stream":
      return response.body as T;
    default:
      return parseJSON<T>(response);
  }
}

/**
 * Parse JSON response with fallback to text if Content-Type isn't JSON.
 */
async function parseJSON<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  // If response type was 'json' but content isn't JSON, try anyway and fall back to text
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}
