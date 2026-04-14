// Clove - Security Plugin

import type { ClovePlugin } from "../core/types.js";
import { SecurityError } from "../core/errors.js";
import { buildURL, extractHostname, extractProtocol } from "../utils/url.js";
import { isPrivateHost, matchesDomain } from "../utils/ip.js";

/**
 * Security plugin — validates requests against security constraints.
 *
 * Priority: 10 (outermost — runs first, fails fast)
 *
 * Features:
 * - SSRF prevention: blocks requests to private/internal IP ranges
 * - Protocol enforcement: optionally restrict to HTTPS only
 * - Domain allow/block list: whitelist or blacklist domains with wildcard support
 * - Response size limits: reject responses exceeding a configured byte limit
 *
 * @example
 * ```ts
 * const api = clove.create({
 *   security: {
 *     blockPrivateIPs: true,
 *     allowedDomains: ['api.example.com', '*.cdn.example.com'],
 *     httpsOnly: true,
 *     maxResponseSize: 10 * 1024 * 1024, // 10MB
 *   },
 * });
 * ```
 */
export function createSecurityPlugin(): ClovePlugin {
  return {
    name: "security",
    priority: 10,

    middleware() {
      return async (ctx, next) => {
        const security = ctx.config.security;

        // Plugin disabled for this request
        if (security === false) return next();

        const fullURL = buildURL(ctx.config.baseURL, ctx.config.url, ctx.config.params);

        // Protocol Validation
        const protocol = extractProtocol(fullURL);

        // Block dangerous protocols
        if (protocol && !["http:", "https:"].includes(protocol)) {
          throw new SecurityError(
            `Blocked request with disallowed protocol: ${protocol}`,
            ctx.config,
          );
        }

        // HTTPS-only enforcement
        if (security.httpsOnly && protocol !== "https:") {
          throw new SecurityError(
            `HTTPS required but got ${protocol ?? "unknown protocol"}`,
            ctx.config,
          );
        }

        // Hostname Validation
        const hostname = extractHostname(fullURL);

        if (hostname) {
          // SSRF: Block private/internal IPs
          if (security.blockPrivateIPs !== false) {
            // First pass: catch literal private hostnames/IPs
            if (isPrivateHost(hostname)) {
              throw new SecurityError(
                `Request to private/internal address blocked: ${hostname}`,
                ctx.config,
              );
            }

            // Second pass (Node.js only): resolve DNS and check the actual IP
            // This prevents bypasses via domains like localtest.me → 127.0.0.1
            const resolvedIP = await resolveDNS(hostname);
            if (resolvedIP && isPrivateHost(resolvedIP)) {
              throw new SecurityError(
                `DNS resolved to private/internal address blocked: ${hostname} → ${resolvedIP}`,
                ctx.config,
              );
            }
          }

          // Domain whitelist (takes precedence over blacklist)
          if (security.allowedDomains && security.allowedDomains.length > 0) {
            if (!matchesDomain(hostname, security.allowedDomains)) {
              throw new SecurityError(`Domain not in allow list: ${hostname}`, ctx.config);
            }
          }
          // Domain blacklist
          else if (security.blockedDomains && security.blockedDomains.length > 0) {
            if (matchesDomain(hostname, security.blockedDomains)) {
              throw new SecurityError(`Domain is blocked: ${hostname}`, ctx.config);
            }
          }
        }

        // Execute Request
        const response = await next();

        // Response Size Validation
        if (security.maxResponseSize && security.maxResponseSize < Infinity) {
          const contentLength = response.headers.get("content-length");
          if (contentLength) {
            const size = parseInt(contentLength, 10);
            if (!isNaN(size) && size > security.maxResponseSize) {
              throw new SecurityError(
                `Response size (${size} bytes) exceeds limit (${security.maxResponseSize} bytes)`,
                ctx.config,
              );
            }
          }
        }

        return response;
      };
    },
  };
}

// # DNS Resolution (Node.js only)

/** Cached reference to the Node.js DNS module (lazy-loaded). */
let dnsModule: { lookup: (hostname: string) => Promise<{ address: string }> } | null | false = null;

/**
 * Attempt to resolve a hostname to its IP address using Node.js `dns.lookup`.
 *
 * - Returns the resolved IP string in Node.js environments.
 * - Returns `null` in browser environments (DNS resolution happens inside fetch).
 * - Returns `null` on resolution failure (let fetch handle the error).
 */
async function resolveDNS(hostname: string): Promise<string | null> {
  // Skip if hostname is already an IP address
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(":")) {
    return null;
  }

  // Lazy-load dns module (only available in Node.js)
  if (dnsModule === null) {
    try {
      const mod = await import(/* webpackIgnore: true */ "node:dns/promises");
      dnsModule = mod as unknown as typeof dnsModule;
    } catch {
      // Not in Node.js — mark as unavailable so we don't retry
      dnsModule = false;
    }
  }

  if (!dnsModule) return null;

  try {
    const result = await dnsModule.lookup(hostname);
    return result.address;
  } catch {
    // DNS resolution failure — let fetch() handle it naturally
    return null;
  }
}
