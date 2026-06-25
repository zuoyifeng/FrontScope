// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isScanPayload, readImmediateScanPayload, readProgressScanPayload } from './resolveScanPayload';
import type { ScanProgressView } from './scanProgressTypes';

const samplePayload = {
  result: { id: 'scan-1', errors: [], input: { url: 'http://localhost:5173' } },
  scanDir: '/tmp/scan',
  scanJsonPath: '/tmp/scan/scan.json',
  reportMarkdownPath: '/tmp/scan/report.md',
};

describe('resolveScanPayload', () => {
  it('detects a full scan payload', () => {
    expect(isScanPayload(samplePayload)).toBe(true);
    expect(isScanPayload({ progressId: 'x' })).toBe(false);
  });

  it('reads immediate sync responses', () => {
    expect(
      readImmediateScanPayload({
        success: true,
        data: samplePayload,
      }),
    ).toEqual(samplePayload);
    expect(
      readImmediateScanPayload({
        success: true,
        data: { progressId: 'abc' },
      }),
    ).toBeUndefined();
  });

  it('reads completed async progress payloads', () => {
    const progress: ScanProgressView = {
      progressId: 'p1',
      status: 'completed',
      percent: 100,
      steps: [],
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      result: samplePayload,
    };

    expect(readProgressScanPayload(progress)).toEqual(samplePayload);
    expect(readProgressScanPayload({ ...progress, status: 'running' })).toBeUndefined();
  });
});
