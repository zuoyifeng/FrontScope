import { Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { ScanResultView } from './ScanResultView';
import type { ScanPayload } from './resolveScanPayload';

const { Text } = Typography;

interface ReportPageProps {
  data: ScanPayload;
  onBack: () => void;
}

export function ReportPage({ data, onBack }: ReportPageProps) {
  return (
    <div className="page-report">
      <div className="report-toolbar">
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            新建扫描
          </Button>
          <div className="report-toolbar-meta">
            <Text strong>{data.result.id}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.result.input.url}
            </Text>
          </div>
        </Space>
        <Button type="primary" onClick={() => void navigator.clipboard.writeText(data.reportMarkdownPath)}>
          复制 Markdown 路径
        </Button>
      </div>
      <ScanResultView
        result={data.result}
        scanDir={data.scanDir}
        scanJsonPath={data.scanJsonPath}
        reportMarkdownPath={data.reportMarkdownPath}
      />
    </div>
  );
}
