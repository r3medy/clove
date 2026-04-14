# Clove

A modular, plugin-based fetch wrapper built on web standards. Think Axios, but with an Express-like middleware pipeline, auto-injected essential plugins, and zero runtime dependencies.

```ts
import { clove } from "clove";

const api = clove.create({ baseURL: "https://api.example.com", timeout: 10_000 });

const { data } = await api.get("/users");
```

---

## Features

- **Express-style middleware pipeline** — code before `next()` runs on the request, code after runs on the response
- **Auto-injected plugins** — security, cache, dedup, retry, serializer, and Zod validation are wired in by default
- **Fully typed** — `ResolvedCloveConfig` guarantees no `undefined` inside the pipeline; per-request overrides are all optional
- **Schema validation** — pass any Zod-compatible schema and get back a typed, validated response
- **Dual ESM + CJS** — works in Node.js ≥ 18 and modern browsers
- **Zero runtime dependencies**

---

## Installation

```bash
npm install clove
```

Peer dependencies (both optional):

```bash
npm install zod    # for response validation
npm install react  # for the React integration (Phase 5)
```

---

## Quick Start

```ts
import { clove } from "clove";
import { z } from "zod";

const api = clove.create({
  baseURL: "https://api.example.com",
  timeout: 10_000,
  retry: { attempts: 3 },
  cache: { ttl: 60_000 },
});

// Add custom middleware
api.use(async (ctx, next) => {
  ctx.config.headers["Authorization"] = `Bearer ${getToken()}`;
  const response = await next();
  console.log(`← ${response.status} in ${response.meta.time}ms`);
  return response;
});

// Typed + validated response
const UserSchema = z.object({ id: z.number(), name: z.string() });

const { data } = await api.get("/users/1", { schema: UserSchema });
//     ^? { id: number; name: string }
```

---

## HTTP Methods

```ts
api.get("/users");
api.post("/users", { name: "Alice" });
api.put("/users/1", { name: "Alice Updated" });
api.patch("/users/1", { name: "Alice Patched" });
api.delete("/users/1");
api.head("/users");
api.options("/users");
```

---

## Parallel Requests

```ts
const results = await api.atOnce([
  { url: "/users" },
  { url: "/posts" },
  { url: "/comments", params: { postId: 1 } },
]);

for (const result of results) {
  if (result.status === "fulfilled") {
    console.log(result.value.data);
  }
}
```

---

## Middleware

Middlewares follow the **onion model**: everything before `next()` is the request phase, everything after is the response phase.

```ts
api.use(async (ctx, next) => {
  // → request phase: mutate ctx.config freely
  ctx.config.headers["X-Request-ID"] = crypto.randomUUID();

  const response = await next(); // ← actual fetch happens here

  // ← response phase: inspect or transform the response
  console.log(`Took ${response.meta.time}ms`);
  return response;
});
```

Calling `next()` more than once throws. Returning a response directly without calling `next()` short-circuits the pipeline (used internally by the cache plugin).

---

## Built-in Plugins

All plugins are auto-injected and run in priority order:

| Priority | Plugin               | What it does                                                    |
| -------- | -------------------- | --------------------------------------------------------------- |
| 10       | `security`           | SSRF prevention, protocol/domain validation, HTTPS enforcement  |
| 20       | `cache`              | LRU response cache with TTL and ETag/`If-None-Match` support    |
| 30       | `dedup`              | Collapses identical in-flight requests into a single fetch      |
| 50       | _(user middlewares)_ |                                                                 |
| 70       | `retry`              | Exponential backoff with jitter, respects `Retry-After` headers |
| 80       | `serializer`         | Auto-detects `Content-Type` based on body type                  |
| 90       | `zod`                | Validates response data against a schema                        |

### Disabling a plugin

```ts
const api = clove.create({
  cache: false, // disable caching for this instance
  retry: false, // disable retry
  security: false, // disable security checks
});
```

### Per-request overrides

```ts
await api.post("/webhook", payload, {
  retry: false, // don't retry this specific request
  cache: { ttl: 0 }, // bypass cache
});
```

---

## Custom Plugins

```ts
import type { ClovePlugin } from "clove";

const loggingPlugin: ClovePlugin = {
  name: "logging",
  priority: 50,

  middleware() {
    return async (ctx, next) => {
      console.log(`→ ${ctx.config.method} ${ctx.config.url}`);
      const response = await next();
      console.log(`← ${response.status} (${response.meta.time}ms)`);
      return response;
    };
  },
};

api.plugins.add(loggingPlugin);
api.plugins.remove("logging");
api.plugins.has("logging"); // false
```

---

## Error Handling

All errors extend `CloveError` and carry a typed `code` for `instanceof`-free checks:

```ts
import {
  CloveError,
  HttpError,
  TimeoutError,
  NetworkError,
  ValidationError,
  SecurityError,
} from "clove";

try {
  await api.get("/users");
} catch (error) {
  if (CloveError.isCloveError(error)) {
    switch (error.code) {
      case "CLOVE_HTTP": // 4xx / 5xx response
      case "CLOVE_TIMEOUT": // request timed out
      case "CLOVE_CANCELLED": // aborted via AbortSignal
      case "CLOVE_NETWORK": // fetch-level network failure
      case "CLOVE_VALIDATION": // Zod schema rejected the response
      case "CLOVE_SECURITY": // blocked by security plugin
    }
  }
}
```

---

## Cancellation

```ts
const controller = new AbortController();

const request = api.get("/slow-endpoint", { signal: controller.signal });

controller.abort(); // throws CancelledError
```

---

## Instance Config Reference

```ts
clove.create({
  baseURL: "https://api.example.com",
  timeout: 5000, // ms, default: 5000
  headers: { "X-App": "1" },
  credentials: "include", // default: 'same-origin'
  responseType: "json", // default: 'json'

  retry: {
    attempts: 3,
    delay: 300,
    backoff: "exponential", // or 'linear'
    jitter: true,
    retryOn: [408, 429, 500, 502, 503, 504],
  },
  cache: {
    ttl: 300_000, // ms, default: 5 minutes
    maxEntries: 100,
    methods: ["GET"],
  },
  dedup: {
    methods: ["GET", "HEAD"],
  },
  security: {
    blockPrivateIPs: true,
    httpsOnly: false,
    allowedDomains: ["*.example.com"],
    maxRedirects: 5,
    maxResponseSize: 10 * 1024 * 1024, // 10MB
  },
});
```

---

## License

MIT
