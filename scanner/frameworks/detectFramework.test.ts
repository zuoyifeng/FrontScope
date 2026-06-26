// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFrameworks } from './detectFramework.js';

function createProject(dependencies: Record<string, string>, files: readonly string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'frontscope-framework-'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ dependencies, devDependencies: {} }),
    'utf8',
  );
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), '', 'utf8');
  }
  return root;
}

describe('detectFrameworks', () => {
  it.each([
    ['react', { react: '^19.0.0' }, ['vite.config.ts']],
    ['vue', { vue: '^3.0.0' }, ['vite.config.ts']],
    ['angular', { '@angular/core': '^18.0.0' }, ['angular.json']],
    ['next', { next: '^15.0.0', react: '^19.0.0' }, ['next.config.js']],
    ['nuxt', { nuxt: '^3.0.0', vue: '^3.0.0' }, ['nuxt.config.ts']],
    ['solid', { 'solid-js': '^1.8.0' }, ['vite.config.ts']],
  ] as const)('detects %s projects', (framework, dependencies, files) => {
    const root = createProject(dependencies, files);
    expect(detectFrameworks(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ framework, confidence: 'high' }),
      ]),
    );
  });

  it('reports javascript when no framework dependency is found', () => {
    const root = createProject({}, ['src/main.js']);
    expect(detectFrameworks(root)).toEqual([
      expect.objectContaining({ framework: 'javascript', confidence: 'low' }),
    ]);
  });
});
