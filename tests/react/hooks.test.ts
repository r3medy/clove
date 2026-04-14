// @vitest-environment jsdom

// Clove - React Hook Tests

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { CloveProvider } from "../../src/react/provider";
import { useClove } from "../../src/react/useClove";
import { useCloveMutation } from "../../src/react/useCloveMutation";
import { CloveClient } from "../../src/core/client";
import { CloveError } from "../../src/core/errors";

// # Test Helpers

/** Create a mock Response. */
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

/** Create a CloveClient with all plugins disabled (for isolated testing). */
function createTestClient(overrides?: Parameters<typeof CloveClient.prototype.constructor>[0]) {
  return new CloveClient({
    baseURL: "https://api.test.com",
    security: false,
    cache: false,
    dedup: false,
    retry: false,
    ...overrides,
  });
}

/** Wrapper component providing CloveContext. */
function createWrapper(client: CloveClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(CloveProvider, { client }, children);
  };
}

// # CloveProvider

describe("CloveProvider", () => {
  it("should throw when useClove is used outside provider", () => {
    // Suppress console.error from React error boundary
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useClove("/test"));
    }).toThrow("useClove/useCloveMutation must be used within a <CloveProvider>");

    spy.mockRestore();
  });
});

// # useClove

describe("useClove", () => {
  it("should fetch data on mount", async () => {
    fetchMock.mockResolvedValue(mockResponse({ name: "John" }));
    const client = createTestClient();

    const { result } = renderHook(() => useClove<{ name: string }>("/users/1"), {
      wrapper: createWrapper(client),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    // Wait for data
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ name: "John" });
    expect(result.current.error).toBeNull();
    expect(result.current.meta).not.toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("should handle errors", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ error: "Not Found" }, { status: 404, statusText: "Not Found" }),
    );
    const client = createTestClient();

    const { result } = renderHook(() => useClove("/missing"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(CloveError);
    expect(result.current.data).toBeNull();
  });

  it("should not fetch when enabled is false", async () => {
    fetchMock.mockResolvedValue(mockResponse({ data: "test" }));
    const client = createTestClient();

    const { result } = renderHook(() => useClove("/deferred", { enabled: false }), {
      wrapper: createWrapper(client),
    });

    // Should be idle, not loading
    expect(result.current.isIdle).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should fetch when enabled changes from false to true", async () => {
    fetchMock.mockResolvedValue(mockResponse({ data: "loaded" }));
    const client = createTestClient();

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useClove<{ data: string }>("/deferred", { enabled }),
      {
        wrapper: createWrapper(client),
        initialProps: { enabled: false },
      },
    );

    expect(result.current.isIdle).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    // Enable the hook
    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ data: "loaded" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should refetch when refetch() is called", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      return Promise.resolve(mockResponse({ count: callCount }));
    });
    const client = createTestClient();

    const { result } = renderHook(() => useClove<{ count: number }>("/counter"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ count: 1 });

    // Trigger refetch
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual({ count: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("should cancel request on unmount", async () => {
    let abortSignalAborted = false;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((resolve) => {
        init.signal?.addEventListener("abort", () => {
          abortSignalAborted = true;
        });
        // Never resolve — simulates a slow request
        setTimeout(
          () => resolve(mockResponse({ data: "slow" })),
          10_000,
        );
      });
    });
    const client = createTestClient({ timeout: 0 });

    const { unmount } = renderHook(() => useClove("/slow"), {
      wrapper: createWrapper(client),
    });

    // Unmount while request is in-flight
    unmount();

    expect(abortSignalAborted).toBe(true);
  });

  it("should keep previous data when keepPreviousData is true", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockResponse({ page: 1 }));
      }
      // Second call is slow
      return new Promise((resolve) =>
        setTimeout(() => resolve(mockResponse({ page: 2 })), 50),
      );
    });
    const client = createTestClient();

    const { result } = renderHook(
      () => useClove<{ page: number }>("/data", { keepPreviousData: true }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({ page: 1 });

    // Trigger refetch
    act(() => {
      result.current.refetch();
    });

    // Should still show old data while loading
    expect(result.current.data).toEqual({ page: 1 });

    await waitFor(() => {
      expect(result.current.data).toEqual({ page: 2 });
    });
  });

  it("should call onSuccess callback", async () => {
    fetchMock.mockResolvedValue(mockResponse({ id: 1 }));
    const onSuccess = vi.fn();
    const client = createTestClient();

    renderHook(() => useClove("/item", { onSuccess }), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    expect(onSuccess).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ data: { id: 1 }, status: 200 }),
    );
  });

  it("should call onError callback", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ error: "oops" }, { status: 500, statusText: "Internal Server Error" }),
    );
    const onError = vi.fn();
    const client = createTestClient();

    renderHook(() => useClove("/fail", { onError }), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    expect(onError).toHaveBeenCalledWith(expect.any(CloveError));
  });

  it("should cancel previous request when deps change", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      const currentCount = callCount;
      return new Promise((resolve) =>
        setTimeout(() => resolve(mockResponse({ id: currentCount })), currentCount === 1 ? 100 : 10),
      );
    });
    const client = createTestClient({ timeout: 0 });

    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useClove<{ id: number }>(url),
      {
        wrapper: createWrapper(client),
        initialProps: { url: "/users/1" },
      },
    );

    // Change URL while first request is in-flight
    rerender({ url: "/users/2" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should show data from the second (faster) request
    expect(result.current.data).toEqual({ id: 2 });
  });
});

