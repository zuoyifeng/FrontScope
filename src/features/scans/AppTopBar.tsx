import { Button, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface AppTopBarProps {
  mode: 'workspace' | 'report';
  onNewScan?: () => void;
}

export function AppTopBar({ mode, onNewScan }: AppTopBarProps) {
  return (
    <header className="app-topbar">
      <div className="app-topbar-brand">
        <div className="brand-mark">FS</div>
        <div>
          <Text className="brand-name-inline">FrontScope</Text>
          <Text className="brand-tagline">证据驱动 · 前端体检</Text>
        </div>
      </div>
      {mode === 'report' && onNewScan ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={onNewScan}>
          新建扫描
        </Button>
      ) : (
        <div className="topbar-status">
          <span className="topbar-status-dot" aria-hidden />
          本地优先
        </div>
      )}
    </header>
  );
}
