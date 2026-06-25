import type { NormalizedScanInput } from '../types.js';

export type ScanProgressStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type ScanProgressStepKey =
  | 'page-session'
  | 'lighthouse'
  | 'project-package'
  | 'project-quality'
  | 'memory'
  | 'ai-diagnosis'
  | 'report';

export interface ScanProgressStep {
  key: ScanProgressStepKey;
  label: string;
  detail?: string;
  status: ScanProgressStepStatus;
}

export type ScanProgressStatus = 'running' | 'completed' | 'failed';

export interface ScanProgressSnapshot {
  progressId: string;
  status: ScanProgressStatus;
  percent: number;
  currentStepKey?: ScanProgressStepKey;
  currentStepLabel?: string;
  steps: ScanProgressStep[];
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export interface ScanProgressUpdate {
  stepKey: ScanProgressStepKey;
  stepStatus: ScanProgressStepStatus;
  stepDetail?: string;
}

export function createScanProgressPlan(
  input: Pick<NormalizedScanInput, 'scanMode' | 'projectPath' | 'enableMemory' | 'enableAi' | 'authStatePath'>,
): ScanProgressStep[] {
  const steps: ScanProgressStep[] = [
    {
      key: 'page-session',
      label: '页面会话采集',
      detail: '运行时错误、Network、Performance Trace、截图',
      status: 'pending',
    },
    {
      key: 'lighthouse',
      label: 'Lighthouse 性能审计',
      status: input.authStatePath ? 'skipped' : 'pending',
      detail: input.authStatePath ? '登录态场景下暂跳过 Lighthouse' : undefined,
    },
  ];

  if (input.scanMode === 'local' && input.projectPath) {
    steps.push(
      { key: 'project-package', label: '项目包信息', status: 'pending' },
      { key: 'project-quality', label: '项目质量检查', detail: 'TypeScript、ESLint、依赖审计等', status: 'pending' },
    );
  }

  if (input.enableMemory) {
    steps.push({ key: 'memory', label: '内存诊断', detail: '堆快照与重载对比', status: 'pending' });
  }

  if (input.enableAi) {
    steps.push({ key: 'ai-diagnosis', label: 'AI 诊断', status: 'pending' });
  }

  steps.push({ key: 'report', label: '生成报告', detail: '写入 JSON / Markdown 与历史对比', status: 'pending' });

  return steps;
}

export function computeScanProgressPercent(steps: ScanProgressStep[]): number {
  const actionable = steps.filter((step) => step.status !== 'skipped');
  if (actionable.length === 0) return 0;

  const completed = actionable.filter((step) => step.status === 'completed').length;
  const running = actionable.some((step) => step.status === 'running') ? 0.5 : 0;
  return Math.min(100, Math.round(((completed + running) / actionable.length) * 100));
}

export function applyScanProgressUpdate(steps: ScanProgressStep[], update: ScanProgressUpdate): ScanProgressStep[] {
  return steps.map((step) => {
    if (step.key !== update.stepKey) return step;
    return {
      ...step,
      status: update.stepStatus,
      detail: update.stepDetail ?? step.detail,
    };
  });
}

export function createInitialScanProgress(progressId: string, input: NormalizedScanInput): ScanProgressSnapshot {
  const now = new Date().toISOString();
  const steps = createScanProgressPlan(input);
  return {
    progressId,
    status: 'running',
    percent: 0,
    steps,
    startedAt: now,
    updatedAt: now,
  };
}

export function patchScanProgress(
  snapshot: ScanProgressSnapshot,
  update: ScanProgressUpdate,
): ScanProgressSnapshot {
  const steps = applyScanProgressUpdate(snapshot.steps, update);
  const currentStep = steps.find((step) => step.key === update.stepKey);
  const now = new Date().toISOString();

  return {
    ...snapshot,
    steps,
    percent: computeScanProgressPercent(steps),
    currentStepKey: update.stepStatus === 'running' ? update.stepKey : snapshot.currentStepKey,
    currentStepLabel: update.stepStatus === 'running' ? currentStep?.label : snapshot.currentStepLabel,
    updatedAt: now,
  };
}
