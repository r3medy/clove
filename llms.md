# Clove — AI Reference Guide

> This document is designed for AI coding assistants. It provides the full API surface, common patterns, and pitfalls for generating correct Clove code.

## What is Clove?

Clove is a modular, plugin-based fetch API wrapper for TypeScript/JavaScript. It replaces Axios with a middleware pipeline built on web-standard `fetch()`. Zero runtime dependencies. Works in Node.js ≥ 18 and modern browsers.

## Installation

```bash
npm install @r3medy/clove
npm install zod    # optional — for response validation
npm install react  # optional — for React hooks
```

## Import Paths

```ts
// Core — client, errors, types, utilities
import { clove, CloveClient, CloveError, HttpError, TimeoutError, NetworkError, ValidationError, SecurityError, CancelledError } from "@r3medy/clove";

// React hooks — requires wrapping app in <CloveProvider>
import { CloveProvider, useClove, useCloveMutation } from "@r3medy/clove/react";

// Plugin factories — for advanced usage only
import { createCachePlugin, createRetryPlugin, createSecurityPlugin, createDedupPlugin, createSerializerPlugin, createZodPlugin } from "@r3medy/clove/plugins";
```

## Creating a Client

```ts
const api = clove.create({
  baseURL: "https://api.example.com",
  timeout: 5000,           // ms, default: 5000. Set 0 to disable.
  headers: {},             // default headers for all requests
  credentials: "same-origin", // "same-origin" | "include" | "omit"
  responseType: "json",    // "json" | "text" | "blob" | "arrayBuffer"

  // Built-in plugin configs (all enabled by default, set to `false` to disable)
  retry: { attempts: 3, delay: 300, backoff: "exponential", jitter: true, retryOn: [408, 429, 500, 502, 503, 504] },
  cache: { ttl: 300_000, methods: ["GET"], maxEntries: 100 },
  dedup: { methods: ["GET", "HEAD"] },
  security: { blockPrivateIPs: true, httpsOnly: false, maxRedirects: 5 },
});
```

## HTTP Methods

All methods return `Promise<CloveResponse<T>>`.

```ts
api.get<T>(url, config?)
api.post<T>(url, body?, config?)
api.put<T>(url, body?, config?)
api.patch<T>(url, body?, config?)
api.delete<T>(url, body?, config?)
api.head<T>(url, config?)
api.options<T>(url, config?)
```

## CloveResponse Shape

```ts
interface CloveResponse<T> {
  data: T;                    // parsed response body
  status: number;             // HTTP status code
  statusText: string;
  headers: Headers;           // standard Headers object
  config: ResolvedCloveConfig;
  meta: {
    start: number;            // performance.now() timestamp
    end: number;
    time: number;             // round-trip ms
    cached?: boolean;         // true if served from cache
    retries?: number;         // number of retry attempts
  };
}
```

## Per-Request Config

Any option from the instance config can be overridden per-request:

```ts
const { data } = await api.get("/users", {
  headers: { "X-Custom": "value" },
  params: { page: 1, limit: 10 },  // appended as query string
  timeout: 10_000,
  signal: abortController.signal,   // for cancellation
  schema: UserSchema,               // Zod schema for validation
  retry: false,                     // disable retry for this request
  cache: { ttl: 0 },               // override cache TTL
  onDownloadProgress: (p) => {},    // { loaded, total?, percentage? }
});

// POST/PUT/PATCH — body is the second argument
await api.post("/users", { name: "Jane" }, { retry: false });
```

## Zod Schema Validation

Pass a Zod schema to validate and type the response:

```ts
import { z } from "zod";

const UserSchema = z.object({ id: z.number(), name: z.string() });

const { data } = await api.get("/users/1", { schema: UserSchema });
// data is typed as { id: number; name: string }
// Throws ValidationError if response doesn't match
```

## Error Handling

All errors extend `CloveError` with a `code` property:

```ts
try {
  await api.get("/endpoint");
} catch (error) {
  if (error instanceof HttpError)       { /* error.status, error.response */ }
  if (error instanceof TimeoutError)    { /* request timed out */ }
  if (error instanceof CancelledError)  { /* AbortController.abort() called */ }
  if (error instanceof NetworkError)    { /* DNS failure, offline, etc. */ }
  if (error instanceof ValidationError) { /* Zod schema rejected response */ }
  if (error instanceof SecurityError)   { /* SSRF, blocked domain, etc. */ }

  // Or use error codes without instanceof:
  if (CloveError.isCloveError(error)) {
    error.code; // "CLOVE_HTTP" | "CLOVE_TIMEOUT" | "CLOVE_CANCELLED" | "CLOVE_NETWORK" | "CLOVE_VALIDATION" | "CLOVE_SECURITY"
  }
}
```

## Cancellation

```ts
const controller = new AbortController();
const promise = api.get("/slow", { signal: controller.signal });
controller.abort(); // rejects with CancelledError
```

## Parallel Requests

```ts
const results = await api.atOnce([
  { url: "/users" },
  { url: "/posts", params: { limit: 5 } },
  { url: "/comments" },
]);

// results is PromiseSettledResult<CloveResponse>[]
for (const r of results) {
  if (r.status === "fulfilled") console.log(r.value.data);
  if (r.status === "rejected") console.error(r.reason);
}
```

