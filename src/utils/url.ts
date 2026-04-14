// Clove - URL Utilities

/**
 * Build a full URL by combining a base URL, a path, and query parameters.
 *
 * Rules:
 * - If `path` is an absolute URL (starts with http:// or https://), `baseURL` is ignored.
 * - If `baseURL` ends with `/` and `path` starts with `/`, deduplicates the slash.
 * - Query params are appended with proper encoding.
 * - `undefined` and `null` param values are silently dropped.
 */
export function buildURL(
  baseURL: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  let url: string;

  // If the path is already an absolute URL (has a scheme), use it directly
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    url = path;
  } else {
    // Join baseURL and path, avoiding double slashes
    const base = baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
    const segment = path.startsWith("/") ? path : `/${path}`;
    url = `${base}${segment}`;
  }

  // Append query parameters
  if (params && Object.keys(params).length > 0) {
    const searchParams = serializeParams(params);
    if (searchParams) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}${searchParams}`;
    }
  }

  return url;
}

/**
 * Serialize a params object into a URL-encoded query string.
 * - Keys are sorted for deterministic output (important for caching/hashing).
 * - `undefined` and `null` values are omitted.
 * - Arrays are serialized as repeated keys: `tags=a&tags=b`.
 */
export function serializeParams(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const entries: [string, string][] = [];

  const sortedKeys = Object.keys(params).sort();

  for (const key of sortedKeys) {
    const value = params[key];

    // Skip undefined and null values
    if (value === undefined || value === null) {
      continue;
    }

    entries.push([key, String(value)]);
  }

  if (entries.length === 0) return "";

  const searchParams = new URLSearchParams(entries);
  return searchParams.toString();
}

/**
 * Extract the hostname from a URL string.
 * Returns `null` if the URL is invalid.
 */
export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Extract the protocol from a URL string (e.g., 'https:').
 * Returns `null` if the URL is invalid.
 */
export function extractProtocol(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}
