// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertSafeProfileName,
  listAuthProfiles,
  readAuthProfileMetadata,
  resolveAuthProfileMetadataPath,
  resolveAuthProfilePath,
  toAuthProfileDisplayMetadata,
  writeAuthProfileMetadata,
} from './authProfile.js';

describe('authProfile', () => {
  it('resolves valid profile names under .frontscope/auth', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-profile-'));

    expect(resolveAuthProfilePath('admin', baseDir)).toBe(
      join(baseDir, '.frontscope', 'auth', 'admin.json'),
    );
    expect(resolveAuthProfilePath('internal-admin.v2', baseDir)).toBe(
      join(baseDir, '.frontscope', 'auth', 'internal-admin.v2.json'),
    );
  });

  it('rejects path traversal profile names', () => {
    expect(() => assertSafeProfileName('../secret')).toThrow(
      'auth profile name may only contain letters, numbers, dot, dash, and underscore',
    );
    expect(() => resolveAuthProfilePath('../secret')).toThrow(
      'auth profile name may only contain letters, numbers, dot, dash, and underscore',
    );
  });

  it('rejects empty profile names', () => {
    expect(() => assertSafeProfileName('')).toThrow(
      'auth profile name may only contain letters, numbers, dot, dash, and underscore',
    );
    expect(() => resolveAuthProfilePath('')).toThrow(
      'auth profile name may only contain letters, numbers, dot, dash, and underscore',
    );
  });

  it('returns display metadata without unrelated absolute paths', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-profile-'));
    const authDir = join(baseDir, '.frontscope', 'auth');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'admin.json'), '{"cookies":[],"origins":[]}', 'utf8');

    const profiles = listAuthProfiles(baseDir);

    expect(profiles).toEqual([
      {
        profileName: 'admin',
        authStatePath: '.frontscope/auth/admin.json',
      },
    ]);
    expect(JSON.stringify(profiles)).not.toContain(baseDir);
    expect(toAuthProfileDisplayMetadata('admin')).toEqual({
      profileName: 'admin',
      authStatePath: '.frontscope/auth/admin.json',
    });
  });

  it('stores auth profile metadata next to storage state without leaking absolute paths', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-profile-'));

    writeAuthProfileMetadata(
      {
        profileName: 'admin',
        authStatePath: '.frontscope/auth/admin.json',
        loginUrl: 'https://example.com/login',
        targetOrigin: 'https://example.com',
        createdAt: '2026-06-25T00:00:00.000Z',
        lastVerifiedAt: '2026-06-25T00:01:00.000Z',
        notes: 'SSO admin account',
        verification: {
          status: 'valid',
          finalUrl: 'https://example.com/admin',
        },
      },
      baseDir,
    );

    expect(resolveAuthProfileMetadataPath('admin', baseDir)).toBe(
      join(baseDir, '.frontscope', 'auth', 'admin.meta.json'),
    );
    const metadata = readAuthProfileMetadata('admin', baseDir);

    expect(metadata).toEqual({
      profileName: 'admin',
      authStatePath: '.frontscope/auth/admin.json',
      loginUrl: 'https://example.com/login',
      targetOrigin: 'https://example.com',
      createdAt: '2026-06-25T00:00:00.000Z',
      lastVerifiedAt: '2026-06-25T00:01:00.000Z',
      notes: 'SSO admin account',
      verification: {
        status: 'valid',
        finalUrl: 'https://example.com/admin',
      },
    });
    expect(JSON.stringify(metadata)).not.toContain(baseDir);
  });

  it('lists auth profiles with optional metadata and ignores metadata JSON files as profiles', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-profile-'));
    const authDir = join(baseDir, '.frontscope', 'auth');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'admin.json'), '{"cookies":[],"origins":[]}', 'utf8');
    writeAuthProfileMetadata(
      {
        profileName: 'admin',
        authStatePath: '.frontscope/auth/admin.json',
        loginUrl: 'https://example.com/login',
        targetOrigin: 'https://example.com',
        createdAt: '2026-06-25T00:00:00.000Z',
        verification: { status: 'unknown' },
      },
      baseDir,
    );

    const profiles = listAuthProfiles(baseDir);

    expect(profiles).toEqual([
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
    ]);
    expect(profiles.map((profile) => profile.profileName)).not.toContain('admin.meta');
    expect(JSON.stringify(profiles)).not.toContain(baseDir);
  });

  it('normalizes stored metadata identity and auth state path for display', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'frontscope-auth-profile-'));
    const authDir = join(baseDir, '.frontscope', 'auth');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(
      join(authDir, 'admin.meta.json'),
      JSON.stringify({
        profileName: 'wrong-name',
        authStatePath: join(baseDir, '.frontscope', 'auth', 'admin.json'),
        loginUrl: 'https://example.com/login',
        targetOrigin: 'https://example.com',
        createdAt: '2026-06-25T00:00:00.000Z',
        verification: { status: 'unknown' },
      }),
      'utf8',
    );

    const metadata = readAuthProfileMetadata('admin', baseDir);

    expect(metadata?.profileName).toBe('admin');
    expect(metadata?.authStatePath).toBe('.frontscope/auth/admin.json');
    expect(JSON.stringify(metadata)).not.toContain(baseDir);
  });
});
