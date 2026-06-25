// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runScan, resolveOutputDir } from './runScan.js';
import type { PageSessionDriver } from './pageSession.js';
import type { AiProvider } from '../ai/aiProvider.js';

vi.mock('../report/createScanId.js', () => {
  let counter = 0;
  return {
    createScanId: vi.fn(() => {
      counter += 1;
      return `scan-${counter}`;
    }),
  };
});

vi.mock('../scanners/lighthouseScanner.js', () => ({
  scanLighthouse: vi.fn().mockResolvedValue({
    scores: { performance: 85, accessibility: 90, bestPractices: 80, seo: 75 },
    metrics: {
      largestContentfulPaint: '2.5 s',
      cumulativeLayoutShift: '0.1',
      totalBlockingTime: '150 ms',
      speedIndex: '3.0 s',
    },
    audits: [],
  }),
}));

vi.mock('../scanners/packageScanner.js', () => ({
  scanPackage: vi.fn().mockReturnValue({
    packageManager: 'pnpm',
    scripts: { dev: 'vite' },
    dependencies: { react: '^18.3.1' },
    devDependencies: { vite: '^6.0.0' },
    frameworkHints: ['react'],
    configFiles: [],
  }),
}));

vi.mock('../projectQuality/projectQualityScanner.js', () => ({
  scanProjectQuality: vi.fn().mockResolvedValue({
    typecheck: { status: 'ok', errorCount: 0, messages: [] },
    eslint: { status: 'ok', errorCount: 0, warningCount: 0, topFiles: [] },
    audit: { status: 'ok', total: 0, vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 } },
    unused: { status: 'ok', unusedFiles: 0, unusedDependencies: 0, unusedExports: 0 },
    circular: { status: 'ok', circularCount: 0, cycles: [] },
    codeReview: { status: 'ok', scannedFiles: 0, findings: [] },
  }),
}));

const TRACE_PAYLOAD = JSON.stringify({
  traceEvents: [{ name: 'RunTask', cat: 'devtools.timeline', ph: 'X', ts: 1_000_000, dur: 62_000, args: {} }],
});

function createPageSessionDriver(options: { failTracing?: boolean } = {}): PageSessionDriver {
  return {
    async createSession() {
      const cdpHandlers: Record<string, Array<(params: unknown) => void>> = {};

      const emit = (method: string, params: unknown): void => {
        cdpHandlers[method]?.forEach((handler) => handler(params));
      };

      return {
        page: {
          on() {},
          async goto() {
            emit('Network.requestWillBeSent', {
              requestId: '1',
              timestamp: 1,
              type: 'Script',
              request: { url: 'http://localhost:5173/app.js', method: 'GET', initialPriority: 'High' },
            });
            emit('Network.responseReceived', {
              requestId: '1',
              timestamp: 1.2,
              type: 'Script',
              response: {
                url: 'http://localhost:5173/app.js',
                status: 200,
                statusText: 'OK',
                mimeType: 'application/javascript',
                encodedDataLength: 1024,
                timing: { requestTime: 1, sendStart: 1, sendEnd: 2, receiveHeadersEnd: 120 },
              },
            });
            emit('Network.loadingFinished', { requestId: '1', timestamp: 2.2, encodedDataLength: 716_800 });
          },
          async screenshot() {},
          async title() {
            return '首页';
          },
          url() {
            return 'http://localhost:5173/';
          },
        },
        cdp: {
          async send(method: string, params?: unknown) {
            if (method === 'Tracing.start' && options.failTracing) {
              throw new Error('Tracing is unavailable');
            }
            if (method === 'Tracing.end') {
              queueMicrotask(() => emit('Tracing.tracingComplete', { stream: 'trace-stream' }));
            }
            if (method === 'IO.read') {
              expect(params).toEqual({ handle: 'trace-stream' });
              return { data: TRACE_PAYLOAD, eof: true };
            }
            return {};
          },
          on(method: string, handler: (params: unknown) => void) {
            cdpHandlers[method] = [...(cdpHandlers[method] ?? []), handler];
          },
          off(method: string, handler: (params: unknown) => void) {
            cdpHandlers[method] = (cdpHandlers[method] ?? []).filter((existing) => existing !== handler);
          },
        },
        close: async () => {},
      };
    },
  };
}

