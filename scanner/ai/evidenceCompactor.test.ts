// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compactEvidence } from './evidenceCompactor.js';
import type { ScanResult } from '../types.js';

function createScanResult(): ScanResult {
  return {
    id: 'scan-1',
    createdAt: '2026-06-23T00:00:00.000Z',
    scanMode: 'local',
    projectEvidenceEnabled: true,
    input: {
      url: 'http://localhost:5173',
      viewport: 'desktop',
      pageName: '首页',
      projectPath: '/project',
    },
    runtime: {
      finalUrl: 'http://localhost:5173/',
      title: '首页',
      screenshotPath: '/tmp/screenshot.png',
      consoleErrors: [
        {
          type: 'error',
          text: 'ResizeObserver loop limit exceeded',
          location: { url: 'http://localhost:5173/src/App.tsx', lineNumber: 12 },
        },
      ],
      pageErrors: [{ message: 'Cannot read properties of undefined', stack: 'TypeError: broken' }],
      requestFailures: [],
      httpErrors: [{ url: 'http://localhost:5173/api/users', status: 500, statusText: 'Internal Server Error', method: 'GET' }],
    },
    lighthouse: {
      scores: {
        performance: 62,
        accessibility: 91,
        bestPractices: 96,
        seo: 82,
      },
      metrics: {
        largestContentfulPaint: '3.2 s',
        cumulativeLayoutShift: '0.13',
        totalBlockingTime: '280 ms',
        speedIndex: '4.8 s',
      },
      audits: [
        {
          id: 'unused-javascript',
          title: 'Reduce unused JavaScript',
          score: 0,
          displayValue: 'Est savings of 320 KiB',
          description: 'Reduce unused JavaScript.',
        },
      ],
    },
    performanceTrace: {
      tracePath: '/tmp/trace.json',
      totalDurationMs: 100,
      longTasks: [
        {
          start: 1000,
          duration: 82,
          topLevelEvent: 'RunTask',
          stackSummary: ['renderDashboard @ src/App.tsx:42'],
        },
      ],
      categoryDurations: {
        scripting: 112,
        rendering: 20,
        painting: 5,
        loading: 6,
      },
      layoutEvents: [{ name: 'Layout', start: 1050, duration: 12 }],
      styleEvents: [{ name: 'RecalculateStyles', start: 1065, duration: 8 }],
      paintEvents: [{ name: 'Paint', start: 1080, duration: 5 }],
      layoutShifts: [
        {
          start: 1100,
          score: 0.12,
          impactedNodes: ['div.hero'],
        },
      ],
    },
    network: {
      requests: [
        {
          url: 'http://localhost:5173/app.js',
          method: 'GET',
          resourceType: 'script',
          status: 200,
          fromDiskCache: false,
          fromMemoryCache: false,
          fromServiceWorker: false,
          transferSize: 716800,
          timing: { totalDurationMs: 1200 },
        },
        {
          url: 'http://localhost:5173/api/users',
          method: 'GET',
          resourceType: 'fetch',
          status: 500,
          statusText: 'Internal Server Error',
          fromDiskCache: false,
          fromMemoryCache: false,
          fromServiceWorker: false,
          transferSize: 2048,
          timing: { totalDurationMs: 300 },
        },
      ],
      summary: {
        totalRequests: 2,
        failedRequests: 1,
        totalTransferSize: 718848,
        cacheHitRatio: 0,
        slowRequests: [
          {
            url: 'http://localhost:5173/app.js',
            method: 'GET',
            resourceType: 'script',
            status: 200,
            transferSize: 716800,
            durationMs: 1200,
            fromCache: false,
          },
        ],
        largeResources: [
          {
            url: 'http://localhost:5173/app.js',
            method: 'GET',
            resourceType: 'script',
            status: 200,
            transferSize: 716800,
            durationMs: 1200,
            fromCache: false,
          },
        ],
      },
    },
    package: {
      packageManager: 'pnpm',
      scripts: { dev: 'vite' },
      dependencies: { react: '^18.3.1' },
      devDependencies: { vite: '^6.0.0' },
      frameworkHints: ['react', 'vite'],
      configFiles: ['vite.config.ts'],
    },
    errors: [],
  };
}

