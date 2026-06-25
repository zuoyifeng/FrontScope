// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanPackage } from './packageScanner.js';

describe('scanPackage', () => {
  it('reads package metadata and detects framework hints', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-'));
    writeFileSync(
      join(projectPath, 'package.json'),
      JSON.stringify({
        scripts: {
          dev: 'vite',
          build: 'vite build',
        },
        dependencies: {
          react: '^18.3.1',
        },
        devDependencies: {
          vite: '^6.0.0',
          typescript: '^5.7.0',
        },
      }),
    );
    writeFileSync(join(projectPath, 'pnpm-lock.yaml'), '');
    writeFileSync(join(projectPath, 'vite.config.ts'), 'export default {};');

    const result = scanPackage(projectPath);

    expect(result.packageManager).toBe('pnpm');
    expect(result.scripts.dev).toBe('vite');
    expect(result.frameworkHints).toContain('react');
    expect(result.frameworkHints).toContain('vite');
    expect(result.configFiles).toContain('vite.config.ts');
  });

  it('returns empty metadata when package.json is missing', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-'));

    const result = scanPackage(projectPath);

    expect(result.packageManager).toBe('unknown');
    expect(result.scripts).toEqual({});
    expect(result.frameworkHints).toEqual([]);
  });
});
