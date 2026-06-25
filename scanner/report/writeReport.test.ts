// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeReport } from './writeReport.js';
import type { ScanResult } from '../types.js';

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
});
