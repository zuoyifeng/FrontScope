import type { ScanProgressView, ScanStartResponse } from './scanProgressTypes';
import type { ScanResponse } from './types';

export type ScanPayload = NonNullable<ScanResponse['data']>;

export function isScanPayload(value: unknown): value is ScanPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    Boolean(record.result) &&
    typeof record.scanDir === 'string' &&
    typeof record.scanJsonPath === 'string' &&
    typeof record.reportMarkdownPath === 'string'
  );
}

/** Sync API: POST /api/scan returns the full report payload directly. */
export function readImmediateScanPayload(started: ScanStartResponse): ScanPayload | undefined {
  if (!started.success || !started.data) return undefined;
  return isScanPayload(started.data) ? started.data : undefined;
}

/** Async API: poll until progress is completed and carries the report payload. */
export function readProgressScanPayload(progress: ScanProgressView): ScanPayload | undefined {
  if (progress.status !== 'completed' || !progress.result) return undefined;
  return isScanPayload(progress.result) ? progress.result : undefined;
}
