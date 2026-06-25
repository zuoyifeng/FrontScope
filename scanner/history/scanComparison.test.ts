// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareScans } from './scanComparison.js';
import type { ScanResult } from '../types.js';

function createScan(id: string, values: { performance: number; failedRequests: number; longTasks: number }): ScanResult {
  return {
    id,
    createdAt: id === 'before' ? '2026-06-25T10:00:00.000Z' : '2026-06-25T10:05:00.000Z',
    scanMode: 'local',
    projectEvidenceEnabled: true,
    input: { url: 'http://localhost:5173', viewport: 'desktop' },
    runtime: {
      finalUrl: 'http://localhost:5173',
      title: 'Home',
      screenshotPath: '/tmp/screenshot.png',
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
      httpErrors: [],
    },
    lighthouse: {
      scores: { performance: values.performance, accessibility: 90, bestPractices: 90, seo: 90 },
      metrics: {},
      audits: [],
    },
    performanceTrace: {
      tracePath: '/tmp/trace.json',
      totalDurationMs: 1000,
      longTasks: Array.from({ length: values.longTasks }, (_, index) => ({
        start: index * 100,
        duration: 60,
        topLevelEvent: 'RunTask',
        stackSummary: [],
      })),
      categoryDurations: { scripting: 10, rendering: 20, painting: 30, loading: 40 },
      layoutEvents: [],
      styleEvents: [],
      paintEvents: [],
      layoutShifts: [],
    },
    network: {
      requests: [],
      summary: {
        totalRequests: 20,
        failedRequests: values.failedRequests,
        totalTransferSize: 1000,
        cacheHitRatio: 0.5,
        slowRequests: [],
        largeResources: [],
      },
    },
    errors: [],
  };
}

describe('compareScans', () => {
  it('marks higher scores and lower issue counts as improvements', () => {
    const comparison = compareScans(
      createScan('before', { performance: 70, failedRequests: 3, longTasks: 4 }),
      createScan('after', { performance: 90, failedRequests: 1, longTasks: 4 }),
    );

    expect(comparison.baseScanId).toBe('before');
    expect(comparison.targetScanId).toBe('after');
    expect(comparison.metrics.find((metric) => metric.key === 'performanceScore')).toMatchObject({
      before: 70,
      after: 90,
      delta: 20,
      direction: 'improved',
    });
    expect(comparison.metrics.find((metric) => metric.key === 'failedRequests')).toMatchObject({
      before: 3,
      after: 1,
      delta: -2,
      direction: 'improved',
    });
    expect(comparison.metrics.find((metric) => metric.key === 'longTasks')).toMatchObject({
      direction: 'unchanged',
    });
    expect(comparison.summary).toEqual({ improved: 2, regressed: 0, unchanged: 10 });
  });

  it('compares online scans without project-quality metrics', () => {
    const onlineScan = (id: string, performance: number): ScanResult => ({
      ...createScan(id, { performance, failedRequests: 0, longTasks: 0 }),
      scanMode: 'online',
      projectEvidenceEnabled: false,
      input: { url: 'https://example.com', viewport: 'desktop' },
    });

    const comparison = compareScans(onlineScan('before', 60), onlineScan('after', 80));

    expect(comparison.metrics.find((metric) => metric.key === 'performanceScore')).toMatchObject({
      direction: 'improved',
    });
    expect(comparison.metrics.find((metric) => metric.key === 'codeReviewFindings')?.direction).toBe('unknown');
  });
});
