import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const AUTH_PROFILES_RELATIVE_DIR = '.frontscope/auth';

export interface AuthProfileDisplayMetadata {
  profileName: string;
  authStatePath: string;
}

const SAFE_PROFILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function assertSafeProfileName(profileName: string): void {
  if (!profileName || !SAFE_PROFILE_NAME_PATTERN.test(profileName)) {
    throw new Error(
      'auth profile name may only contain letters, numbers, dot, dash, and underscore',
    );
  }
}

export function resolveAuthProfilesDir(baseDir = process.cwd()): string {
  return join(baseDir, '.frontscope', 'auth');
}

export function resolveAuthProfilePath(profileName: string, baseDir = process.cwd()): string {
  assertSafeProfileName(profileName);
  return join(resolveAuthProfilesDir(baseDir), `${profileName}.json`);
}

export function toAuthProfileDisplayMetadata(profileName: string): AuthProfileDisplayMetadata {
  assertSafeProfileName(profileName);
  return {
    profileName,
    authStatePath: `${AUTH_PROFILES_RELATIVE_DIR}/${profileName}.json`,
  };
}

export function ensureAuthProfilesDirectory(baseDir = process.cwd()): void {
  mkdirSync(resolveAuthProfilesDir(baseDir), { recursive: true });
}

export function listAuthProfiles(baseDir = process.cwd()): AuthProfileDisplayMetadata[] {
  const authDir = resolveAuthProfilesDir(baseDir);
  if (!existsSync(authDir)) {
    return [];
  }

  return readdirSync(authDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => fileName.slice(0, -'.json'.length))
    .filter((profileName) => SAFE_PROFILE_NAME_PATTERN.test(profileName))
    .map((profileName) => toAuthProfileDisplayMetadata(profileName))
    .sort((left, right) => left.profileName.localeCompare(right.profileName));
}

function getBaseDirForAuthProfilePath(outputPath: string): string | null {
  const normalized = outputPath.replace(/\\/g, '/');
  const marker = '/.frontscope/auth/';
  const index = normalized.lastIndexOf(marker);
  if (index === -1) {
    return null;
  }
  return outputPath.slice(0, index);
}

export function ensureAuthProfileParentDirectory(outputPath: string): void {
  const baseDir = getBaseDirForAuthProfilePath(outputPath);
  if (baseDir !== null) {
    ensureAuthProfilesDirectory(baseDir);
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
}
