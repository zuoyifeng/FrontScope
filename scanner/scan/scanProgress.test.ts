import { describe, expect, it } from 'vitest';
import {
  applyScanProgressUpdate,
  computeScanProgressPercent,
  createScanProgressPlan,
  patchScanProgress,
  createInitialScanProgress,
} from './scanProgress.js';

describe('scanProgress', () => {
  it('builds a plan for online scans without local project steps', () => {
    const steps = createScanProgressPlan({
      scanMode: 'online',
      enableAi: false,
      enableMemory: false,
    });

    expect(steps.map((step) => step.key)).toEqual(['page-session', 'lighthouse', 'report']);
  });

  it('includes local, memory, and ai steps when enabled', () => {
    const steps = createScanProgressPlan({
      scanMode: 'local',
      projectPath: '/tmp/project',
      enableMemory: true,
      enableAi: true,
    });

    expect(steps.map((step) => step.key)).toEqual([
      'page-session',
      'lighthouse',
      'project-package',
      'project-quality',
      'memory',
      'ai-diagnosis',
      'report',
    ]);
  });

  it('marks lighthouse as pending when auth state is used', () => {
    const steps = createScanProgressPlan({
      scanMode: 'online',
      authStatePath: '/tmp/auth.json',
      enableAi: false,
      enableMemory: false,
    });

    expect(steps.find((step) => step.key === 'lighthouse')).toMatchObject({
      status: 'pending',
      detail: '复用登录态采集 LCP/CLS/TBT 等指标',
    });
  });

  it('updates percent as steps complete', () => {
    const snapshot = createInitialScanProgress('progress-1', {
      scanMode: 'online',
      url: 'http://localhost:5173',
      viewport: 'desktop',
      enableAi: false,
      enableMemory: false,
      memoryReloadRounds: 0,
    });

    const running = patchScanProgress(snapshot, { stepKey: 'page-session', stepStatus: 'running' });
    expect(running.percent).toBeGreaterThan(0);
    expect(running.currentStepLabel).toBe('页面会话采集');

    const completed = patchScanProgress(
      patchScanProgress(running, { stepKey: 'page-session', stepStatus: 'completed' }),
      { stepKey: 'lighthouse', stepStatus: 'running' },
    );

    expect(computeScanProgressPercent(applyScanProgressUpdate(completed.steps, {
      stepKey: 'lighthouse',
      stepStatus: 'completed',
    }))).toBeGreaterThan(completed.percent);
  });
});
