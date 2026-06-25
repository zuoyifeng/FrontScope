import type { ScanResponse } from './types';

export type ScanProgressStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ScanProgressStepView {
  key: string;
  label: string;
  detail?: string;
  status: ScanProgressStepStatus;
}

export interface ScanProgressView {
  progressId: string;
  status: 'running' | 'completed' | 'failed';
  percent: number;
  currentStepKey?: string;
  currentStepLabel?: string;
  steps: ScanProgressStepView[];
  startedAt: string;
  updatedAt: string;
  error?: string;
  result?: ScanResponse['data'];
}

export interface ScanStartResponse {
  success: boolean;
  data?: {
    progressId: string;
  };
  error?: string;
}

export interface ScanProgressApiResponse {
  success: boolean;
  data?: ScanProgressView;
  error?: string;
}

export const SCAN_PROGRESS_STEP_STATUS_META: Record<
  ScanProgressStepStatus,
  { label: string; color: 'default' | 'processing' | 'success' | 'error' }
> = {
  pending: { label: '等待中', color: 'default' },
  running: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  skipped: { label: '已跳过', color: 'default' },
};
