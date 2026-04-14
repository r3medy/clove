// ─────────────────────────────────────────────────────────────────────────────
// Tests — IP & Domain Validation Utilities
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { isPrivateHost, matchesDomain } from '../../src/utils/ip';

describe('isPrivateHost', () => {
  describe('IPv4 Private Ranges', () => {
    it('should detect 127.0.0.0/8 (loopback)', () => {
      expect(isPrivateHost('127.0.0.1')).toBe(true);
      expect(isPrivateHost('127.255.255.255')).toBe(true);
    });

    it('should detect 10.0.0.0/8 (private Class A)', () => {
      expect(isPrivateHost('10.0.0.1')).toBe(true);
      expect(isPrivateHost('10.255.255.255')).toBe(true);
    });

    it('should detect 172.16.0.0/12 (private Class B)', () => {
      expect(isPrivateHost('172.16.0.1')).toBe(true);
      expect(isPrivateHost('172.31.255.255')).toBe(true);
      // Just outside the range
      expect(isPrivateHost('172.15.0.1')).toBe(false);
      expect(isPrivateHost('172.32.0.1')).toBe(false);
    });

    it('should detect 192.168.0.0/16 (private Class C)', () => {
      expect(isPrivateHost('192.168.0.1')).toBe(true);
      expect(isPrivateHost('192.168.255.255')).toBe(true);
    });

    it('should detect 169.254.0.0/16 (link-local)', () => {
      expect(isPrivateHost('169.254.0.1')).toBe(true);
    });

    it('should detect 0.0.0.0/8', () => {
      expect(isPrivateHost('0.0.0.0')).toBe(true);
    });

    it('should NOT flag public IPs', () => {
      expect(isPrivateHost('93.184.216.34')).toBe(false);
      expect(isPrivateHost('8.8.8.8')).toBe(false);
      expect(isPrivateHost('1.1.1.1')).toBe(false);
    });
  });

  describe('IPv6', () => {
    it('should detect ::1 (loopback)', () => {
      expect(isPrivateHost('::1')).toBe(true);
      expect(isPrivateHost('[::1]')).toBe(true);
    });

    it('should detect fc00::/7 (unique local)', () => {
      expect(isPrivateHost('fc00::1')).toBe(true);
      expect(isPrivateHost('fd12:3456::1')).toBe(true);
    });

    it('should detect fe80::/10 (link-local)', () => {
      expect(isPrivateHost('fe80::1')).toBe(true);
    });
  });

  describe('Hostnames', () => {
    it('should detect localhost', () => {
      expect(isPrivateHost('localhost')).toBe(true);
      expect(isPrivateHost('LOCALHOST')).toBe(true);
    });

    it('should NOT flag regular hostnames', () => {
      expect(isPrivateHost('api.example.com')).toBe(false);
      expect(isPrivateHost('google.com')).toBe(false);
    });
  });
});

describe('matchesDomain', () => {
  it('should match exact domains', () => {
    expect(matchesDomain('api.example.com', ['api.example.com'])).toBe(true);
    expect(matchesDomain('other.com', ['api.example.com'])).toBe(false);
  });

  it('should match wildcard domains', () => {
    expect(matchesDomain('sub.example.com', ['*.example.com'])).toBe(true);
    expect(matchesDomain('deep.sub.example.com', ['*.example.com'])).toBe(true);
  });

  it('should match wildcard with the base domain itself', () => {
    expect(matchesDomain('example.com', ['*.example.com'])).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(matchesDomain('API.Example.COM', ['api.example.com'])).toBe(true);
    expect(matchesDomain('sub.Example.Com', ['*.example.com'])).toBe(true);
  });

  it('should NOT match different domains with similar names', () => {
    expect(matchesDomain('notexample.com', ['*.example.com'])).toBe(false);
    expect(matchesDomain('fakeexample.com', ['example.com'])).toBe(false);
  });

  it('should handle an empty patterns array', () => {
    expect(matchesDomain('anything.com', [])).toBe(false);
  });
});
