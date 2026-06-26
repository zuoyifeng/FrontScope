// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectRouteDiscoveryEvidence } from './frameworkRoutes.js';

describe('collectRouteDiscoveryEvidence', () => {
  it('returns route candidates for local projects', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-route-evidence-'));
    mkdirSync(join(root, 'app', 'dashboard'), { recursive: true });
    writeFileSync(join(root, 'app', 'dashboard', 'page.tsx'), 'export default function Page() {}');

    const evidence = collectRouteDiscoveryEvidence(root);

    expect(evidence.status).toBe('ok');
    expect(evidence.candidates).toEqual([
      expect.objectContaining({ path: '/dashboard', source: 'next-app' }),
    ]);
  });

  it('reports skipped when no routes are found', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-route-empty-'));
    const evidence = collectRouteDiscoveryEvidence(root);
    expect(evidence.status).toBe('skipped');
    expect(evidence.skippedReason).toContain('未发现');
  });
});
