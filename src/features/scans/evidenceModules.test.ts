import { describe, expect, it } from 'vitest';
import { buildEvidenceModules, countEvidenceCompletion } from './evidenceModules';
import type { ScanResultModel } from './types';

const baseInput = {
  scanMode: 'online' as const,
  url: 'http://localhost:5173',
  enableMemory: false,
  enableAi: false,
  aiReady: false,
  scanning: false,
  scanResult: null,
};

describe('buildEvidenceModules', () => {
  it('marks runtime modules as pending before scan when url is ready', () => {
    const modules = buildEvidenceModules(baseInput);
    expect(modules.find((module) => module.key === 'runtime')).toMatchObject({ status: 'pending' });
    expect(modules.find((module) => module.key === 'project')).toMatchObject({
      status: 'skipped',
      statusDetail: '线上模式不采集本地项目证据',
    });
    expect(modules.find((module) => module.key === 'memory')).toBeUndefined();
    expect(modules.find((module) => module.key === 'ai')).toBeUndefined();
  });

  it('blocks project module in local mode without project path', () => {
    const modules = buildEvidenceModules({
      ...baseInput,
      scanMode: 'local',
      projectPath: '',
    });

    expect(modules.find((module) => module.key === 'project')).toMatchObject({
      status: 'blocked',
      statusDetail: '请填写项目路径',
    });
  });

  it('shows memory and ai modules when enabled', () => {
    const modules = buildEvidenceModules({
      ...baseInput,
      enableMemory: true,
      enableAi: true,
      aiReady: true,
    });

    expect(modules.find((module) => module.key === 'memory')).toMatchObject({ status: 'pending' });
    expect(modules.find((module) => module.key === 'ai')).toMatchObject({ status: 'pending' });
  });

  it('marks modules as scanning during an active scan', () => {
    const modules = buildEvidenceModules({
      ...baseInput,
      scanning: true,
    });

    expect(modules.find((module) => module.key === 'runtime')).toMatchObject({ status: 'scanning' });
  });

  it('reflects collected and failed modules after scan', () => {
    const scanResult: ScanResultModel = {
      id: 'scan-1',
      createdAt: '2026-06-25T00:00:00.000Z',
      scanMode: 'online',
      projectEvidenceEnabled: false,
      input: { url: 'http://localhost:5173', enableAi: true },
      runtime: {
        title: 'Home',
        finalUrl: 'http://localhost:5173',
        screenshotPath: 'screenshot.png',
        consoleErrors: [],
        pageErrors: [],
        requestFailures: [],
        httpErrors: [],
      },
      errors: [{ module: 'lighthouse', message: 'Chrome is unavailable' }],
      aiRunMeta: { enabled: true, status: 'failed', error: 'quota exceeded' },
    };

    const modules = buildEvidenceModules({
      ...baseInput,
      enableAi: true,
      aiReady: true,
      scanResult,
    });

    expect(modules.find((module) => module.key === 'runtime')).toMatchObject({ status: 'collected' });
    expect(modules.find((module) => module.key === 'performance')).toMatchObject({
      status: 'failed',
      statusDetail: 'Chrome is unavailable',
    });
    expect(modules.find((module) => module.key === 'ai')).toMatchObject({
      status: 'failed',
      statusDetail: 'quota exceeded',
    });
  });
});

describe('countEvidenceCompletion', () => {
  it('counts only actionable modules', () => {
    const modules = buildEvidenceModules({
      ...baseInput,
      scanMode: 'local',
      projectPath: '/tmp/project',
      enableMemory: true,
      enableAi: true,
      aiReady: true,
      scanning: true,
    });

    const summary = countEvidenceCompletion(modules);
    expect(summary.applicable).toBe(6);
    expect(summary.collected).toBe(0);
  });
});
