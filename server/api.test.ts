// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import app from './api.js';
import { runScan } from '../scanner/scan/runScan.js';

vi.mock('../scanner/scan/runScan.js', () => ({
  runScan: vi.fn().mockResolvedValue({
    result: {
      id: 'scan-1',
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
  }),
}));

describe('scan API', () => {
  it('passes enableAi to runScan', async () => {
    const response = await app.request('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://localhost:5173',
        viewport: 'desktop',
        authStatePath: '/tmp/admin-state.json',
        enableAi: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(runScan).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:5173',
        viewport: 'desktop',
        authStatePath: '/tmp/admin-state.json',
        enableAi: true,
      }),
      expect.anything(),
    );
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
