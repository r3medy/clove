# Clove

A modular, plugin-based fetch wrapper built on web standards. Think Axios, but with an Express-like middleware pipeline, auto-injected essential plugins, and zero runtime dependencies.

```ts
import { clove } from "clove";

const api = clove.create({ baseURL: "https://api.example.com", timeout: 10_000 });

const { data, meta } = await api.get("/users");
console.log(`Fetched in ${meta.time}ms`);
```

---

## Features

- **Express-style middleware pipeline** — code before `next()` runs on the request, code after runs on the response
- **Auto-injected plugins** — security, cache, dedup, retry, serializer, and Zod validation are wired in by default
- **Fully typed** — `ResolvedCloveConfig` guarantees no `undefined` inside the pipeline; per-request overrides are all optional
- **Schema validation** — pass any Zod-compatible schema and get back a typed, validated response
- **React hooks** — `useClove` for declarative fetching, `useCloveMutation` for imperative mutations
- **Progress tracking** — upload and download progress callbacks via `ReadableStream` monitoring
- **Parallel requests** — `atOnce()` fires multiple requests via `Promise.allSettled()` with typed tuple results
- **Request cancellation** — native `AbortController` support with automatic timeout management
- **Security hardening** — SSRF prevention with DNS resolution, protocol enforcement, domain allow/block lists
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
npm install react  # for the React hooks
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

`atOnce()` fires multiple requests simultaneously using `Promise.allSettled()`:

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

With typed schemas, return types are inferred per-request:

```ts
const [users, posts] = await api.atOnce([
  { url: "/users", schema: z.array(UserSchema) },
  { url: "/posts", schema: z.array(PostSchema) },
] as const);
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
  cache: false,    // disable caching for this instance
  retry: false,    // disable retry
  security: false, // disable security checks
});
```

### Per-request overrides

```ts
await api.post("/webhook", payload, {
  retry: false,        // don't retry this specific request
  cache: { ttl: 0 },   // bypass cache
});
```

---

## Progress Tracking

Monitor upload and download progress for large transfers:

```ts
// Download progress
const { data } = await api.get("/large-file", {
  responseType: "blob",
  onDownloadProgress: (progress) => {
    console.log(`Downloaded: ${progress.loaded} bytes`);
    if (progress.percentage !== undefined) {
      console.log(`${progress.percentage}% complete`);
    }
  },
});

// Upload progress
await api.post("/upload", largePayload, {
  onUploadProgress: (progress) => {
    updateProgressBar(progress.percentage ?? 0);
  },
});
```

The `ProgressInfo` object contains:

| Field        | Type                  | Description                                 |
| ------------ | --------------------- | ------------------------------------------- |
| `loaded`     | `number`              | Bytes transferred so far                    |
| `total`      | `number \| undefined` | Total bytes (from `Content-Length`), if known |
| `percentage` | `number \| undefined` | 0–100, if `total` is known                  |

---

## React Integration

Clove includes first-class React hooks via the `clove/react` entry point.

### Setup

```tsx
import { clove } from "clove";
import { CloveProvider } from "clove/react";

const api = clove.create({ baseURL: "/api" });

function App() {
  return (
    <CloveProvider client={api}>
      <MyApp />
    </CloveProvider>
  );
}
```

### `useClove` — Declarative data fetching

