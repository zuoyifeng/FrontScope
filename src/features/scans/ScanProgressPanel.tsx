import { Progress, Alert, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, MinusCircleOutlined } from '@ant-design/icons';
import type { ScanProgressView } from './scanProgressTypes';
import { SCAN_PROGRESS_STEP_STATUS_META } from './scanProgressTypes';

const { Text } = Typography;

interface ScanProgressPanelProps {
  progress: ScanProgressView;
}

function StepIcon({ status }: { status: ScanProgressView['steps'][number]['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircleOutlined style={{ color: '#16a34a' }} />;
    case 'failed':
      return <CloseCircleOutlined style={{ color: '#dc2626' }} />;
    case 'running':
      return <LoadingOutlined style={{ color: '#006eff' }} />;
    case 'skipped':
      return <MinusCircleOutlined style={{ color: '#94a3b8' }} />;
    default:
      return <span className="module-status-dot module-status-dot--pending" />;
  }
}

export function ScanProgressPanel({ progress }: ScanProgressPanelProps) {
  const currentStep = progress.steps.find((step) => step.key === progress.currentStepKey);
  const activeSteps = progress.steps.filter((step) => step.status !== 'skipped');

  return (
    <Space direction="vertical" size={16} className="full-width scan-progress-panel">
      <div>
        <div className="scan-progress-header">
          <Text strong>扫描进度</Text>
          <Text type="secondary" style={{ fontFamily: 'var(--fs-mono)' }}>
            {progress.percent}%
          </Text>
        </div>
        <Progress
          percent={progress.percent}
          status={progress.status === 'failed' ? 'exception' : progress.status === 'completed' ? 'success' : 'active'}
          showInfo={false}
          strokeColor={{ from: '#38bdf8', to: '#006eff' }}
        />
      </div>

      {progress.status === 'running' && currentStep && (
        <div className="scan-progress-current">
          <span className="scan-progress-pulse" aria-hidden />
          <div>
            <Text strong style={{ fontSize: 13 }}>
              {currentStep.label}
            </Text>
            {currentStep.detail && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {currentStep.detail}
                </Text>
              </div>
            )}
          </div>
        </div>
      )}

      {progress.status === 'failed' && progress.error && (
        <Alert type="error" showIcon message="扫描失败" description={progress.error} />
      )}

      <div className="scan-step-compact">
        <Space direction="vertical" size={6} className="full-width">
          {activeSteps.map((step) => {
            const meta = SCAN_PROGRESS_STEP_STATUS_META[step.status];
            return (
              <div
                key={step.key}
                className="readiness-check-row"
                style={{
                  opacity: step.status === 'pending' ? 0.55 : 1,
                  transition: 'opacity 0.2s ease',
                }}
              >
                <span className="readiness-check-icon">
                  <StepIcon status={step.status} />
                </span>
                <Text style={{ flex: 1, fontSize: 13 }}>{step.label}</Text>
                <Tag color={meta.color} style={{ margin: 0 }}>
                  {meta.label}
                </Tag>
              </div>
            );
          })}
        </Space>
      </div>
    </Space>
  );
}
