import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScanProgressPanel } from './ScanProgressPanel';
import type { ScanProgressView } from './scanProgressTypes';

const runningProgress: ScanProgressView = {
  progressId: 'progress-1',
  status: 'running',
  percent: 35,
  currentStepKey: 'page-session',
  currentStepLabel: '页面会话采集',
  startedAt: '2026-06-25T00:00:00.000Z',
  updatedAt: '2026-06-25T00:00:01.000Z',
  steps: [
    {
      key: 'page-session',
      label: '页面会话采集',
      detail: '运行时错误、Network、Performance Trace、截图',
      status: 'running',
    },
    {
      key: 'lighthouse',
      label: 'Lighthouse 性能审计',
      status: 'pending',
    },
    {
      key: 'report',
      label: '生成报告',
      status: 'pending',
    },
  ],
};

describe('ScanProgressPanel', () => {
  it('shows current monitoring step and progress list', () => {
    render(<ScanProgressPanel progress={runningProgress} />);

    expect(screen.getByText('扫描进度')).toBeInTheDocument();
    expect(screen.getByText('当前正在监测')).toBeInTheDocument();
    expect(screen.getAllByText('页面会话采集').length).toBeGreaterThan(0);
    expect(screen.getByText('Lighthouse 性能审计')).toBeInTheDocument();
  });
});
