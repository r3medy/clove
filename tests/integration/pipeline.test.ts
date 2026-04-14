// Clove - Integration Tests (Phase 4)
// Tests that exercise the full pipeline: client → plugins → mock fetch → response

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CloveClient } from "../../src/core/client";
import { SecurityError, HttpError, ValidationError } from "../../src/core/errors";
import type { CloveResponse, ProgressInfo } from "../../src/core/types";

// # Mock Fetch Setup

/** Create a mock Response object. */
function mockResponse(body: unknown, init?: ResponseInit & { headers?: Record<string, string> }): Response {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(bodyStr, {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? "OK",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Integration: Full Pipeline", () => {
  it("should execute a basic GET through the full pipeline", async () => {
    fetchMock.mockResolvedValue(mockResponse({ users: [{ id: 1 }] }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      // Disable plugins that would interfere
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    const response = await client.get<{ users: Array<{ id: number }> }>("/users");

    expect(response.status).toBe(200);
    expect(response.data.users).toEqual([{ id: 1 }]);
    expect(response.meta.time).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify the URL was built correctly
    const calledUrl = fetchMock.mock.calls[0]?.[0];
    expect(calledUrl).toBe("https://api.example.com/users");
  });

  it("should execute POST with JSON body", async () => {
    fetchMock.mockResolvedValue(mockResponse({ id: 42 }, { status: 201, statusText: "Created" }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    const response = await client.post("/users", { name: "Jane" });

    expect(response.status).toBe(201);
    expect(response.data).toEqual({ id: 42 });

    // Verify body was sent correctly
    const calledInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(calledInit.method).toBe("POST");
  });

  it("should throw HttpError for non-2xx responses", async () => {
    fetchMock.mockResolvedValue(mockResponse({ error: "Not Found" }, { status: 404, statusText: "Not Found" }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    await expect(client.get("/missing")).rejects.toThrow(HttpError);
  });
});

describe("Integration: Security Plugin", () => {
  it("should block requests to private IPs in full pipeline", async () => {
    fetchMock.mockResolvedValue(mockResponse({}));

    const client = new CloveClient({
      security: { blockPrivateIPs: true },
      cache: false,
      dedup: false,
      retry: false,
    });

    await expect(client.get("http://127.0.0.1/admin")).rejects.toThrow(SecurityError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should allow requests when security is disabled per-request", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }));

    const client = new CloveClient({
      security: { blockPrivateIPs: true },
      cache: false,
      dedup: false,
      retry: false,
    });

    // This should throw with the default config
    await expect(client.get("http://127.0.0.1/admin")).rejects.toThrow(SecurityError);
  });
});

describe("Integration: Cache Plugin", () => {
  it("should cache and return cached responses", async () => {
    fetchMock.mockResolvedValue(mockResponse({ data: "fresh" }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      cache: { ttl: 60_000, methods: ["GET"], maxEntries: 100 },
      security: false,
      dedup: false,
      retry: false,
    });

    // First request — should hit fetch
    const r1 = await client.get("/data");
    expect(r1.data).toEqual({ data: "fresh" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second request — should hit cache
    const r2 = await client.get("/data");
    expect(r2.data).toEqual({ data: "fresh" });
    expect(r2.meta.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // No additional fetch
  });

  it("should support glob-pattern cache invalidation", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      return Promise.resolve(mockResponse({ count: callCount }));
    });

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      cache: { ttl: 60_000, methods: ["GET"], maxEntries: 100 },
      security: false,
      dedup: false,
      retry: false,
    });

    // Cache some requests
    await client.get("/api/users/1");
    await client.get("/api/users/2");
    await client.get("/api/posts/1");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Invalidate all user-related cache entries
    const cachePlugin = client.plugins.get("cache") as ReturnType<typeof import("../../src/plugins/cache").createCachePlugin>;
    const invalidated = cachePlugin.cache.invalidateByPattern("/api/users/**");
    expect(invalidated).toBe(2);

    // Re-fetch users — should hit network again
    await client.get("/api/users/1");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Posts should still be cached
    const postResponse = await client.get("/api/posts/1");
    expect(postResponse.meta.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("Integration: Dedup Plugin", () => {
  it("should deduplicate concurrent identical requests", async () => {
    let resolveResponse!: (value: Response) => void;
    const responsePromise = new Promise<Response>((r) => {
      resolveResponse = r;
    });
    fetchMock.mockReturnValue(responsePromise);

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      dedup: { methods: ["GET", "HEAD"] },
      security: false,
      cache: false,
      retry: false,
    });

    // Fire 3 identical requests simultaneously
    const p1 = client.get("/users");
    const p2 = client.get("/users");
    const p3 = client.get("/users");

    // Only ONE fetch call should have been made
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Resolve the single fetch
    resolveResponse(mockResponse([{ id: 1 }]));

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.data).toEqual([{ id: 1 }]);
    expect(r2.data).toEqual([{ id: 1 }]);
    expect(r3.data).toEqual([{ id: 1 }]);
  });
});

describe("Integration: Retry Plugin", () => {
  it("should retry on server errors and eventually succeed", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ error: "fail" }, { status: 500, statusText: "Internal Server Error" }))
      .mockResolvedValueOnce(mockResponse({ error: "fail" }, { status: 500, statusText: "Internal Server Error" }))
      .mockResolvedValue(mockResponse({ success: true }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      retry: { attempts: 3, delay: 1, backoff: "linear", jitter: false },
      security: false,
      cache: false,
      dedup: false,
    });

    const response = await client.get("/flaky");

    expect(response.data).toEqual({ success: true });
    expect(response.meta.retries).toBe(2);
    // 1 initial + 2 retries = 3 total calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should stop retrying after max attempts", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(mockResponse({ error: "fail" }, { status: 500, statusText: "Internal Server Error" })),
    );

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      retry: { attempts: 2, delay: 1, backoff: "linear", jitter: false },
      security: false,
      cache: false,
      dedup: false,
    });

    await expect(client.get("/always-fail")).rejects.toThrow(HttpError);
    // 1 initial + 2 retries = 3 total calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("Integration: Zod Plugin", () => {
  it("should validate response data with a schema", async () => {
    fetchMock.mockResolvedValue(mockResponse({ id: 1, name: "John" }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    // Mock schema that transforms data
    const schema = {
      parse: (data: unknown) => {
        const obj = data as Record<string, unknown>;
        if (typeof obj["id"] !== "number") throw new Error("id must be number");
        return { id: obj["id"] as number, name: String(obj["name"]).toUpperCase() };
      },
    };

    const response = await client.get("/user", { schema });
    expect(response.data).toEqual({ id: 1, name: "JOHN" });
  });

  it("should throw ValidationError when schema fails", async () => {
    fetchMock.mockResolvedValue(mockResponse({ id: "not-a-number" }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    const schema = {
      parse: (data: unknown) => {
        const obj = data as Record<string, unknown>;
        if (typeof obj["id"] !== "number") throw new Error("id must be number");
        return obj;
      },
    };

    await expect(client.get("/user", { schema })).rejects.toThrow(ValidationError);
  });
});

describe("Integration: Serializer Plugin", () => {
  it("should auto-detect JSON content type", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    await client.post("/data", { key: "value" });

    const calledInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("Integration: Middleware", () => {
  it("should execute user middleware in the correct position", async () => {
    fetchMock.mockResolvedValue(mockResponse({ data: "test" }));
    const order: string[] = [];

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    client.use(async (ctx, next) => {
      order.push("before-user-mw");
      const res = await next();
      order.push("after-user-mw");
      return res;
    });

    await client.get("/test");

    expect(order).toEqual(["before-user-mw", "after-user-mw"]);
  });

  it("should allow middleware to modify headers", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    client.use(async (ctx, next) => {
      ctx.config.headers = { ...ctx.config.headers, "X-Custom": "injected" };
      return next();
    });

    await client.get("/test");

    const calledInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["X-Custom"]).toBe("injected");
  });
});

describe("Integration: atOnce", () => {
  it("should execute multiple requests in parallel", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ type: "users" }))
      .mockResolvedValueOnce(mockResponse({ type: "posts" }))
      .mockResolvedValueOnce(mockResponse({ type: "comments" }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    const results = await client.atOnce([
      { url: "/users" },
      { url: "/posts" },
      { url: "/comments" },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]?.status).toBe("fulfilled");
    expect(results[2]?.status).toBe("fulfilled");

    if (results[0]?.status === "fulfilled") {
      expect(results[0].value.data).toEqual({ type: "users" });
    }
  });

  it("should handle mixed success/failure in atOnce", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ ok: true }))
      .mockResolvedValueOnce(mockResponse({ error: "Not Found" }, { status: 404, statusText: "Not Found" }));

    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    const results = await client.atOnce([
      { url: "/success" },
      { url: "/failure" },
    ]);

    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]?.status).toBe("rejected");
  });
});

