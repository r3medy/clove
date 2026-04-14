// Clove - Error Hierarchy

import type { ResolvedCloveConfig, CloveResponse } from "./types.js";

/**
 * Error codes used to identify error types without `instanceof` checks.
 */
export type CloveErrorCode =
  | "CLOVE_ERROR"
  | "CLOVE_TIMEOUT"
  | "CLOVE_CANCELLED"
  | "CLOVE_NETWORK"
  | "CLOVE_VALIDATION"
  | "CLOVE_HTTP"
  | "CLOVE_SECURITY";

/**
 * Base error class for all Clove errors.
 * Provides structured context about the failed request.
 */
export class CloveError extends Error {
  public readonly code: CloveErrorCode;
  public readonly config?: ResolvedCloveConfig;
  public readonly response?: CloveResponse;

  constructor(
    message: string,
    code: CloveErrorCode = "CLOVE_ERROR",
    config?: ResolvedCloveConfig,
    response?: CloveResponse,
  ) {
    super(message);
    this.name = "CloveError";
    this.code = code;
    this.config = config;
    this.response = response;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Type guard — check if an unknown error is a CloveError.
   */
  static isCloveError(error: unknown): error is CloveError {
    return error instanceof CloveError;
  }
}

/**
 * Thrown when a request exceeds the configured timeout.
 */
export class TimeoutError extends CloveError {
  public readonly timeout: number;

  constructor(timeout: number, config?: ResolvedCloveConfig) {
    super(`Request timed out after ${timeout}ms`, "CLOVE_TIMEOUT", config);
    this.name = "TimeoutError";
    this.timeout = timeout;
  }
}

/**
 * Thrown when a request is cancelled via AbortController.
 */
export class CancelledError extends CloveError {
  constructor(config?: ResolvedCloveConfig) {
    super("Request was cancelled", "CLOVE_CANCELLED", config);
    this.name = "CancelledError";
  }
}

/**
 * Thrown when a network-level error occurs (DNS failure, connection refused, etc.).
 */
export class NetworkError extends CloveError {
  public override readonly cause?: Error;

  constructor(message: string, config?: ResolvedCloveConfig, cause?: Error) {
    super(message, "CLOVE_NETWORK", config);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/**
 * Thrown when response data fails Zod (or compatible) schema validation.
 */
export class ValidationError extends CloveError {
  public readonly validationError: unknown;

  constructor(
    message: string,
    validationError: unknown,
    config?: ResolvedCloveConfig,
    response?: CloveResponse,
  ) {
    super(message, "CLOVE_VALIDATION", config, response);
    this.name = "ValidationError";
    this.validationError = validationError;
  }
}

/**
 * Thrown when the server responds with a non-2xx status code.
 */
export class HttpError extends CloveError {
  public readonly status: number;
  public readonly statusText: string;

  constructor(
    status: number,
    statusText: string,
    config?: ResolvedCloveConfig,
    response?: CloveResponse,
  ) {
    super(`Request failed with status ${status} ${statusText}`, "CLOVE_HTTP", config, response);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
  }
}

/**
 * Thrown when a request violates security constraints (SSRF, blocked domain, etc.).
 */
export class SecurityError extends CloveError {
  constructor(message: string, config?: ResolvedCloveConfig) {
    super(message, "CLOVE_SECURITY", config);
    this.name = "SecurityError";
  }
}
