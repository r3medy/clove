// ─────────────────────────────────────────────────────────────────────────────
// Tests — URL Utilities
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { buildURL, serializeParams, extractHostname, extractProtocol } from '../../src/utils/url';

describe('buildURL', () => {
  it('should combine baseURL and path', () => {
    expect(buildURL('https://api.example.com', '/users')).toBe('https://api.example.com/users');
  });

  it('should handle baseURL with trailing slash', () => {
    expect(buildURL('https://api.example.com/', '/users')).toBe('https://api.example.com/users');
  });

  it('should handle path without leading slash', () => {
    expect(buildURL('https://api.example.com', 'users')).toBe('https://api.example.com/users');
  });

  it('should use absolute path directly, ignoring baseURL', () => {
    expect(buildURL('https://api.example.com', 'https://other.com/data')).toBe(
      'https://other.com/data',
    );
  });

  it('should append query params', () => {
    const result = buildURL('https://api.example.com', '/users', { page: 1, limit: 20 });
    expect(result).toBe('https://api.example.com/users?limit=20&page=1');
  });

  it('should append params to URL that already has a query string', () => {
    const result = buildURL('https://api.example.com', '/users?active=true', { page: 1 });
    expect(result).toBe('https://api.example.com/users?active=true&page=1');
  });

  it('should drop null and undefined params', () => {
    const result = buildURL('https://api.example.com', '/users', {
      page: 1,
      name: undefined,
      tag: null,
    });
    expect(result).toBe('https://api.example.com/users?page=1');
  });

  it('should handle empty params object', () => {
    expect(buildURL('https://api.example.com', '/users', {})).toBe(
      'https://api.example.com/users',
    );
  });

  it('should handle empty baseURL', () => {
    expect(buildURL('', '/users')).toBe('/users');
  });
});

describe('serializeParams', () => {
  it('should serialize params in sorted order', () => {
    expect(serializeParams({ b: '2', a: '1', c: '3' })).toBe('a=1&b=2&c=3');
  });

  it('should convert non-string values to strings', () => {
    expect(serializeParams({ num: 42, bool: true })).toBe('bool=true&num=42');
  });

  it('should drop undefined and null values', () => {
    expect(serializeParams({ a: '1', b: undefined, c: null })).toBe('a=1');
  });

  it('should return empty string for empty object', () => {
    expect(serializeParams({})).toBe('');
  });

  it('should encode special characters', () => {
    const result = serializeParams({ q: 'hello world', tag: 'a&b' });
    expect(result).toBe('q=hello+world&tag=a%26b');
  });
});

describe('extractHostname', () => {
  it('should extract hostname from a valid URL', () => {
    expect(extractHostname('https://api.example.com/path')).toBe('api.example.com');
  });

  it('should return null for an invalid URL', () => {
    expect(extractHostname('not-a-url')).toBe(null);
  });

  it('should handle URLs with ports', () => {
    expect(extractHostname('http://localhost:3000/api')).toBe('localhost');
  });
});

describe('extractProtocol', () => {
  it('should extract protocol from a valid URL', () => {
    expect(extractProtocol('https://example.com')).toBe('https:');
    expect(extractProtocol('http://example.com')).toBe('http:');
  });

  it('should return null for an invalid URL', () => {
    expect(extractProtocol('not-a-url')).toBe(null);
  });
});