function createProject(): string {
  const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-project-'));
  writeFileSync(
    join(projectPath, 'package.json'),
    JSON.stringify({
      scripts: { dev: 'vite' },
      dependencies: { react: '^18.3.1' },
      devDependencies: { vite: '^6.0.0' },
    }),
  );
  return projectPath;
}

describe('runScan', () => {
  it('collects page evidence in a single session and writes a scan report', async () => {
    const projectPath = createProject();
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));

    const { scanJsonPath, result } = await runScan(
      { projectPath, outputDir, url: 'http://localhost:5173', pageName: '首页' },
      { pageSessionDriver: createPageSessionDriver() },
    );

    expect(result.package?.frameworkHints).toContain('react');
    expect(result.runtime?.title).toBe('首页');
    expect(result.runtime?.screenshotPath.endsWith('/screenshot.png')).toBe(true);
    expect(result.lighthouse?.scores.performance).toBe(85);
    expect(result.performanceTrace?.tracePath.endsWith('/trace.json')).toBe(true);
    expect(result.performanceTrace?.longTasks[0].duration).toBe(62);
    expect(result.network?.summary.totalRequests).toBe(1);
    expect(scanJsonPath.endsWith('/scan.json')).toBe(true);

    const persisted = JSON.parse(readFileSync(scanJsonPath, 'utf8'));
    expect(persisted.input.url).toBe('http://localhost:5173');
    expect(persisted.runtime.title).toBe('首页');
    expect(persisted.network.summary.totalTransferSize).toBe(716_800);
  });

  it('persists partial evidence and module errors when lighthouse fails', async () => {
    const { scanLighthouse } = await import('../scanners/lighthouseScanner.js');
    vi.mocked(scanLighthouse).mockRejectedValueOnce(new Error('Chrome is unavailable'));

    const projectPath = createProject();
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));

    const { scanJsonPath, result, reportMarkdownPath } = await runScan(
      { projectPath, outputDir, url: 'http://localhost:5173', pageName: '首页' },
      { pageSessionDriver: createPageSessionDriver() },
    );

    expect(result.runtime?.title).toBe('首页');
    expect(result.lighthouse).toBeUndefined();
    expect(result.errors).toEqual([
      expect.objectContaining({ module: 'lighthouse', message: 'Chrome is unavailable' }),
    ]);

    const persisted = JSON.parse(readFileSync(scanJsonPath, 'utf8'));
    expect(persisted.errors[0].module).toBe('lighthouse');

    const markdown = readFileSync(reportMarkdownPath, 'utf8');
    expect(markdown).toContain('# FrontScope 体检报告');
    expect(markdown).toContain('Chrome is unavailable');
  });

  it('keeps runtime and network evidence when the trace module fails', async () => {
    const projectPath = createProject();
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));

    const { result, reportMarkdownPath } = await runScan(
      { projectPath, outputDir, url: 'http://localhost:5173' },
      { pageSessionDriver: createPageSessionDriver({ failTracing: true }) },
    );

    expect(result.runtime?.title).toBe('首页');
    expect(result.performanceTrace).toBeUndefined();
    expect(result.network?.summary.totalRequests).toBe(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ module: 'performance-trace', message: 'Tracing is unavailable' }),
    ]);
    expect(readFileSync(reportMarkdownPath, 'utf8')).toContain('Tracing is unavailable');
  });

  it('writes AI diagnosis when enabled and a provider is available', async () => {
    const projectPath = createProject();
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));

    const aiProvider: AiProvider = {
      async generateDiagnosis() {
        return JSON.stringify({
          summary: 'AI 发现 LCP 偏慢。',
          healthLevel: 'warning',
          topIssues: [
            {
              title: 'LCP 偏慢',
              severity: 'medium',
              category: 'performance',
              evidenceIds: ['lighthouse.metric.lcp'],
              possibleCause: '首屏资源加载较慢。',
              suggestion: '检查首屏 JS 和图片资源。',
              optimizationDirection: '削减首屏 JS/CSS 体积并推迟非关键脚本。',
              implementationSteps: ['定位大体积资源', '路由级 lazy import', '为 LCP 图片设置 priority'],
              verifyMethod: '重新扫描并确认 LCP 下降。',
            },
          ],
          nextActions: ['先检查首屏资源'],
        });
      },
    };

    const { scanJsonPath, reportMarkdownPath, result } = await runScan(
      { projectPath, outputDir, url: 'http://localhost:5173', pageName: '首页', enableAi: true },
      { pageSessionDriver: createPageSessionDriver(), aiProvider },
    );

    expect(result.aiDiagnosis?.summary).toBe('AI 发现 LCP 偏慢。');

    const persisted = JSON.parse(readFileSync(scanJsonPath, 'utf8'));
    expect(persisted.aiDiagnosis.topIssues[0].evidenceIds).toEqual(['lighthouse.metric.lcp']);

    const markdown = readFileSync(reportMarkdownPath, 'utf8');
    expect(markdown).toContain('## AI 诊断');
    expect(markdown).toContain('AI 发现 LCP 偏慢。');
    expect(markdown).toContain('## 项目质量诊断');
    expect(markdown).toContain('### 本地代码审查');
    expect(markdown).toContain('## Memory 内存诊断');
  });

  it('keeps the scan report when the AI provider fails', async () => {
    const projectPath = createProject();
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));

    const aiProvider: AiProvider = {
      async generateDiagnosis() {
        throw new Error('AI quota exceeded');
      },
    };

    const { result, reportMarkdownPath } = await runScan(
      { projectPath, outputDir, url: 'http://localhost:5173', enableAi: true },
      { pageSessionDriver: createPageSessionDriver(), aiProvider },
    );

    expect(result.aiDiagnosis).toBeUndefined();
    expect(result.errors).toEqual([
      expect.objectContaining({ module: 'ai', message: 'AI quota exceeded' }),
    ]);
    expect(readFileSync(reportMarkdownPath, 'utf8')).toContain('AI 诊断未生成');
  });

  it('updates local scan history and compares a rerun with the previous scan for the same page', async () => {
    const { scanLighthouse } = await import('../scanners/lighthouseScanner.js');
    vi.mocked(scanLighthouse)
      .mockResolvedValueOnce({
        scores: { performance: 70, accessibility: 90, bestPractices: 80, seo: 75 },
        metrics: {
          largestContentfulPaint: '3.1 s',
          cumulativeLayoutShift: '0.1',
          totalBlockingTime: '180 ms',
          speedIndex: '3.6 s',
        },
        audits: [],
      })
      .mockResolvedValueOnce({
        scores: { performance: 92, accessibility: 90, bestPractices: 80, seo: 75 },
        metrics: {
          largestContentfulPaint: '1.8 s',
          cumulativeLayoutShift: '0.1',
          totalBlockingTime: '80 ms',
          speedIndex: '2.2 s',
        },
        audits: [],
      });
    const projectPath = createProject();
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));

    const first = await runScan(
      { projectPath, outputDir, url: 'http://localhost:5173', pageName: '首页' },
      { pageSessionDriver: createPageSessionDriver() },
    );
    const second = await runScan(
      { projectPath, outputDir, url: 'http://localhost:5173', pageName: '首页' },
      { pageSessionDriver: createPageSessionDriver() },
    );

    expect(second.result.previousScanComparison?.baseScanId).toBe(first.result.id);
    expect(second.result.previousScanComparison?.metrics.find((metric) => metric.key === 'performanceScore')).toMatchObject({
      before: 70,
      after: 92,
      delta: 22,
      direction: 'improved',
    });

    const history = JSON.parse(readFileSync(join(outputDir, 'history.json'), 'utf8'));
    expect(history.scans.map((entry: { id: string }) => entry.id)).toEqual([second.result.id, first.result.id]);
    expect(readFileSync(second.reportMarkdownPath, 'utf8')).toContain('## 与上次扫描对比');
  });

  it('calls package and project-quality scanners in local mode', async () => {
    const { scanPackage } = await import('../scanners/packageScanner.js');
    const { scanProjectQuality } = await import('../projectQuality/projectQualityScanner.js');
    vi.mocked(scanPackage).mockClear();
    vi.mocked(scanProjectQuality).mockClear();

    const projectPath = createProject();
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));

    const { result } = await runScan(
      { scanMode: 'local', projectPath, outputDir, url: 'http://localhost:5173', pageName: '首页' },
      { pageSessionDriver: createPageSessionDriver() },
    );

    expect(scanPackage).toHaveBeenCalledWith(projectPath);
    expect(scanProjectQuality).toHaveBeenCalledWith(projectPath, expect.any(Object));
    expect(result.scanMode).toBe('local');
    expect(result.projectEvidenceEnabled).toBe(true);
    expect(result.package?.frameworkHints).toContain('react');
    expect(result.projectQuality).toBeDefined();
  });

  it('skips package and project-quality scanners in online mode', async () => {
    const { scanPackage } = await import('../scanners/packageScanner.js');
    const { scanProjectQuality } = await import('../projectQuality/projectQualityScanner.js');
    vi.mocked(scanPackage).mockClear();
    vi.mocked(scanProjectQuality).mockClear();

    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));

    const { scanJsonPath, reportMarkdownPath, result } = await runScan(
      { scanMode: 'online', outputDir, url: 'http://localhost:5173', pageName: '首页' },
      { pageSessionDriver: createPageSessionDriver() },
    );

    expect(scanPackage).not.toHaveBeenCalled();
    expect(scanProjectQuality).not.toHaveBeenCalled();
    expect(result.scanMode).toBe('online');
    expect(result.projectEvidenceEnabled).toBe(false);
    expect(result.package).toBeUndefined();
    expect(result.projectQuality).toBeUndefined();
    expect(result.runtime?.title).toBe('首页');
    expect(result.network?.summary.totalRequests).toBe(1);
    expect(result.performanceTrace?.longTasks[0].duration).toBe(62);
    expect(scanJsonPath.endsWith('/scan.json')).toBe(true);

    const markdown = readFileSync(reportMarkdownPath, 'utf8');
    expect(markdown).toContain('online mode cannot read local project files');
    expect(markdown).toContain('## 项目质量诊断');
    expect(markdown).toContain('## Network 资源诊断');

    const persisted = JSON.parse(readFileSync(scanJsonPath, 'utf8'));
    expect(persisted.scanMode).toBe('online');
    expect(persisted.projectEvidenceEnabled).toBe(false);
  });

  it('still writes history for online scans', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-report-'));

    const first = await runScan(
      { scanMode: 'online', outputDir, url: 'http://localhost:5173', pageName: '首页' },
      { pageSessionDriver: createPageSessionDriver() },
    );
    const second = await runScan(
      { scanMode: 'online', outputDir, url: 'http://localhost:5173', pageName: '首页' },
      { pageSessionDriver: createPageSessionDriver() },
    );

    const history = JSON.parse(readFileSync(join(outputDir, 'history.json'), 'utf8'));
    expect(history.scans).toHaveLength(2);
    expect(history.scans.map((entry: { id: string }) => entry.id)).toEqual(
      expect.arrayContaining([first.result.id, second.result.id]),
    );
  });
});

describe('resolveOutputDir', () => {
  it('uses explicit outputDir when provided', () => {
    expect(resolveOutputDir({ outputDir: '/custom/out' })).toBe('/custom/out');
  });

  it('defaults to projectPath/frontscope-reports when projectPath is set', () => {
    expect(resolveOutputDir({ projectPath: '/my/project' })).toBe('/my/project/frontscope-reports');
  });

  it('defaults to cwd/frontscope-reports when neither outputDir nor projectPath is set', () => {
    const cwd = process.cwd();
    expect(resolveOutputDir({})).toBe(join(cwd, 'frontscope-reports'));
  });
});
