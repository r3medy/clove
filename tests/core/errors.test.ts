// ─────────────────────────────────────────────────────────────────────────────
// Tests — Error Hierarchy
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  CloveError,
  TimeoutError,
  CancelledError,
  NetworkError,
  ValidationError,
  HttpError,
  SecurityError,
} from '../../src/core/errors';

describe('CloveError', () => {
  it('should create a base error with defaults', () => {
    const error = new CloveError('test error');

    expect(error.message).toBe('test error');
    expect(error.name).toBe('CloveError');
    expect(error.code).toBe('CLOVE_ERROR');
    expect(error.config).toBeUndefined();
    expect(error.response).toBeUndefined();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CloveError);
  });

  it('should detect CloveError via static isCloveError', () => {
    const cloveErr = new CloveError('test');
    const regularErr = new Error('test');

    expect(CloveError.isCloveError(cloveErr)).toBe(true);
    expect(CloveError.isCloveError(regularErr)).toBe(false);
    expect(CloveError.isCloveError(null)).toBe(false);
    expect(CloveError.isCloveError('string')).toBe(false);
  });
});

describe('TimeoutError', () => {
  it('should include timeout value and correct code', () => {
    const error = new TimeoutError(5000);

    expect(error.message).toBe('Request timed out after 5000ms');
    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe('CLOVE_TIMEOUT');
    expect(error.timeout).toBe(5000);
    expect(error).toBeInstanceOf(CloveError);
    expect(error).toBeInstanceOf(TimeoutError);
  });
});

describe('CancelledError', () => {
  it('should have correct code and message', () => {
    const error = new CancelledError();

    expect(error.message).toBe('Request was cancelled');
    expect(error.name).toBe('CancelledError');
    expect(error.code).toBe('CLOVE_CANCELLED');
    expect(error).toBeInstanceOf(CloveError);
  });
});

describe('NetworkError', () => {
  it('should include the cause error', () => {
    const cause = new TypeError('fetch failed');
    const error = new NetworkError('Network request failed', undefined, cause);

    expect(error.message).toBe('Network request failed');
    expect(error.name).toBe('NetworkError');
    expect(error.code).toBe('CLOVE_NETWORK');
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(CloveError);
  });
});

describe('ValidationError', () => {
  it('should include the validation error detail', () => {
    const zodError = { issues: [{ message: 'Invalid field' }] };
    const error = new ValidationError('Validation failed', zodError);

    expect(error.message).toBe('Validation failed');
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('CLOVE_VALIDATION');
    expect(error.validationError).toBe(zodError);
    expect(error).toBeInstanceOf(CloveError);
  });
});

describe('HttpError', () => {
  it('should include status code and text', () => {
    const error = new HttpError(404, 'Not Found');

    expect(error.message).toBe('Request failed with status 404 Not Found');
    expect(error.name).toBe('HttpError');
    expect(error.code).toBe('CLOVE_HTTP');
    expect(error.status).toBe(404);
    expect(error.statusText).toBe('Not Found');
    expect(error).toBeInstanceOf(CloveError);
  });
});

describe('SecurityError', () => {
  it('should have correct code and message', () => {
    const error = new SecurityError('Request to private IP blocked');

    expect(error.message).toBe('Request to private IP blocked');
    expect(error.name).toBe('SecurityError');
    expect(error.code).toBe('CLOVE_SECURITY');
    expect(error).toBeInstanceOf(CloveError);
  });
});

describe('Error Hierarchy', () => {
  it('all subclasses should be instanceof CloveError', () => {
    const errors = [
      new TimeoutError(1000),
      new CancelledError(),
      new NetworkError('fail'),
      new ValidationError('fail', {}),
      new HttpError(500, 'Internal Server Error'),
      new SecurityError('blocked'),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CloveError);
      expect(CloveError.isCloveError(error)).toBe(true);
    }
  });
});
