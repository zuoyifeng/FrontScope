// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import app from './api.js';
import { runScan, type RunScanResult } from '../scanner/scan/runScan.js';
import { runAiConnectionTest } from '../scanner/ai/testAiConnection.js';
import { clearScanProgressStore, getScanProgress } from './scanProgressStore.js';

vi.mock('../scanner/scan/runScan.js', () => ({
  runScan: vi.fn(),
}));

vi.mock('../scanner/ai/testAiConnection.js', () => ({
  runAiConnectionTest: vi.fn(),
}));

const mockRunScanResult: RunScanResult = {
  result: {
    id: 'scan-1',
    createdAt: '2026-06-25T00:00:00.000Z',
    scanMode: 'online',
    projectEvidenceEnabled: false,
    input: {
      scanMode: 'online',
      url: 'http://localhost:5173',
      viewport: 'desktop',
    },
    errors: [],
    aiDiagnosis: {
      summary: 'AI summary',
      healthLevel: 'warning',
      topIssues: [],
      nextActions: [],
    },
  },
  scanDir: '/tmp/scan-dir',
  scanJsonPath: '/tmp/scan.json',
  reportMarkdownPath: '/tmp/report.md',
};

describe('scan API', () => {
  beforeEach(() => {
    clearScanProgressStore();
    vi.mocked(runScan).mockReset();
    vi.mocked(runScan).mockImplementation(async (_body, deps) => {
      deps?.onProgress?.({ stepKey: 'page-session', stepStatus: 'running' });
      deps?.onProgress?.({ stepKey: 'page-session', stepStatus: 'completed' });
      return mockRunScanResult;
    });
  });

  it('starts async scan and exposes progress polling', async () => {
    const startResponse = await app.request('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://localhost:5173',
        enableAi: true,
      }),
    });

    expect(startResponse.status).toBe(200);
    const started = await startResponse.json();
    expect(started.success).toBe(true);
    expect(started.data.progressId).toBeTruthy();
    expect(runScan).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:5173',
        enableAi: true,
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    const progressResponse = await app.request(`/api/scan/progress/${started.data.progressId}`);
    expect(progressResponse.status).toBe(200);
    const progress = await progressResponse.json();
    expect(progress.success).toBe(true);
    expect(progress.data.status).toBe('completed');
    expect(progress.data.result.scanJsonPath).toBe('/tmp/scan.json');
    expect(getScanProgress(started.data.progressId)?.result).toBeDefined();
  });

  it('rejects scans without a valid bearer token when apiToken is configured', async () => {
    vi.resetModules();
    process.env.FRONTSCOPE_API_TOKEN = 'secret-token';

    try {
      const { default: securedApp } = await import('./api.js');

      const unauthorized = await securedApp.request('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://localhost:5173' }),
      });
      expect(unauthorized.status).toBe(401);

      const unauthorizedProgress = await securedApp.request('/api/scan/progress/missing');
      expect(unauthorizedProgress.status).toBe(401);

      const unauthorizedAiTest = await securedApp.request('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(unauthorizedAiTest.status).toBe(401);

      const authorized = await securedApp.request('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: JSON.stringify({ url: 'http://localhost:5173' }),
      });
      expect(authorized.status).toBe(200);
    } finally {
      delete process.env.FRONTSCOPE_API_TOKEN;
      vi.resetModules();
    }
  });
});

describe('AI test API', () => {
  it('returns connectivity test result', async () => {
    vi.mocked(runAiConnectionTest).mockResolvedValue({
      success: true,
      provider: 'openai',
      model: 'mimo-v2.5-pro',
      baseURL: 'https://api.example.com/v1',
      endpoint: 'https://api.example.com/v1/chat/completions',
      authHeader: 'api-key',
      apiKeyConfigured: true,
      durationMs: 321,
      responsePreview: '{"ok":true}',
    });

    const response = await app.request('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: '/tmp/project' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      durationMs: 321,
      responsePreview: '{"ok":true}',
    });
    expect(runAiConnectionTest).toHaveBeenCalledWith({ projectPath: '/tmp/project' });
  });
});

describe('local project inspect API', () => {
  it('returns package manager and dev scripts for a temp project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-api-intake-'));
    writeFileSync(join(root, 'pnpm-lock.yaml'), '');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'vite --host 127.0.0.1' },
        dependencies: { react: '^19.0.0' },
      }),
      'utf8',
    );

    const response = await app.request('/api/local-projects/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: root }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.packageManager).toBe('pnpm');
    expect(json.data.devScripts).toEqual([{ name: 'dev', command: 'vite --host 127.0.0.1' }]);
  });
});