```tsx
import { useClove } from "clove/react";
import { z } from "zod";

const UserSchema = z.object({ id: z.number(), name: z.string() });

function UserProfile({ userId }: { userId: number }) {
  const { data, loading, error, refetch } = useClove(`/users/${userId}`, {
    schema: UserSchema,
    refetchInterval: 30_000,       // auto-refresh every 30s
    keepPreviousData: true,        // show old data while refetching
  });

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  return (
    <div>
      <h1>{data.name}</h1>
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

**Key behaviors:**

| Feature                 | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| Auto-fetch on mount     | Fires immediately (disable with `enabled: false`)               |
| Auto-cancel on unmount  | Aborts in-flight requests to prevent state updates on dead components |
| Dep-change re-fetch     | Re-fetches when URL or options change, cancels stale requests   |
| `keepPreviousData`      | Stale-while-revalidate — show old data during re-fetch          |
| `refetchInterval`       | Automatic polling at a configurable interval                    |
| `enabled`               | Deferred execution — fires when set to `true` or via `refetch()` |

**Returned state:**

```ts
const {
  data,       // T | null
  error,      // CloveError | null
  loading,    // boolean
  meta,       // ResponseMeta | null
  refetch,    // () => Promise<void>
  cancel,     // () => void
  isIdle,     // true before first fetch (enabled: false)
  isLoading,  // true while fetching
  isSuccess,  // true after successful fetch
  isError,    // true after failed fetch
} = useClove("/endpoint", options);
```

### `useCloveMutation` — Imperative mutations

```tsx
import { useCloveMutation } from "clove/react";

function CreateUser() {
  const { mutate, loading, error } = useCloveMutation("/users", {
    method: "POST",
    onSuccess: (user) => toast.success(`Created ${user.name}`),
    onError: (err) => toast.error(err.message),
    onSettled: () => queryCache.invalidate("/users"),
  });

  return (
    <button onClick={() => mutate({ name: "Jane" })} disabled={loading}>
      {loading ? "Creating..." : "Create User"}
    </button>
  );
}
```

---

## Custom Plugins

```ts
import type { ClovePlugin } from "clove";

const loggingPlugin: ClovePlugin = {
  name: "logging",
  priority: 5, // outermost — captures full timing

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
      case "CLOVE_HTTP":       // 4xx / 5xx response
      case "CLOVE_TIMEOUT":    // request timed out
      case "CLOVE_CANCELLED":  // aborted via AbortSignal
      case "CLOVE_NETWORK":    // fetch-level network failure
      case "CLOVE_VALIDATION": // schema rejected the response
      case "CLOVE_SECURITY":   // blocked by security plugin
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

Timeout is built-in — the default is `5000ms`. Set `timeout: 0` to disable.

---

## Cache Control

Access the cache programmatically via the plugin instance:

```ts
const cachePlugin = api.plugins.get("cache");

// Invalidate a specific entry
cachePlugin.cache.invalidate(key);

// Invalidate by URL prefix
cachePlugin.cache.invalidateByPrefix("/api/users");

// Glob-pattern invalidation
cachePlugin.cache.invalidateByPattern("/api/users/**");

// Clear everything
cachePlugin.cache.clear();
```

---

## Instance Config Reference

```ts
clove.create({
  baseURL: "https://api.example.com",
  timeout: 5000,                       // ms, default: 5000
  headers: { "X-App": "1" },
  credentials: "include",              // default: 'same-origin'
  responseType: "json",                // default: 'json'

  retry: {
    attempts: 3,                       // default: 3
    delay: 300,                        // ms, default: 300
    backoff: "exponential",            // or 'linear'
    jitter: true,                      // default: true
    retryOn: [408, 429, 500, 502, 503, 504],
  },
  cache: {
    ttl: 300_000,                      // ms, default: 5 minutes
    maxEntries: 100,                   // default: 100
    methods: ["GET"],                  // default: ['GET']
  },
  dedup: {
    methods: ["GET", "HEAD"],          // default: ['GET', 'HEAD']
  },
  security: {
    blockPrivateIPs: true,             // default: true (DNS resolution in Node.js)
    httpsOnly: false,                  // default: false
    allowedDomains: ["*.example.com"],
    maxRedirects: 5,                   // default: 5
    maxResponseSize: 10 * 1024 * 1024, // 10MB, default: Infinity
  },
});
```

---

## Package Exports

Clove ships three entry points for optimal tree-shaking:

```ts
import { clove, CloveClient } from "clove";                // Core
import { useClove, useCloveMutation } from "clove/react";  // React hooks
import { createCachePlugin } from "clove/plugins";          // Plugin factories
```

---

## License

MIT
