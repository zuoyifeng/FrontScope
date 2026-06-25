import { describe, expect, it } from 'vitest';
import { buildScanReadiness } from './scanReadiness';

const baseInput = {
  scanMode: 'online' as const,
  url: '',
  enableMemory: false,
  enableAi: false,
  aiReady: false,
  aiStatusLoading: false,
  apiReachable: true,
  scanning: false,
  scanResult: null,
};

describe('buildScanReadiness', () => {
  it('reports missing prerequisites before scan', () => {
    const readiness = buildScanReadiness(baseInput);

    expect(readiness.phase).toBe('pre');
    expect(readiness.percent).toBeLessThan(100);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'url', status: 'fail' }),
        expect.objectContaining({ key: 'api', status: 'pass' }),
      ]),
    );
  });

  it('requires project path in local mode', () => {
    const readiness = buildScanReadiness({
      ...baseInput,
      scanMode: 'local',
      url: 'http://localhost:5173',
      projectPath: '',
    });

    expect(readiness.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'projectPath', status: 'fail' })]),
    );
  });

  it('reports evidence completion after scan', () => {
    const readiness = buildScanReadiness({
      ...baseInput,
      url: 'http://localhost:5173',
      scanResult: {
        id: 'scan-1',
        createdAt: '2026-06-25T00:00:00.000Z',
        scanMode: 'online',
        projectEvidenceEnabled: false,
        input: { url: 'http://localhost:5173' },
        runtime: {
          title: 'Home',
          finalUrl: 'http://localhost:5173',
          screenshotPath: 'screenshot.png',
          consoleErrors: [],
          pageErrors: [],
          requestFailures: [],
          httpErrors: [],
        },
        network: {
          summary: {
            totalRequests: 1,
            failedRequests: 0,
            totalTransferSize: 100,
            cacheHitRatio: 0,
            slowRequests: [],
            largeResources: [],
          },
          requests: [],
        },
        errors: [{ module: 'lighthouse', message: 'Chrome is unavailable' }],
      },
    });

    expect(readiness.phase).toBe('post');
    expect(readiness.percent).toBe(67);
    expect(readiness.summary).toContain('采集失败');
  });
});
