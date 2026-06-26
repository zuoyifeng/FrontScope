// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAuthProfiles, resolveAuthProfilePath } from '../scanner/auth/authProfile.js';
import { saveAuthState } from '../scanner/auth/saveAuthState.js';
import { verifyAuthProfile } from '../scanner/auth/verifyAuthProfile.js';
import { startVisualAuthRecording } from '../scanner/auth/visualAuthRecorder.js';

vi.mock('../scanner/auth/saveAuthState.js', () => ({
  saveAuthState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../scanner/auth/verifyAuthProfile.js', () => ({
  verifyAuthProfile: vi.fn().mockResolvedValue({
    status: 'valid',
    finalUrl: 'https://example.com/admin',
    title: 'Admin',
  }),
}));

vi.mock('../scanner/auth/visualAuthRecorder.js', () => ({
  startVisualAuthRecording: vi.fn().mockResolvedValue({
    id: 'recording-1',
    profileName: 'admin',
    loginUrl: 'https://example.com/login',
    targetUrl: 'https://example.com/admin',
    startedAt: '2026-06-26T00:00:00.000Z',
    complete: vi.fn().mockResolvedValue({
      status: 'valid',
      finalUrl: 'https://example.com/admin',
      title: 'Admin',
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('auth profile API', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unmock('playwright');
    vi.doUnmock('../scanner/auth/authProfile.js');
    vi.resetModules();
  });

  async function importApiWithAuthProfileBaseDir(baseDir: string, metadataWrites: unknown[] = []) {
    vi.doMock('../scanner/auth/authProfile.js', async () => {
      const actual = await vi.importActual<typeof import('../scanner/auth/authProfile.js')>(
        '../scanner/auth/authProfile.js',
      );
      return {
        ...actual,
        listAuthProfiles: () => actual.listAuthProfiles(baseDir),
        resolveAuthProfilePath: (profileName: string) => actual.resolveAuthProfilePath(profileName, baseDir),
        writeAuthProfileMetadata: (metadata: unknown) => {
          metadataWrites.push(metadata);
          return actual.writeAuthProfileMetadata(
            metadata as Parameters<typeof actual.writeAuthProfileMetadata>[0],
            baseDir,
          );
        },
      };
    });

    vi.resetModules();
    return import('./api.js');
  }

  it('lists existing JSON auth profiles', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-api-'));
    const authDir = join(baseDir, '.frontscope', 'auth');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'admin.json'), '{"cookies":[],"origins":[]}', 'utf8');
    writeFileSync(
      join(authDir, 'admin.meta.json'),
      JSON.stringify({
        profileName: 'admin',
        authStatePath: '.frontscope/auth/admin.json',
        loginUrl: 'https://example.com/login',
        targetOrigin: 'https://example.com',
        createdAt: '2026-06-25T00:00:00.000Z',
        verification: { status: 'unknown' },
      }),
      'utf8',
    );
    writeFileSync(join(authDir, 'ops-team.json'), '{"cookies":[],"origins":[]}', 'utf8');

    const { default: app } = await importApiWithAuthProfileBaseDir(baseDir);

    const response = await app.request('/api/auth-profiles');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profiles: [
        {
          profileName: 'admin',
          authStatePath: '.frontscope/auth/admin.json',
          metadata: {
            profileName: 'admin',
            authStatePath: '.frontscope/auth/admin.json',
            loginUrl: 'https://example.com/login',
            targetOrigin: 'https://example.com',
            createdAt: '2026-06-25T00:00:00.000Z',
            verification: { status: 'unknown' },
          },
        },
        {
          profileName: 'ops-team',
          authStatePath: '.frontscope/auth/ops-team.json',
        },
      ],
    });

  });

  it('writes initial metadata after creating an auth profile', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-api-'));
    const metadataWrites: unknown[] = [];

    const { default: app } = await importApiWithAuthProfileBaseDir(baseDir, metadataWrites);
    const response = await app.request('/api/auth-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
      }),
    });

    expect(response.status).toBe(200);
    expect(metadataWrites).toHaveLength(1);
    expect(metadataWrites[0]).toMatchObject({
      profileName: 'admin',
      authStatePath: '.frontscope/auth/admin.json',
      loginUrl: 'https://example.com/login',
      targetOrigin: 'https://example.com',
      verification: { status: 'unknown' },
    });
    expect(metadataWrites[0]).toHaveProperty('createdAt');
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
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-api-'));
    const { default: app } = await importApiWithAuthProfileBaseDir(baseDir);
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
      outputPath: resolveAuthProfilePath(profileName, baseDir),
    });
  });

  it('does not launch Chromium during auth profile creation', async () => {
    const chromiumLaunch = vi.fn();
    vi.doMock('playwright', () => ({
      chromium: {
        launch: chromiumLaunch,
      },
    }));

    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-api-'));
    const { default: app } = await importApiWithAuthProfileBaseDir(baseDir);

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

  it('verifies an auth profile and updates metadata', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-api-'));
    const authDir = join(baseDir, '.frontscope', 'auth');
    const metadataWrites: unknown[] = [];
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'admin.json'), '{"cookies":[],"origins":[]}', 'utf8');
    writeFileSync(
      join(authDir, 'admin.meta.json'),
      JSON.stringify({
        profileName: 'admin',
        authStatePath: '.frontscope/auth/admin.json',
        loginUrl: 'https://example.com/login',
        targetOrigin: 'https://example.com',
        createdAt: '2026-06-25T00:00:00.000Z',
        verification: { status: 'unknown' },
      }),
      'utf8',
    );

    vi.mocked(verifyAuthProfile).mockResolvedValueOnce({
      status: 'valid',
      finalUrl: 'https://example.com/admin',
      title: 'Admin',
    });

    const { default: app } = await importApiWithAuthProfileBaseDir(baseDir, metadataWrites);
    const response = await app.request('/api/auth-profiles/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl: 'https://example.com/admin' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      profileName: 'admin',
      verification: {
        status: 'valid',
        finalUrl: 'https://example.com/admin',
      },
    });
    expect(verifyAuthProfile).toHaveBeenCalledWith({
      authStatePath: resolveAuthProfilePath('admin', baseDir),
      targetUrl: 'https://example.com/admin',
    });
    expect(metadataWrites[0]).toMatchObject({
      profileName: 'admin',
      verification: {
        status: 'valid',
        finalUrl: 'https://example.com/admin',
      },
    });
    expect(metadataWrites[0]).toHaveProperty('lastVerifiedAt');
  });

  it('rejects auth profile routes without a valid bearer token when apiToken is configured', async () => {
    vi.resetModules();
    process.env.FRONTSCOPE_API_TOKEN = 'secret-token';

    try {
      const { default: securedApp } = await import('./api.js');

      const unauthorizedList = await securedApp.request('/api/auth-profiles');
      expect(unauthorizedList.status).toBe(401);

      const unauthorizedCreate = await securedApp.request('/api/auth-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileName: 'admin',
          loginUrl: 'https://example.com/login',
        }),
      });
      expect(unauthorizedCreate.status).toBe(401);

      const authorizedList = await securedApp.request('/api/auth-profiles', {
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(authorizedList.status).toBe(200);
    } finally {
      delete process.env.FRONTSCOPE_API_TOKEN;
      vi.resetModules();
    }
  });

  it('starts a visual auth recording session', async () => {
    const { default: app } = await import('./api.js');

    const response = await app.request('/api/auth-profiles/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        recordingId: 'recording-1',
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
        message: '浏览器已打开，请在浏览器中完成登录，然后回到 FrontScope 点击验证并保存。',
      },
    });
    expect(startVisualAuthRecording).toHaveBeenCalledWith({
      profileName: 'admin',
      loginUrl: 'https://example.com/login',
      targetUrl: 'https://example.com/admin',
    });
  });

  it('completes a visual recording and writes verified metadata', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-api-'));
    const metadataWrites: unknown[] = [];
    const { default: app } = await importApiWithAuthProfileBaseDir(baseDir, metadataWrites);

    await app.request('/api/auth-profiles/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
      }),
    });

    const response = await app.request('/api/auth-profiles/recordings/recording-1/complete', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        profileName: 'admin',
        authStatePath: '.frontscope/auth/admin.json',
        loginUrl: 'https://example.com/login',
        targetOrigin: 'https://example.com',
        verification: {
          status: 'valid',
          finalUrl: 'https://example.com/admin',
        },
      },
    });
    expect(metadataWrites[0]).toMatchObject({
      profileName: 'admin',
      verification: {
        status: 'valid',
        finalUrl: 'https://example.com/admin',
      },
    });
  });

  it('cancels an active visual recording session', async () => {
    const { default: app } = await import('./api.js');

    await app.request('/api/auth-profiles/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileName: 'admin',
        loginUrl: 'https://example.com/login',
        targetUrl: 'https://example.com/admin',
      }),
    });

    const response = await app.request('/api/auth-profiles/recordings/recording-1/cancel', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
