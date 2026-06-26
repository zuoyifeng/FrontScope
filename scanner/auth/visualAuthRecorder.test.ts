// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { startVisualAuthRecording } from './visualAuthRecorder.js';

describe('startVisualAuthRecording', () => {
  it('opens the login URL in a headed recording session', async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const saveStorageState = vi.fn().mockResolvedValue(undefined);

    const session = await startVisualAuthRecording(
      {
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
      },
      {
        async open() {
          return {
            page: {
              goto,
              url: () => 'https://example.com/login',
              title: async () => 'Login',
            },
            saveStorageState,
            close,
          };
        },
      },
    );

    expect(goto).toHaveBeenCalledWith('https://example.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(session.profileName).toBe('admin');
    await session.cancel();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('verifies the target URL before saving storage state', async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const saveStorageState = vi.fn().mockResolvedValue(undefined);
    let currentUrl = 'https://example.com/login';

    const session = await startVisualAuthRecording(
      {
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
      },
      {
        async open() {
          return {
            page: {
              goto: async (url, options) => {
                currentUrl = url;
                await goto(url, options);
              },
              url: () => currentUrl,
              title: async () => 'Admin',
            },
            saveStorageState,
            close,
          };
        },
      },
    );

    const result = await session.complete('/tmp/admin.json');

    expect(result.status).toBe('valid');
    expect(saveStorageState).toHaveBeenCalledWith('/tmp/admin.json');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not save storage state when target navigation lands on login', async () => {
    const saveStorageState = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);

    const session = await startVisualAuthRecording(
      {
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
      },
      {
        async open() {
          return {
            page: {
              goto: async () => undefined,
              url: () => 'https://example.com/login',
              title: async () => 'Login',
            },
            saveStorageState,
            close,
          };
        },
      },
    );

    const result = await session.complete('/tmp/admin.json');

    expect(result.status).toBe('login-redirect');
    expect(saveStorageState).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('still verifies URL when target navigation times out but page loaded', async () => {
    const saveStorageState = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);

    const session = await startVisualAuthRecording(
      {
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
      },
      {
        async open() {
          return {
            page: {
              goto: async (url: string) => {
                if (url.includes('/admin')) {
                  throw new Error('page.goto: Timeout 60000ms exceeded.');
                }
              },
              url: () => 'https://example.com/admin',
              title: async () => 'Admin',
            },
            saveStorageState,
            close,
          };
        },
      },
    );

    const result = await session.complete('/tmp/admin.json');

    expect(result.status).toBe('valid');
    expect(saveStorageState).toHaveBeenCalledWith('/tmp/admin.json');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns error instead of throwing when navigation fails on blank page', async () => {
    const close = vi.fn().mockResolvedValue(undefined);

    const session = await startVisualAuthRecording(
      {
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
      },
      {
        async open() {
          return {
            page: {
              goto: async (url: string) => {
                if (url.includes('/admin')) {
                  throw new Error('page.goto: Timeout 60000ms exceeded.');
                }
              },
              url: () => 'about:blank',
              title: async () => '',
            },
            saveStorageState: vi.fn(),
            close,
          };
        },
      },
    );

    const result = await session.complete('/tmp/admin.json');

    expect(result.status).toBe('error');
    expect(result.message).toContain('无法打开目标页面');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
