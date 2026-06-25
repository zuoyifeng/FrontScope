import { Steps, Progress, Alert, Space, Tag, Typography } from 'antd';
import type { ScanProgressView } from './scanProgressTypes';
import { SCAN_PROGRESS_STEP_STATUS_META } from './scanProgressTypes';

const { Text } = Typography;

interface ScanProgressPanelProps {
  progress: ScanProgressView;
}

function toStepsStatus(status: ScanProgressView['steps'][number]['status']): 'wait' | 'process' | 'finish' | 'error' {
  switch (status) {
    case 'running':
      return 'process';
    case 'completed':
      return 'finish';
    case 'failed':
      return 'error';
    case 'skipped':
      return 'wait';
    default:
      return 'wait';
  }
}

export function ScanProgressPanel({ progress }: ScanProgressPanelProps) {
  const currentStep = progress.steps.find((step) => step.key === progress.currentStepKey);

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div>
        <div className="scan-progress-header">
          <Text strong>扫描进度</Text>
          <Text type="secondary">{progress.percent}%</Text>
        </div>
        <Progress
          percent={progress.percent}
          status={progress.status === 'failed' ? 'exception' : progress.status === 'completed' ? 'success' : 'active'}
          showInfo={false}
        />
      </div>

      {progress.status === 'running' && currentStep && (
        <Alert
          type="info"
          showIcon
          message="当前正在监测"
          description={
            <div>
              <div>
                <Text strong>{currentStep.label}</Text>
              </div>
              {currentStep.detail && <div style={{ marginTop: 4 }}>{currentStep.detail}</div>}
            </div>
          }
        />
      )}

      {progress.status === 'failed' && progress.error && (
        <Alert type="error" showIcon message="扫描失败" description={progress.error} />
      )}

      <Steps
        direction="vertical"
        size="small"
        current={progress.steps.findIndex((step) => step.status === 'running')}
        items={progress.steps.map((step) => {
          const meta = SCAN_PROGRESS_STEP_STATUS_META[step.status];
          return {
            title: step.label,
            description: (
              <Space direction="vertical" size={4}>
                <Tag color={meta.color}>{meta.label}</Tag>
                {step.detail && <Text type="secondary">{step.detail}</Text>}
              </Space>
            ),
            status: toStepsStatus(step.status),
          };
        })}
      />
    </Space>
  );
}
