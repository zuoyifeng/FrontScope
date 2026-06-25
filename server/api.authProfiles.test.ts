// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAuthProfiles, resolveAuthProfilePath } from '../scanner/auth/authProfile.js';
import { saveAuthState } from '../scanner/auth/saveAuthState.js';

vi.mock('../scanner/auth/saveAuthState.js', () => ({
  saveAuthState: vi.fn().mockResolvedValue(undefined),
}));

describe('auth profile API', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unmock('playwright');
  });

  it('lists existing JSON auth profiles', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-api-'));
    const authDir = join(baseDir, '.frontscope', 'auth');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'admin.json'), '{"cookies":[],"origins":[]}', 'utf8');
    writeFileSync(join(authDir, 'ops-team.json'), '{"cookies":[],"origins":[]}', 'utf8');

    vi.doMock('../scanner/auth/authProfile.js', async () => {
      const actual = await vi.importActual<typeof import('../scanner/auth/authProfile.js')>(
        '../scanner/auth/authProfile.js',
      );
      return {
        ...actual,
        listAuthProfiles: () => actual.listAuthProfiles(baseDir),
      };
    });

    vi.resetModules();
    const { default: app } = await import('./api.js');

    const response = await app.request('/api/auth-profiles');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profiles: [
        {
          profileName: 'admin',
          authStatePath: '.frontscope/auth/admin.json',
        },
        {
          profileName: 'ops-team',
          authStatePath: '.frontscope/auth/ops-team.json',
        },
      ],
    });

    vi.doUnmock('../scanner/auth/authProfile.js');
    vi.resetModules();
  });

  it('rejects invalid profile names with structured errors', async () => {
    const { default: app } = await import('./api.js');

    const response = await app.request('/api/auth-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileName: '../secret',
        loginUrl: 'https://example.com/login',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'auth profile name may only contain letters, numbers, dot, dash, and underscore',
      field: 'profileName',
    });
    expect(saveAuthState).not.toHaveBeenCalled();
  });

  it('rejects invalid URLs with structured errors', async () => {
    const { default: app } = await import('./api.js');

    const response = await app.request('/api/auth-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileName: 'admin',
        loginUrl: 'not-a-url',
        targetUrl: 'ftp://example.com/admin',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'URL 必须以 http:// 或 https:// 开头',
      field: 'loginUrl',
    });
    expect(saveAuthState).not.toHaveBeenCalled();
  });

  it('calls saveAuthState with the resolved profile path for valid requests', async () => {
    const { default: app } = await import('./api.js');
    const profileName = 'internal-admin';
    const loginUrl = 'https://example.com/login';
    const targetUrl = 'https://example.com/admin/dashboard';

    const response = await app.request('/api/auth-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileName,
        loginUrl,
        targetUrl,
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profileName,
      authStatePath: '.frontscope/auth/internal-admin.json',
      flow: 'interactive-playwright',
      message:
        'A non-headless browser opens for manual login; complete SSO, MFA, or captcha in the Playwright inspector before storage state is saved.',
    });
    expect(saveAuthState).toHaveBeenCalledWith({
      loginUrl,
      targetUrl,
      outputPath: resolveAuthProfilePath(profileName),
    });
  });

  it('does not launch Chromium during auth profile creation', async () => {
    const chromiumLaunch = vi.fn();
    vi.doMock('playwright', () => ({
      chromium: {
        launch: chromiumLaunch,
      },
    }));

    const { default: app } = await import('./api.js');

    const response = await app.request('/api/auth-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
      }),
    });

    expect(response.status).toBe(200);
    expect(saveAuthState).toHaveBeenCalledTimes(1);
    expect(chromiumLaunch).not.toHaveBeenCalled();
  });
});
