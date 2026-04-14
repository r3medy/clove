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
          if (security.blockPrivateIPs !== false && isPrivateHost(hostname)) {
            throw new SecurityError(
              `Request to private/internal address blocked: ${hostname}`,
              ctx.config,
            );
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
