import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScanResultView } from './ScanResultView';
import type { ScanResultModel } from './types';

function createResult(overrides: Partial<ScanResultModel> = {}): ScanResultModel {
  return {
    id: '2026-06-23-home',
    createdAt: '2026-06-23T10:00:00.000Z',
    scanMode: 'local',
    projectEvidenceEnabled: true,
    input: {
      url: 'http://localhost:5173',
      viewport: 'desktop',
      pageName: '首页',
      projectPath: '/project',
      authStatePath: '/tmp/admin-state.json',
      enableAi: true,
    },
    runtime: {
      title: '首页',
      finalUrl: 'http://localhost:5173/',
      screenshotPath: '/tmp/screenshot.png',
      targetUrlMatched: true,
      consoleErrors: [{ type: 'error', text: 'Boom' }],
      pageErrors: [],
      requestFailures: [],
      httpErrors: [],
    },
    lighthouse: {
      scores: { performance: 62, accessibility: 91, bestPractices: 96, seo: 82 },
      metrics: { largestContentfulPaint: '3.2 s', cumulativeLayoutShift: '0.13', totalBlockingTime: '280 ms' },
      audits: [{ id: 'unused-javascript', title: 'Reduce unused JavaScript', score: 0, displayValue: '320 KiB' }],
    },
    network: {
      summary: {
        totalRequests: 12,
        failedRequests: 1,
        totalTransferSize: 718848,
        cacheHitRatio: 0.25,
        slowRequests: [],
        largeResources: [],
      },
      requests: [],
    },
    projectQuality: {
      typecheck: { status: 'ok', errorCount: 0, messages: [] },
      eslint: { status: 'skipped', errorCount: 0, warningCount: 0, topFiles: [], skippedReason: '无配置' },
      audit: { status: 'ok', total: 0, vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 } },
      unused: { status: 'skipped', unusedFiles: 0, unusedDependencies: 0, unusedExports: 0 },
      circular: { status: 'skipped', circularCount: 0, cycles: [] },
      codeReview: {
        status: 'issues',
        scannedFiles: 5,
        findings: [{ ruleId: 'react/index-as-key', severity: 'medium', file: 'src/List.tsx', line: 12, message: '下标作 key' }],
      },
    },
    memory: {
      status: 'ok',
      baseline: {
        path: '/tmp/heap.heapsnapshot',
        fileSizeBytes: 1024,
        stats: { nodeCount: 100, edgeCount: 200, totalSizeBytes: 4096, detachedNodeCount: 0, topConstructors: [] },
      },
      notes: ['单次快照无法确诊内存泄漏。'],
    },
    aiDiagnosis: {
      summary: '页面存在 LCP 偏慢与运行时错误。',
      healthLevel: 'warning',
      topIssues: [
        {
          title: 'LCP 偏慢',
          severity: 'high',
          category: 'performance',
          evidenceIds: ['lighthouse.metric.lcp'],
          possibleCause: '首屏资源较大',
          suggestion: '压缩首屏资源',
          optimizationDirection: '减少首屏传输体积并优化 LCP 元素加载优先级。',
          implementationSteps: ['定位 LCP 资源', '压缩或替换大图', '复扫对比 LCP'],
          verifyMethod: '重新扫描确认 LCP 下降',
        },
      ],
      nextActions: ['优先处理 LCP'],
    },
    errors: [],
    aiRunMeta: {
      enabled: true,
      status: 'success',
      provider: 'openai',
      model: 'mimo-v2.5-pro',
      endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
      evidenceCount: 3,
      durationMs: 1200,
      issueCount: 1,
      rawResponsePreview: '{"summary":"页面存在 LCP 偏慢与运行时错误。"}',
    },
    previousScanComparison: {
      baseScanId: '2026-06-23-previous',
      targetScanId: '2026-06-23-home',
      baseCreatedAt: '2026-06-23T09:00:00.000Z',
      targetCreatedAt: '2026-06-23T10:00:00.000Z',
      summary: { improved: 1, regressed: 0, unchanged: 1 },
      metrics: [
        {
          key: 'performanceScore',
          label: 'Performance',
          before: 50,
          after: 62,
          delta: 12,
          direction: 'improved',
        },
      ],
    },
    ...overrides,
  };
}

