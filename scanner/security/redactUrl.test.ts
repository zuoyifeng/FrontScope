// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { redactUrl } from './redactUrl.js';

describe('redactUrl', () => {
  it('redacts query values and hash fragments while preserving routing context', () => {
    expect(redactUrl('https://example.com/admin/users?token=abc&code=123&page=1#access_token=secret')).toBe(
      'https://example.com/admin/users?token=<redacted>&code=<redacted>&page=<redacted>#<redacted>',
    );
  });

  it('redacts URL credentials', () => {
    expect(redactUrl('https://alice:secret@example.com/admin/users?token=abc')).toBe(
      'https://<credentials>@example.com/admin/users?token=<redacted>',
    );
  });

  it('leaves URLs without sensitive components unchanged', () => {
    expect(redactUrl('http://localhost:5173/admin/users')).toBe('http://localhost:5173/admin/users');
    expect(redactUrl('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('handles invalid URLs defensively', () => {
    expect(redactUrl('not a url')).toBe('<invalid-url>');
  });
});
