// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectLocalProject } from './projectIntake.js';

describe('inspectLocalProject', () => {
  it('detects package manager, dev scripts, frameworks, and routes', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-intake-'));
    writeFileSync(join(root, 'pnpm-lock.yaml'), '');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'vite --host 127.0.0.1', build: 'vite build' },
        dependencies: { next: '^15.0.0', react: '^19.0.0' },
      }),
      'utf8',
    );
    mkdirSync(join(root, 'app', 'dashboard'), { recursive: true });
    writeFileSync(join(root, 'app', 'dashboard', 'page.tsx'), 'export default function Page() {}');

    const intake = inspectLocalProject(root);

    expect(intake.packageManager).toBe('pnpm');
    expect(intake.devScripts).toEqual([{ name: 'dev', command: 'vite --host 127.0.0.1' }]);
    expect(intake.frameworkDetections.map((item) => item.framework)).toContain('next');
    expect(intake.routeCandidates).toEqual([
      expect.objectContaining({ path: '/dashboard', source: 'next-app' }),
    ]);
    expect(intake.needsUserApproval).toContain('run-script');
  });
});
