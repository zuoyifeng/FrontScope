// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeReport, createScanSetMarkdownSection } from './writeReport.js';
import type { ScanResult } from '../types.js';
import type { ScanSetResult } from '../scan/scanSet.js';

function createScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    id: 'scan-target-match',
    createdAt: '2026-06-25T10:00:00.000Z',
    scanMode: 'online',
    projectEvidenceEnabled: false,
    input: {
      url: 'http://localhost:5173/admin/users',
      viewport: 'desktop',
      authStatePath: 'admin-state.json',
    },
    runtime: {
      requestedUrl: 'http://localhost:5173/admin/users',
      finalUrl: 'http://localhost:5173/login',
      title: '登录',
      screenshotPath: '/tmp/screenshot.png',
      targetUrlMatched: false,
      targetMismatchReason: 'redirected-to-login',
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
      httpErrors: [],
    },
    errors: [],
    ...overrides,
  };
}

describe('writeReport', () => {
  it('renders a warning block with requested and final URLs when the target is not matched', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));
    const result = createScanResult();

    const paths = writeReport(result, outputDir);
    const markdown = readFileSync(paths.reportMarkdownPath, 'utf8');

    expect(markdown).toContain('## ⚠️ 目标页面未命中');
    expect(markdown).toContain('请求地址: http://localhost:5173/admin/users');
    expect(markdown).toContain('最终地址: http://localhost:5173/login');
    expect(markdown).toContain('原因代码: redirected-to-login');
    expect(markdown).toContain('目标命中: 否');
    expect(markdown).toContain('登录态配置: admin-state.json');
  });

  it('omits the target mismatch warning when the target URL matched', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-match-'));
    const result = createScanResult({
      runtime: {
        requestedUrl: 'http://localhost:5173/admin/users',
        finalUrl: 'http://localhost:5173/admin/users',
        title: '用户管理',
        screenshotPath: '/tmp/screenshot.png',
        targetUrlMatched: true,
        consoleErrors: [],
        pageErrors: [],
        requestFailures: [],
        httpErrors: [],
      },
    });

    const paths = writeReport(result, outputDir);
    const markdown = readFileSync(paths.reportMarkdownPath, 'utf8');

    expect(markdown).not.toContain('## ⚠️ 目标页面未命中');
    expect(markdown).toContain('目标命中: 是');
  });

  it('renders route discovery candidates when present', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-routes-'));
    const result = createScanResult({
      scanMode: 'local',
      projectEvidenceEnabled: true,
      routeDiscovery: {
        status: 'ok',
        candidates: [
          {
            path: '/dashboard',
            source: 'next-app',
            confidence: 'high',
            file: 'app/dashboard/page.tsx',
            reason: 'Next.js App Router page file',
          },
        ],
      },
    });

    const paths = writeReport(result, outputDir);
    const markdown = readFileSync(paths.reportMarkdownPath, 'utf8');

    expect(markdown).toContain('## Route Discovery');
    expect(markdown).toContain('- Status: ok');
    expect(markdown).toContain('/dashboard (next-app, app/dashboard/page.tsx)');
  });

  it('renders scan set summary table', () => {
    const scanSet: ScanSetResult = {
      routes: [
        {
          url: 'http://localhost:5173/dashboard',
          result: createScanResult({
            runtime: {
              requestedUrl: 'http://localhost:5173/dashboard',
              finalUrl: 'http://localhost:5173/dashboard',
              title: 'Dashboard',
              screenshotPath: '/tmp/screenshot.png',
              targetUrlMatched: true,
              consoleErrors: [{ type: 'error', text: 'boom' }],
              pageErrors: [],
              requestFailures: [],
              httpErrors: [{ url: 'http://localhost:5173/api', status: 500, statusText: 'Error', method: 'GET' }],
            },
            lighthouse: {
              scores: { performance: 88, accessibility: 90, bestPractices: 90, seo: 90 },
              metrics: {},
              audits: [],
            },
          }),
        },
      ],
      summary: { routeCount: 1, failedRoutes: 0 },
    };

    const markdown = createScanSetMarkdownSection(scanSet);
    expect(markdown).toContain('## Scan Set Summary');
    expect(markdown).toContain('http://localhost:5173/dashboard');
    expect(markdown).toContain('| 1 | 1 | 88 |');
  });
});
