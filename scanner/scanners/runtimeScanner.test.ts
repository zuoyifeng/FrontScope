// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluateTargetUrlMatch } from './runtimeScanner.js';

describe('evaluateTargetUrlMatch', () => {
  it('matches when origin and path are the same', () => {
    const evidence = evaluateTargetUrlMatch('http://localhost:5173/admin', 'http://localhost:5173/admin');

    expect(evidence.matched).toBe(true);
    expect(evidence.mismatchReason).toBeUndefined();
  });

  it('matches hash routes when the route key is the same', () => {
    const evidence = evaluateTargetUrlMatch(
      'http://localhost:5173/#/admin/users',
      'http://localhost:5173/#/admin/users',
    );

    expect(evidence.matched).toBe(true);
  });

  it('reports redirected-to-login when the final URL is a login page', () => {
    const evidence = evaluateTargetUrlMatch(
      'http://localhost:5173/admin/users',
      'http://localhost:5173/login',
    );

    expect(evidence.matched).toBe(false);
    expect(evidence.mismatchReason).toBe('redirected-to-login');
  });

  it('reports redirected-to-login for hash login routes', () => {
    const evidence = evaluateTargetUrlMatch(
      'http://localhost:5173/#/admin/users',
      'http://localhost:5173/#/login',
    );

    expect(evidence.matched).toBe(false);
    expect(evidence.mismatchReason).toBe('redirected-to-login');
  });

  it('reports different-origin when origins differ', () => {
    const evidence = evaluateTargetUrlMatch(
      'https://example.com/admin',
      'https://other.example.com/admin',
    );

    expect(evidence.matched).toBe(false);
    expect(evidence.mismatchReason).toBe('different-origin');
  });

  it('reports different-path for same-origin non-login path changes', () => {
    const evidence = evaluateTargetUrlMatch(
      'http://localhost:5173/admin/users',
      'http://localhost:5173/dashboard',
    );

    expect(evidence.matched).toBe(false);
    expect(evidence.mismatchReason).toBe('different-path');
  });

  it('returns unknown for invalid URLs', () => {
    const evidence = evaluateTargetUrlMatch('not-a-url', 'http://localhost:5173/');

    expect(evidence.matched).toBe(false);
    expect(evidence.mismatchReason).toBe('unknown');
  });
});
