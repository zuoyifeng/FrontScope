import type { RunScanResult } from '../scanner/scan/runScan.js';
import type { NormalizedScanInput } from '../scanner/types.js';
import {
  createInitialScanProgress,
  patchScanProgress,
  type ScanProgressSnapshot,
  type ScanProgressUpdate,
} from '../scanner/scan/scanProgress.js';

interface StoredScanProgress extends ScanProgressSnapshot {
  result?: RunScanResult;
}

const progressStore = new Map<string, StoredScanProgress>();

export function initScanProgress(progressId: string, input: NormalizedScanInput): ScanProgressSnapshot {
  const snapshot = createInitialScanProgress(progressId, input);
  progressStore.set(progressId, snapshot);
  return snapshot;
}

export function getScanProgress(progressId: string): StoredScanProgress | undefined {
  return progressStore.get(progressId);
}

export function updateScanProgress(progressId: string, update: ScanProgressUpdate): ScanProgressSnapshot | undefined {
  const current = progressStore.get(progressId);
  if (!current) return undefined;

  const next = patchScanProgress(current, update);
  progressStore.set(progressId, next);
  return next;
}

export function completeScanProgress(progressId: string, result: RunScanResult): StoredScanProgress | undefined {
  const current = progressStore.get(progressId);
  if (!current) return undefined;

  const completedSteps = current.steps.map((step) =>
    step.status === 'skipped' ? step : { ...step, status: 'completed' as const },
  );
  const next: StoredScanProgress = {
    ...current,
    status: 'completed',
    percent: 100,
    steps: completedSteps,
    currentStepKey: undefined,
    currentStepLabel: undefined,
    updatedAt: new Date().toISOString(),
    result,
  };
  progressStore.set(progressId, next);
  return next;
}

export function failScanProgress(progressId: string, error: string): StoredScanProgress | undefined {
  const current = progressStore.get(progressId);
  if (!current) return undefined;

  const next: StoredScanProgress = {
    ...current,
    status: 'failed',
    error,
    updatedAt: new Date().toISOString(),
  };
  progressStore.set(progressId, next);
  return next;
}

export function clearScanProgressStore(): void {
  progressStore.clear();
}
