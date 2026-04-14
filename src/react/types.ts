// Clove - React Types

import type { CloveError } from "../core/errors.js";
import type {
  CloveRequestConfig,
  CloveResponse,
  ResponseMeta,
  Schema,
  ProgressCallback,
} from "../core/types.js";

// # Hook Options

/**
 * Options for the `useClove` hook.
 *
 * Extends per-request config with React-specific options like
 * `enabled`, `refetchInterval`, and lifecycle callbacks.
 */
export interface UseCloveOptions<T = unknown>
  extends Omit<CloveRequestConfig, "url" | "signal"> {
  /**
   * Whether the request should execute automatically.
   * Set to `false` to defer execution until `refetch()` is called or
   * `enabled` becomes `true`.
   *
   * Default: `true`.
   */
  enabled?: boolean;

  /**
   * Validation schema (Zod-compatible).
   * When set, the response data is validated and the return type is inferred.
   */
  schema?: Schema<T>;

  /**
   * Auto-refetch interval in milliseconds.
   * When set, the request is re-executed at this interval.
   * Set to `0` or `undefined` to disable.
   */
  refetchInterval?: number;

  /**
   * Keep showing previous data while a new request is loading.
   * Useful for paginated data or search results to prevent UI flashing.
   *
   * Default: `false`.
   */
  keepPreviousData?: boolean;

  /** Called when the request succeeds. */
  onSuccess?: (data: T, response: CloveResponse<T>) => void;

  /** Called when the request fails. */
  onError?: (error: CloveError) => void;
}

// # Hook Result

/** The state and controls returned by `useClove`. */
export interface UseCloveResult<T> {
  /** The response data, or `null` if not yet loaded. */
  data: T | null;

  /** The error, or `null` if no error occurred. */
  error: CloveError | null;

  /** Whether a request is currently in-flight. */
  loading: boolean;

  /** Response metadata (timing, cache status, etc.), or `null` if not yet loaded. */
  meta: ResponseMeta | null;

  /** Manually trigger a refetch. Works even when `enabled` is `false`. */
  refetch: () => Promise<void>;

  /** Cancel the current in-flight request. */
  cancel: () => void;

  // Status helpers

  /** `true` before the first request has been initiated (i.e., `enabled: false` and never refetched). */
  isIdle: boolean;

  /** `true` while a request is in-flight. */
  isLoading: boolean;

  /** `true` when the last request succeeded. */
  isSuccess: boolean;

  /** `true` when the last request failed. */
  isError: boolean;
}

// # Mutation Hook

/**
 * Options for the `useCloveMutation` hook.
 * Unlike `useClove`, mutations don't auto-execute — they fire on `mutate()`.
 */
export interface UseCloveMutationOptions<TData = unknown, TVariables = unknown>
  extends Omit<CloveRequestConfig, "url" | "signal" | "body" | "method"> {
  /** HTTP method for the mutation. Default: 'POST'. */
  method?: "POST" | "PUT" | "PATCH" | "DELETE";

  /** Validation schema for the response. */
  schema?: Schema<TData>;

  /** Called when the mutation succeeds. */
  onSuccess?: (data: TData, variables: TVariables) => void;

  /** Called when the mutation fails. */
  onError?: (error: CloveError, variables: TVariables) => void;

  /** Called after either success or error. */
  onSettled?: (data: TData | null, error: CloveError | null, variables: TVariables) => void;
}

/** The state and controls returned by `useCloveMutation`. */
export interface UseCloveMutationResult<TData, TVariables> {
  /** The response data from the last successful mutation, or `null`. */
  data: TData | null;

  /** The error from the last mutation, or `null`. */
  error: CloveError | null;

  /** Whether a mutation is currently in-flight. */
  loading: boolean;

  /** Fire the mutation with the given variables (request body). */
  mutate: (variables: TVariables) => Promise<TData>;

  /** Reset the mutation state (clear data and error). */
  reset: () => void;

  /** `true` before the first mutation has been fired. */
  isIdle: boolean;

  /** `true` while a mutation is in-flight. */
  isLoading: boolean;

  /** `true` when the last mutation succeeded. */
  isSuccess: boolean;

  /** `true` when the last mutation failed. */
  isError: boolean;
}

// # Provider Props

/** Props for the `CloveProvider` component. */
export interface CloveProviderProps {
  /** The CloveClient instance to provide to all children. */
  client: import("../core/client.js").CloveClient;

  /** React children. */
  children: React.ReactNode;
}