// # useCloveMutation

describe("useCloveMutation", () => {
  it("should not fire on mount", () => {
    fetchMock.mockResolvedValue(mockResponse({}));
    const client = createTestClient();

    const { result } = renderHook(() => useCloveMutation("/users"), {
      wrapper: createWrapper(client),
    });

    expect(result.current.isIdle).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should fire on mutate() and return data", async () => {
    fetchMock.mockResolvedValue(mockResponse({ id: 42, name: "Jane" }));
    const client = createTestClient();

    const { result } = renderHook(
      () => useCloveMutation<{ id: number; name: string }, { name: string }>("/users", {
        method: "POST",
      }),
      { wrapper: createWrapper(client) },
    );

    let data: { id: number; name: string } | undefined;
    await act(async () => {
      data = await result.current.mutate({ name: "Jane" });
    });

    expect(data).toEqual({ id: 42, name: "Jane" });
    expect(result.current.data).toEqual({ id: 42, name: "Jane" });
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("should handle mutation errors", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ error: "Validation failed" }, { status: 422, statusText: "Unprocessable Entity" }),
    );
    const client = createTestClient();

    const { result } = renderHook(
      () => useCloveMutation("/users", { method: "POST" }),
      { wrapper: createWrapper(client) },
    );

    await act(async () => {
      try {
        await result.current.mutate({ invalid: true });
      } catch {
        // Expected
      }
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBeInstanceOf(CloveError);
    expect(result.current.data).toBeNull();
  });

  it("should call lifecycle callbacks", async () => {
    fetchMock.mockResolvedValue(mockResponse({ id: 1 }));
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const client = createTestClient();

    const { result } = renderHook(
      () => useCloveMutation<{ id: number }, { name: string }>("/users", {
        method: "POST",
        onSuccess,
        onSettled,
      }),
      { wrapper: createWrapper(client) },
    );

    await act(async () => {
      await result.current.mutate({ name: "Jane" });
    });

    expect(onSuccess).toHaveBeenCalledWith({ id: 1 }, { name: "Jane" });
    expect(onSettled).toHaveBeenCalledWith({ id: 1 }, null, { name: "Jane" });
  });

  it("should reset state on reset()", async () => {
    fetchMock.mockResolvedValue(mockResponse({ id: 1 }));
    const client = createTestClient();

    const { result } = renderHook(() => useCloveMutation("/users"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutate({ name: "Jane" });
    });
    expect(result.current.isSuccess).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("should call onError callback on failure", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({}, { status: 500, statusText: "Server Error" }),
    );
    const onError = vi.fn();
    const onSettled = vi.fn();
    const client = createTestClient();

    const { result } = renderHook(
      () => useCloveMutation("/fail", {
        method: "POST",
        onError,
        onSettled,
      }),
      { wrapper: createWrapper(client) },
    );

    await act(async () => {
      try {
        await result.current.mutate({});
      } catch {
        // Expected
      }
    });

    expect(onError).toHaveBeenCalledWith(expect.any(CloveError), {});
    expect(onSettled).toHaveBeenCalledWith(null, expect.any(CloveError), {});
  });
});
