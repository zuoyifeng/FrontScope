import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectFrameworks } from '../frameworks/detectFramework.js';
import type { FrameworkDetection } from '../frameworks/types.js';
import { discoverStaticRoutes } from '../routes/discoverRoutes.js';
import type { RouteCandidate } from '../routes/types.js';

export interface LocalProjectIntake {
  projectPath: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
  scripts: Record<string, string>;
  devScripts: Array<{ name: string; command: string }>;
  frameworkDetections: FrameworkDetection[];
  routeCandidates: RouteCandidate[];
  needsUserApproval: Array<'install' | 'run-script' | 'env-file' | 'external-origin'>;
}

function readPackage(projectPath: string): { scripts?: Record<string, string> } {
  try {
    return JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function detectPackageManager(projectPath: string): LocalProjectIntake['packageManager'] {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'package-lock.json'))) return 'npm';
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectPath, 'bun.lockb'))) return 'bun';
  return 'unknown';
}

export function inspectLocalProject(projectPath: string): LocalProjectIntake {
  const pkg = readPackage(projectPath);
  const scripts = pkg.scripts ?? {};
  const devScripts = ['dev', 'start', 'serve', 'preview']
    .filter((name) => scripts[name])
    .map((name) => ({ name, command: scripts[name] }));

  return {
    projectPath,
    packageManager: detectPackageManager(projectPath),
    scripts,
    devScripts,
    frameworkDetections: detectFrameworks(projectPath),
    routeCandidates: discoverStaticRoutes(projectPath),
    needsUserApproval: devScripts.length > 0 ? ['run-script'] : [],
  };
}
