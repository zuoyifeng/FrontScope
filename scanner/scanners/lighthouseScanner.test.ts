// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allocateDebugPort, resolveChromePath } from './lighthouseScanner.js';

describe('allocateDebugPort', () => {
  it('returns a port in the expected debugging range', () => {
    const port = allocateDebugPort();
    expect(port).toBeGreaterThanOrEqual(9200);
    expect(port).toBeLessThan(10000);
  });
});

describe('resolveChromePath', () => {
  it('prefers an existing Playwright executable path over fallback paths', () => {
    const result = resolveChromePath({
      playwrightExecutablePath: () => '/playwright/chromium/chrome',
      fallbackPaths: ['/Users/me/Library/Caches/ms-playwright/chromium-1228/chrome'],
      exists: (path) => path === '/playwright/chromium/chrome',
    });

    expect(result).toBe('/playwright/chromium/chrome');
  });

  it('falls back to existing known Chrome paths when Playwright is unavailable', () => {
    const result = resolveChromePath({
      playwrightExecutablePath: () => undefined,
      fallbackPaths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      exists: (path) => path.includes('Google Chrome.app'),
    });

    expect(result).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  });
});
