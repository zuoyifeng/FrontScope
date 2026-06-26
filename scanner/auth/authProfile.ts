import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const AUTH_PROFILES_RELATIVE_DIR = '.frontscope/auth';

export interface AuthProfileDisplayMetadata {
  profileName: string;
  authStatePath: string;
  metadata?: AuthProfileMetadata;
}

export type AuthProfileVerificationStatus =
  | 'unknown'
  | 'valid'
  | 'login-redirect'
  | 'unauthorized'
  | 'error';

export interface AuthProfileMetadata {
  profileName: string;
  authStatePath: string;
  loginUrl: string;
  targetOrigin: string;
  createdAt: string;
  lastVerifiedAt?: string;
  notes?: string;
  verification: {
    status: AuthProfileVerificationStatus;
    finalUrl?: string;
    message?: string;
  };
}

const SAFE_PROFILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

function toRelativeAuthStatePath(profileName: string): string {
  return `${AUTH_PROFILES_RELATIVE_DIR}/${profileName}.json`;
}

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

export function resolveAuthProfileMetadataPath(profileName: string, baseDir = process.cwd()): string {
  assertSafeProfileName(profileName);
  return join(resolveAuthProfilesDir(baseDir), `${profileName}.meta.json`);
}

export function readAuthProfileMetadata(
  profileName: string,
  baseDir = process.cwd(),
): AuthProfileMetadata | undefined {
  const metadataPath = resolveAuthProfileMetadataPath(profileName, baseDir);
  if (!existsSync(metadataPath)) {
    return undefined;
  }

  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as AuthProfileMetadata;
  return {
    ...metadata,
    profileName,
    authStatePath: toRelativeAuthStatePath(profileName),
  };
}

export function writeAuthProfileMetadata(
  metadata: AuthProfileMetadata,
  baseDir = process.cwd(),
): void {
  assertSafeProfileName(metadata.profileName);
  ensureAuthProfilesDirectory(baseDir);
  const normalizedMetadata: AuthProfileMetadata = {
    ...metadata,
    authStatePath: toRelativeAuthStatePath(metadata.profileName),
  };
  writeFileSync(
    resolveAuthProfileMetadataPath(metadata.profileName, baseDir),
    `${JSON.stringify(normalizedMetadata, null, 2)}\n`,
    'utf8',
  );
}

export function toAuthProfileDisplayMetadata(
  profileName: string,
  baseDir = process.cwd(),
): AuthProfileDisplayMetadata {
  assertSafeProfileName(profileName);
  const metadata = readAuthProfileMetadata(profileName, baseDir);
  return {
    profileName,
    authStatePath: toRelativeAuthStatePath(profileName),
    ...(metadata ? { metadata } : {}),
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
    .filter((fileName) => fileName.endsWith('.json') && !fileName.endsWith('.meta.json'))
    .map((fileName) => fileName.slice(0, -'.json'.length))
    .filter((profileName) => SAFE_PROFILE_NAME_PATTERN.test(profileName))
    .map((profileName) => toAuthProfileDisplayMetadata(profileName, baseDir))
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
