// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertSafeProfileName,
  listAuthProfiles,
  resolveAuthProfilePath,
  toAuthProfileDisplayMetadata,
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
});