describe('compactEvidence', () => {
  it('creates deterministic evidence ids for runtime, lighthouse, network, and package data', () => {
    const first = compactEvidence(createScanResult());
    const second = compactEvidence(createScanResult());

    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'runtime.console.0',
          category: 'runtime',
          summary: expect.stringContaining('ResizeObserver'),
        }),
        expect.objectContaining({
          id: 'runtime.pageError.0',
          category: 'runtime',
          summary: expect.stringContaining('Cannot read'),
        }),
        expect.objectContaining({
          id: 'runtime.http.0',
          category: 'runtime',
          summary: expect.stringContaining('500'),
        }),
        expect.objectContaining({
          id: 'lighthouse.metric.lcp',
          category: 'performance',
          summary: 'LCP: 3.2 s',
        }),
        expect.objectContaining({
          id: 'lighthouse.audit.unused-javascript',
          category: 'performance',
          summary: expect.stringContaining('Reduce unused JavaScript'),
        }),
        expect.objectContaining({
          id: 'trace.longTask.0',
          category: 'performance',
          summary: expect.stringContaining('82 ms'),
        }),
        expect.objectContaining({
          id: 'trace.layoutShift.0',
          category: 'performance',
          summary: expect.stringContaining('0.12'),
        }),
        expect.objectContaining({
          id: 'network.slow.0',
          category: 'network',
          summary: expect.stringContaining('app.js'),
        }),
        expect.objectContaining({
          id: 'network.large.0',
          category: 'network',
          summary: expect.stringContaining('716800 bytes'),
        }),
        expect.objectContaining({
          id: 'network.failed.0',
          category: 'network',
          summary: expect.stringContaining('500'),
        }),
        expect.objectContaining({
          id: 'package.summary',
          category: 'dependency',
          summary: expect.stringContaining('react'),
        }),
      ]),
    );
  });

  it('summarizes dependencies instead of emitting one item per dependency', () => {
    const items = compactEvidence(createScanResult());
    const dependencyItems = items.filter((item) => item.category === 'dependency');

    expect(dependencyItems).toHaveLength(1);
    expect(dependencyItems[0].id).toBe('package.summary');
    expect(dependencyItems[0].summary).toContain('dependencies 1 个');
  });

  it('caps the number of evidence items by the configured budget', () => {
    const result = createScanResult();
    result.runtime!.consoleErrors = Array.from({ length: 50 }, (_, index) => ({
      type: 'error',
      text: `error ${index}`,
    }));

    const items = compactEvidence(result, { maxItems: 10 });

    expect(items.length).toBeLessThanOrEqual(10);
  });

  it('omits package and code-quality evidence when project evidence is disabled', () => {
    const result = createScanResult();
    result.projectEvidenceEnabled = false;
    result.package = undefined;
    result.projectQuality = undefined;

    const items = compactEvidence(result);

    expect(items.some((item) => item.id === 'package.summary')).toBe(false);
    expect(items.some((item) => item.category === 'code-quality')).toBe(false);
  });

  it('includes target mismatch evidence when the browser lands on the wrong page', () => {
    const result = createScanResult();
    result.runtime = {
      ...result.runtime!,
      requestedUrl: 'http://localhost:5173/admin',
      finalUrl: 'http://localhost:5173/login',
      targetUrlMatched: false,
      targetMismatchReason: 'redirected-to-login',
    };

    const items = compactEvidence(result);
    const mismatch = items.find((item) => item.id === 'runtime.targetMismatch');

    expect(mismatch).toEqual(
      expect.objectContaining({
        id: 'runtime.targetMismatch',
        category: 'runtime',
        summary: expect.stringContaining('http://localhost:5173/admin'),
        detail: 'redirected-to-login',
      }),
    );
  });

  it('truncates over-long summaries', () => {
    const result = createScanResult();
    result.runtime!.pageErrors = [{ message: 'x'.repeat(1000) }];

    const items = compactEvidence(result, { maxSummaryChars: 50 });
    const pageError = items.find((item) => item.id === 'runtime.pageError.0');

    expect(pageError?.summary.length).toBeLessThanOrEqual(50);
  });
});
