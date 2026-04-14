// Clove - IP & Domain Validation Utilities (SSRF Prevention)

/**
 * Check if a hostname points to a private/internal address.
 *
 * Handles:
 * - IPv4 private ranges (RFC 1918 + link-local + loopback)
 * - IPv6 private ranges (loopback, unique local, link-local)
 * - `localhost` keyword
 *
 * NOTE: In browser environments, we can only validate the hostname string
 * itself — DNS resolution happens inside `fetch()` and we cannot inspect
 * the resolved IP. For full IP-level SSRF protection in Node.js, consider
 * using `dns.resolve()` before making the request.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  // Obvious localhost
  if (host === "localhost") return true;

  // Strip IPv6 brackets if present: [::1] → ::1
  const clean = host.startsWith("[") ? host.slice(1, -1) : host;

  // IPv6 check
  if (clean.includes(":")) {
    return isPrivateIPv6(clean);
  }

  // IPv4 check (only if it looks like an IP address)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) {
    return isPrivateIPv4(clean);
  }

  // Hostname — can't resolve DNS from here, so only 'localhost' is caught (above)
  return false;
}

/**
 * Check if a hostname matches any pattern in a domain list.
 *
 * Supports wildcards:
 * - `*.example.com` matches `sub.example.com` but NOT `example.com`
 * - `example.com` matches only `example.com` exactly
 */
export function matchesDomain(hostname: string, patterns: string[]): boolean {
  const host = hostname.toLowerCase();

  for (const pattern of patterns) {
    const p = pattern.toLowerCase();

    // Exact match
    if (p === host) return true;

    // Wildcard: *.example.com
    if (p.startsWith("*.")) {
      const baseDomain = p.slice(2);
      if (host === baseDomain || host.endsWith(`.${baseDomain}`)) {
        return true;
      }
    }
  }

  return false;
}

// # Internal Helpers

/**
 * Private IPv4 ranges:
 * - 127.0.0.0/8     (Loopback)
 * - 10.0.0.0/8      (Private Class A)
 * - 172.16.0.0/12   (Private Class B)
 * - 192.168.0.0/16  (Private Class C)
 * - 169.254.0.0/16  (Link-local)
 * - 0.0.0.0/8       ("This" network)
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts as [number, number, number, number];

  // 127.0.0.0/8 — Loopback
  if (a === 127) return true;

  // 10.0.0.0/8 — Private Class A
  if (a === 10) return true;

  // 172.16.0.0/12 — Private Class B (172.16.x.x – 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 — Private Class C
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 — Link-local
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 — "This" network
  if (a === 0) return true;

  return false;
}

/**
 * Private IPv6 ranges:
 * - ::1          (Loopback)
 * - fc00::/7     (Unique local — fc00:: to fdff::)
 * - fe80::/10    (Link-local)
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Loopback
  if (normalized === "::1" || normalized === "0000:0000:0000:0000:0000:0000:0000:0001") {
    return true;
  }

  // Unique local (fc00::/7) → starts with 'fc' or 'fd'
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // Link-local (fe80::/10)
  if (normalized.startsWith("fe80")) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4Mapped = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Mapped && v4Mapped[1]) {
    return isPrivateIPv4(v4Mapped[1]);
  }

  return false;
}