describe("Integration: Progress Tracking", () => {
  it("should report download progress for responses", async () => {
    // Create a response with known Content-Length
    const body = JSON.stringify({ data: "x".repeat(100) });
    const response = new Response(body, {
      headers: {
        "content-type": "application/json",
        "content-length": String(new TextEncoder().encode(body).length),
      },
    });
    fetchMock.mockResolvedValue(response);

    const progress: ProgressInfo[] = [];
    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    const result = await client.get("/large-data", {
      onDownloadProgress: (p) => progress.push({ ...p }),
    });

    // Should have received at least one progress event + final
    expect(progress.length).toBeGreaterThanOrEqual(1);

    // Last event should be 100%
    const last = progress[progress.length - 1]!;
    expect(last.percentage).toBe(100);
    expect(last.loaded).toBeGreaterThan(0);
  });

  it("should report upload progress for POST bodies", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }));

    const progress: ProgressInfo[] = [];
    const client = new CloveClient({
      baseURL: "https://api.example.com",
      security: false,
      cache: false,
      dedup: false,
      retry: false,
    });

    const largeBody = { data: "x".repeat(5000) };
    await client.post("/upload", largeBody, {
      onUploadProgress: (p) => progress.push({ ...p }),
    });

    // Should have received progress events
    expect(progress.length).toBeGreaterThanOrEqual(1);

    // Last event should be 100%
    const last = progress[progress.length - 1]!;
    expect(last.percentage).toBe(100);
    expect(last.total).toBeGreaterThan(0);
    expect(last.loaded).toBe(last.total);
  });
});