describe('ScanResultView', () => {
  it('renders the health banner, score cards, and module tabs', () => {
    render(
      <ScanResultView
        result={createResult()}
        scanDir="/tmp/scan-dir"
        scanJsonPath="/tmp/scan.json"
        reportMarkdownPath="/tmp/report.md"
      />,
    );

    expect(screen.getByText(/首页/)).toBeInTheDocument();
    expect(screen.getByText(/本地模式/)).toBeInTheDocument();
    expect(screen.getByText(/已导出/)).toBeInTheDocument();
    expect(screen.getAllByText('/tmp/report.md').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: '概览' }));
    expect(screen.getByText('/tmp/admin-state.json')).toBeInTheDocument();
    expect(screen.getByText('扫描模式')).toBeInTheDocument();
    expect(screen.getByText(/AI ·/)).toBeInTheDocument();
    expect(screen.getByText(/与上次扫描对比/)).toBeInTheDocument();
    expect(screen.getByText(/2026-06-23-previous/)).toBeInTheDocument();
    expect(screen.getByText(/AI 调用信息/)).toBeInTheDocument();
    expect(screen.getAllByText('Performance').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: '项目质量' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '内存' })).toBeInTheDocument();
  });

  it('highlights when the browser lands on a login or unauthorized page', () => {
    const result = createResult();
    result.runtime = {
      ...result.runtime!,
      requestedUrl: 'http://localhost:5173/admin',
      finalUrl: 'http://localhost:5173/login',
      targetUrlMatched: false,
      targetMismatchReason: 'redirected-to-login',
    };

    render(
      <ScanResultView
        result={result}
        scanDir="/tmp/scan-dir"
        scanJsonPath="/tmp/scan.json"
        reportMarkdownPath="/tmp/report.md"
      />,
    );

    expect(screen.getByText('未命中目标页面，扫描结果可能是登录页或无权限页面')).toBeInTheDocument();
    expect(screen.getAllByText(/请求地址/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/最终地址/).length).toBeGreaterThan(0);
  });

  it('displays scan mode and skipped local evidence in online results', () => {
    render(
      <ScanResultView
        result={createResult({
          scanMode: 'online',
          projectEvidenceEnabled: false,
          projectQuality: undefined,
          input: {
            url: 'https://example.com/app',
            authStatePath: '.frontscope/auth/admin.json',
            enableAi: false,
          },
        })}
        scanDir="/tmp/scan-dir"
        scanJsonPath="/tmp/scan.json"
        reportMarkdownPath="/tmp/report.md"
      />,
    );

    expect(screen.getByText('线上模式：本地项目证据未采集')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '项目质量' }));
    expect(screen.getByText('本地项目证据已跳过')).toBeInTheDocument();
  });

  it('renders scan set summary when provided', () => {
    render(
      <ScanResultView
        result={createResult()}
        scanDir="/tmp/scan-dir"
        scanJsonPath="/tmp/scan.json"
        reportMarkdownPath="/tmp/report.md"
        scanSet={{
          summary: { routeCount: 2, failedRoutes: 1 },
          routes: [
            {
              url: 'http://localhost:5173/dashboard',
              finalUrl: 'http://localhost:5173/dashboard',
              targetMatched: true,
              runtimeErrors: 0,
              failedRequests: 0,
              performanceScore: 88,
              hasErrors: false,
            },
            {
              url: 'http://localhost:5173/settings',
              finalUrl: 'http://localhost:5173/login',
              targetMatched: false,
              runtimeErrors: 2,
              failedRequests: 1,
              performanceScore: null,
              hasErrors: true,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('多路由扫描汇总')).toBeInTheDocument();
    expect(screen.getAllByText('http://localhost:5173/dashboard').length).toBeGreaterThan(0);
    expect(screen.getByText('http://localhost:5173/settings')).toBeInTheDocument();
    expect(screen.getByText(/共扫描 2 条路由，失败 1 条/)).toBeInTheDocument();
  });
});
