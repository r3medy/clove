// Clove - useClove React Hook

import { useState, useEffect, useRef, useCallback } from "react";
import { useCloveClient } from "./provider.js";
import { CloveError } from "../core/errors.js";
import type { CloveResponse, ResponseMeta } from "../core/types.js";
import type { UseCloveOptions, UseCloveResult } from "./types.js";

/** Internal state for the hook. */
type RequestStatus = "idle" | "loading" | "success" | "error";

/**
 * React hook for declarative data fetching with Clove.
 *
 * Automatically executes a GET request when the component mounts and
 * re-executes when `url` or `options` change. Provides loading/error
 * states, auto-cancellation on unmount, interval refetching, and
 * stale-while-revalidate support.
 *
 * @param url - The request URL (relative to the client's baseURL).
 * @param options - Hook options (extends CloveRequestConfig).
 *
 * @example
 * ```tsx
 * import { useClove } from 'clove/react';
 * import { z } from 'zod';
 *
 * const UserSchema = z.object({
 *   id: z.number(),
 *   name: z.string(),
 * });
 *
 * function UserProfile({ userId }: { userId: number }) {
 *   const { data, loading, error, refetch } = useClove(`/users/${userId}`, {
 *     schema: UserSchema,
 *   });
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *   if (!data) return null;
 *
 *   return (
 *     <div>
 *       <h1>{data.name}</h1>
 *       <button onClick={refetch}>Refresh</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useClove<T = unknown>(
  url: string,
  options: UseCloveOptions<T> = {},
): UseCloveResult<T> {
  const client = useCloveClient();

  const {
    enabled = true,
    refetchInterval,
    keepPreviousData = false,
    onSuccess,
    onError,
    schema,
    method,
    headers,
    params,
    timeout,
    credentials,
    responseType,
    retry,
    cache,
    dedup,
    onUploadProgress,
    onDownloadProgress,
    body,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<CloveError | null>(null);
  const [status, setStatus] = useState<RequestStatus>(enabled ? "loading" : "idle");
  const [meta, setMeta] = useState<ResponseMeta | null>(null);

  // Refs for stable references across renders
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  // Keep callback refs fresh without triggering re-fetches
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  // # Core Fetch Logic

  const execute = useCallback(async () => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus("loading");
    if (!keepPreviousData) {
      setError(null);
    }

    try {
      const response = await client.request<T>({
        url,
        method: method ?? "GET",
        headers,
        params,
        body,
        timeout,
        credentials,
        responseType,
        signal: controller.signal,
        schema,
        retry,
        cache,
        dedup,
        onUploadProgress,
        onDownloadProgress,
      });

      // Don't update state if unmounted or request was cancelled
      if (!mountedRef.current || controller.signal.aborted) return;

      setData(response.data);
      setError(null);
      setMeta(response.meta);
      setStatus("success");

      onSuccessRef.current?.(response.data, response as CloveResponse<T>);
    } catch (err) {
      // Don't update state if unmounted or request was cancelled
      if (!mountedRef.current || controller.signal.aborted) return;

      const cloveError =
        err instanceof CloveError
          ? err
          : new CloveError((err as Error).message ?? "Unknown error", "CLOVE_ERROR");

      if (!keepPreviousData) {
        setData(null);
      }
      setError(cloveError);
      setMeta(null);
      setStatus("error");

      onErrorRef.current?.(cloveError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    client,
    url,
    method,
    // Serialize non-primitive options for stable comparison
    JSON.stringify(headers),
    JSON.stringify(params),
    JSON.stringify(body),
    timeout,
    credentials,
    responseType,
    schema,
    JSON.stringify(retry),
    JSON.stringify(cache),
    JSON.stringify(dedup),
    keepPreviousData,
  ]);

  // # Auto-fetch on mount / option changes

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      execute();
    }

    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [enabled, execute]);

  // # Interval refetch

  useEffect(() => {
    if (!enabled || !refetchInterval || refetchInterval <= 0) return;

    const id = setInterval(() => {
      if (mountedRef.current) {
        execute();
      }
    }, refetchInterval);

    return () => clearInterval(id);
  }, [enabled, refetchInterval, execute]);

  // # Public API

  const refetch = useCallback(async () => {
    await execute();
  }, [execute]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    data,
    error,
    loading: status === "loading",
    meta,
    refetch,
    cancel,
    isIdle: status === "idle",
    isLoading: status === "loading",
    isSuccess: status === "success",
    isError: status === "error",
  };
}
