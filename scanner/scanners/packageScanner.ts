import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageEvidence } from '../types.js';

const knownConfigFiles = [
  'vite.config.ts',
  'vite.config.js',
  'webpack.config.js',
  'webpack.config.ts',
  'nuxt.config.ts',
  'next.config.js',
  'tailwind.config.js',
  'tailwind.config.ts',
];

const knownFrameworkPackages = [
  'vue',
  'react',
  'vite',
  'webpack',
  'nuxt',
  'next',
  'svelte',
  '@angular/core',
  'tailwindcss',
];

function detectPackageManager(projectPath: string): PackageEvidence['packageManager'] {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectPath, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

export function scanPackage(projectPath: string): PackageEvidence {
  const packageJsonPath = join(projectPath, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return {
      packageManager: detectPackageManager(projectPath),
      scripts: {},
      dependencies: {},
      devDependencies: {},
      frameworkHints: [],
      configFiles: [],
    };
  }

  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const dependencies = parsed.dependencies ?? {};
  const devDependencies = parsed.devDependencies ?? {};
  const allPackages = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)]);

  return {
    packageManager: detectPackageManager(projectPath),
    scripts: parsed.scripts ?? {},
    dependencies,
    devDependencies,
    frameworkHints: knownFrameworkPackages.filter((name) => allPackages.has(name)),
    configFiles: knownConfigFiles.filter((file) => existsSync(join(projectPath, file))),
  };
}
