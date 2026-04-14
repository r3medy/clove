// Clove - useCloveMutation React Hook

import { useState, useRef, useCallback, useEffect } from "react";
import { useCloveClient } from "./provider.js";
import { CloveError } from "../core/errors.js";
import type { UseCloveMutationOptions, UseCloveMutationResult } from "./types.js";

/** Internal state for the mutation hook. */
type MutationStatus = "idle" | "loading" | "success" | "error";

/**
 * React hook for imperative data mutations with Clove.
 *
 * Unlike `useClove`, mutations don't execute automatically.
 * Call `mutate(variables)` to fire the request. Ideal for
 * POST, PUT, PATCH, and DELETE operations.
 *
 * @param url - The request URL (relative to the client's baseURL).
 * @param options - Mutation options.
 *
 * @example
 * ```tsx
 * import { useCloveMutation } from 'clove/react';
 *
 * function CreateUser() {
 *   const { mutate, loading, error, data } = useCloveMutation('/users', {
 *     method: 'POST',
 *     onSuccess: (user) => {
 *       console.log('Created:', user);
 *     },
 *   });
 *
 *   const handleSubmit = async (form: { name: string; email: string }) => {
 *     await mutate(form);
 *   };
 *
 *   return (
 *     <form onSubmit={(e) => { e.preventDefault(); handleSubmit({ name: 'Jane', email: 'jane@example.com' }); }}>
 *       <button type="submit" disabled={loading}>
 *         {loading ? 'Creating...' : 'Create User'}
 *       </button>
 *       {error && <p>Error: {error.message}</p>}
 *     </form>
 *   );
 * }
 * ```
 */
export function useCloveMutation<TData = unknown, TVariables = unknown>(
  url: string,
  options: UseCloveMutationOptions<TData, TVariables> = {},
): UseCloveMutationResult<TData, TVariables> {
  const client = useCloveClient();

  const {
    method = "POST",
    schema,
    onSuccess,
    onError,
    onSettled,
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
  } = options;

  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<CloveError | null>(null);
  const [status, setStatus] = useState<MutationStatus>("idle");

  // Refs for stable callback references
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onSettledRef = useRef(onSettled);

  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  onSettledRef.current = onSettled;

  // Track mount status for safe state updates
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData> => {
      // Cancel any in-flight mutation
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus("loading");
      setError(null);

      try {
        const response = await client.request<TData>({
          url,
          method,
          headers,
          params,
          body: variables,
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

        if (!mountedRef.current) return response.data;

        setData(response.data);
        setStatus("success");
        setError(null);

        onSuccessRef.current?.(response.data, variables);
        onSettledRef.current?.(response.data, null, variables);

        return response.data;
      } catch (err) {
        const cloveError =
          err instanceof CloveError
            ? err
            : new CloveError((err as Error).message ?? "Unknown error", "CLOVE_ERROR");

        if (mountedRef.current) {
          setError(cloveError);
          setStatus("error");
          setData(null);
        }

        onErrorRef.current?.(cloveError, variables);
        onSettledRef.current?.(null, cloveError, variables);

        throw cloveError;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      client,
      url,
      method,
      JSON.stringify(headers),
      JSON.stringify(params),
      timeout,
      credentials,
      responseType,
      schema,
      JSON.stringify(retry),
      JSON.stringify(cache),
      JSON.stringify(dedup),
    ],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setStatus("idle");
    abortControllerRef.current?.abort();
  }, []);

  return {
    data,
    error,
    loading: status === "loading",
    mutate,
    reset,
    isIdle: status === "idle",
    isLoading: status === "loading",
    isSuccess: status === "success",
    isError: status === "error",
  };
}
