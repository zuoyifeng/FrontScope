import { App as AntApp, Layout } from 'antd';
import { useCallback, useState } from 'react';
import { AppTopBar } from './features/scans/AppTopBar';
import { ReportPage } from './features/scans/ReportPage';
import { ScanWorkspace } from './features/scans/ScanWorkspace';
import type { ScanPayload } from './features/scans/resolveScanPayload';

const { Content } = Layout;

type AppPage = 'workspace' | 'report';

function App() {
  const [page, setPage] = useState<AppPage>('workspace');
  const [report, setReport] = useState<ScanPayload | null>(null);

  const openReport = useCallback((data: ScanPayload) => {
    setReport(data);
    setPage('report');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const backToWorkspace = useCallback(() => {
    setPage('workspace');
    setReport(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <AntApp>
      <Layout className="app-shell">
        <AppTopBar mode={page} onNewScan={page === 'report' ? backToWorkspace : undefined} />
        <Content className="app-main">
          {page === 'report' && report ? (
            <ReportPage data={report} onBack={backToWorkspace} />
          ) : (
            <ScanWorkspace onReportReady={openReport} />
          )}
        </Content>
      </Layout>
    </AntApp>
  );
}

export default App;