## Middleware

Follows the onion model. Everything before `next()` is the request phase, after is the response phase.

```ts
api.use(async (ctx, next) => {
  // Request phase — mutate ctx.config
  ctx.config.headers["Authorization"] = `Bearer ${token}`;

  const response = await next(); // execute the request

  // Response phase — inspect/transform
  console.log(`${response.status} in ${response.meta.time}ms`);
  return response; // must return the response
});
```

**Rules:**
- `next()` must be called exactly once (or zero times to short-circuit).
- The middleware must return a `CloveResponse`.

## Custom Plugins

```ts
import type { ClovePlugin } from "@r3medy/clove";

const myPlugin: ClovePlugin = {
  name: "my-plugin",
  priority: 55, // lower = runs first. User middlewares are at 50.

  middleware() {
    return async (ctx, next) => {
      // plugin logic
      return next();
    };
  },

  teardown() {
    // optional cleanup
  },
};

api.plugins.add(myPlugin);
api.plugins.remove("my-plugin");
api.plugins.has("my-plugin");
api.plugins.get("my-plugin");
```

## Cache Control API

```ts
const cachePlugin = api.plugins.get("cache");
cachePlugin.cache.invalidate(key);                    // exact key
cachePlugin.cache.invalidateByPrefix("/api/users");   // startsWith
cachePlugin.cache.invalidateByPattern("/api/users/**"); // glob: * = one segment, ** = any depth
cachePlugin.cache.clear();
cachePlugin.cache.size();
cachePlugin.cache.keys();
```

## Progress Tracking

```ts
// Download
await api.get("/file", {
  onDownloadProgress: ({ loaded, total, percentage }) => {
    console.log(`${percentage}%`); // percentage is undefined if Content-Length is missing
  },
});

// Upload
await api.post("/upload", largeBody, {
  onUploadProgress: ({ loaded, total, percentage }) => {
    updateProgressBar(percentage);
  },
});
```

## React Integration

### Provider Setup (required)

```tsx
import { clove } from "@r3medy/clove";
import { CloveProvider } from "@r3medy/clove/react";

const api = clove.create({ baseURL: "/api" });

function App() {
  return (
    <CloveProvider client={api}>
      <MyApp />
    </CloveProvider>
  );
}
```

### useClove — Declarative Fetching

```tsx
import { useClove } from "@r3medy/clove/react";

function UserList() {
  const { data, loading, error, refetch, isIdle, isLoading, isSuccess, isError } = useClove("/users", {
    schema: UsersSchema,          // optional Zod schema
    enabled: true,                // set false to defer until refetch() or enabled becomes true
    refetchInterval: 30_000,      // auto-poll every 30s
    keepPreviousData: true,       // show stale data while refetching
    onSuccess: (data, response) => {},
    onError: (error) => {},
    // ... any CloveRequestConfig option (headers, params, retry, cache, etc.)
  });

  // data: T | null
  // error: CloveError | null
  // loading: boolean
  // meta: ResponseMeta | null
  // refetch: () => Promise<void>
  // cancel: () => void
}
```

**Behaviors:**
- Auto-fetches on mount and when URL/options change
- Auto-cancels on unmount (prevents state updates on dead components)
- Auto-cancels previous request when deps change

### useCloveMutation — Imperative Mutations

```tsx
import { useCloveMutation } from "@r3medy/clove/react";

function CreateUser() {
  const { mutate, data, loading, error, reset, isIdle, isLoading, isSuccess, isError } = useCloveMutation("/users", {
    method: "POST",                // "POST" | "PUT" | "PATCH" | "DELETE"
    onSuccess: (data, variables) => {},
    onError: (error, variables) => {},
    onSettled: (data, error, variables) => {},
  });

  // mutate(variables) sends the request with variables as body
  // mutate returns Promise<TData> (throws on error)
  // reset() clears data/error/status back to idle
  await mutate({ name: "Jane", email: "jane@example.com" });
}
```

## Common Patterns

### Auth Token Injection

```ts
api.use(async (ctx, next) => {
  const token = await getAccessToken();
  ctx.config.headers["Authorization"] = `Bearer ${token}`;
  return next();
});
```

### Global Error Handling

```ts
api.use(async (ctx, next) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      await refreshToken();
      return next(); // retry with new token — careful: next() can only be called once per middleware
    }
    throw error;
  }
});
```

### Disabling All Plugins

```ts
const rawApi = clove.create({
  security: false,
  cache: false,
  dedup: false,
  retry: false,
});
```

## Pitfalls

1. **`next()` can only be called once per middleware.** Calling it twice throws an error.
2. **Plugin configs set to `false` at the instance level cannot be re-enabled per-request.** Only instance-enabled plugins can be overridden per-request.
3. **`schema` is Zod-compatible but not Zod-specific.** Any object with a `.parse(data)` method works.
4. **`onUploadProgress` doesn't work with `Blob` or `FormData` bodies** — those types can't be synchronously converted to byte arrays for metering.
5. **`onDownloadProgress.total` is `undefined` when the server doesn't send `Content-Length`.**
6. **React hooks must be used inside `<CloveProvider>`.** Using them outside throws a clear error.
7. **`useClove` is for GET-like reads; `useCloveMutation` is for writes.** Don't use `useClove` for POST requests.
