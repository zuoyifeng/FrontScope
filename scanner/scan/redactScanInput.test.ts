// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { redactScanInput } from './redactScanInput.js';

describe('redactScanInput', () => {
  it('removes apiKey and sensitive URL values before persisting scan input', () => {
    const redacted = redactScanInput({
      url: 'http://localhost:5173/admin?token=secret',
      viewport: 'desktop',
      authStatePath: '/Users/alice/.frontscope/auth/admin.json',
      enableAi: true,
      ai: {
        baseURL: 'https://api.xiaomimimo.com/v1',
        apiKey: 'sk-secret',
        model: 'mimo-v2.5-pro',
      },
    });

    expect(redacted.ai?.apiKey).toBeUndefined();
    expect(redacted.ai?.baseURL).toBe('https://api.xiaomimimo.com/v1');
    expect(redacted.ai?.model).toBe('mimo-v2.5-pro');
    expect(redacted.url).toBe('http://localhost:5173/admin?token=<redacted>');
    expect(redacted.authStatePath).toBe('admin.json');
  });
});
