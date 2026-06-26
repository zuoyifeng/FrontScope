// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runScanSet } from './scanSet.js';

describe('runScanSet', () => {
  it('runs selected routes and preserves per-route results', async () => {
    const runOne = vi.fn(async (input) => ({
      id: `scan-${input.url}`,
      createdAt: '2026-06-25T00:00:00.000Z',
      input,
      scanMode: input.scanMode,
      projectEvidenceEnabled: input.scanMode === 'local',
      errors: [],
      runtime: {
        finalUrl: input.url,
        title: 'ok',
        screenshotPath: '',
        consoleErrors: [],
        pageErrors: [],
        requestFailures: [],
        httpErrors: [],
      },
    }));

    const result = await runScanSet(
      {
        baseUrl: 'http://localhost:5173',
        routes: ['/dashboard', '/settings'],
        scanMode: 'local',
        projectPath: '/tmp/project',
      },
      runOne,
    );

    expect(runOne).toHaveBeenCalledTimes(2);
    expect(result.routes.map((route) => route.url)).toEqual([
      'http://localhost:5173/dashboard',
      'http://localhost:5173/settings',
    ]);
  });
});
