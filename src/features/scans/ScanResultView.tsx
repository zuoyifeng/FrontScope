import type { CSSProperties } from 'react';
import { Alert, Card, Col, Descriptions, Empty, Row, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { FolderOpenOutlined, RobotOutlined } from '@ant-design/icons';
import type {
  AiIssueView,
  AiRunMetaView,
  HealthLevel,
  IssueSeverity,
  NetworkSummaryItemView,
  QualityStatus,
  ScanMetricComparisonView,
  ScanResultModel,
  ScanSetView,
  TargetUrlMismatchReason,
} from './types';

const { Text, Paragraph, Title } = Typography;

interface ScanResultViewProps {
  result: ScanResultModel;
  scanDir: string;
  scanJsonPath: string;
  reportMarkdownPath: string;
  scanSet?: ScanSetView;
}

type LongTaskView = NonNullable<ScanResultModel['performanceTrace']>['longTasks'][number];
type CodeReviewFindingView = NonNullable<ScanResultModel['projectQuality']>['codeReview']['findings'][number];
type MemoryConstructorView = NonNullable<NonNullable<ScanResultModel['memory']>['baseline']>['stats']['topConstructors'][number];

const aiIssueRowKey = (record: AiIssueView) => `${record.category}-${record.severity}-${record.title}-${record.evidenceIds.join('|')}`;
const longTaskRowKey = (record: LongTaskView) => `${record.topLevelEvent}-${record.start}-${record.duration}`;
const networkItemRowKey = (record: NetworkSummaryItemView) =>
  `${record.method}-${record.status ?? 'n/a'}-${record.resourceType}-${record.url}`;
const codeReviewRowKey = (record: CodeReviewFindingView) => `${record.ruleId}-${record.file}-${record.line}-${record.message}`;
const memoryConstructorRowKey = (record: MemoryConstructorView) => `${record.name}-${record.count}-${record.selfSizeBytes}`;
const comparisonMetricRowKey = (record: ScanMetricComparisonView) => record.key;

function ReportPathsBar({ scanDir, scanJsonPath, reportMarkdownPath }: Pick<ScanResultViewProps, 'scanDir' | 'scanJsonPath' | 'reportMarkdownPath'>) {
  return (
    <div className="scan-report-paths">
      <span className="path-chip">
        <span className="path-chip-label">目录</span>
        <Text copyable={{ text: scanDir }} style={{ color: 'inherit', fontSize: 'inherit' }}>
          {scanDir}
        </Text>
      </span>
      <span className="path-chip">
        <span className="path-chip-label">Markdown</span>
        <Text copyable={{ text: reportMarkdownPath }} style={{ color: 'inherit', fontSize: 'inherit' }}>
          {reportMarkdownPath}
        </Text>
      </span>
      <span className="path-chip">
        <span className="path-chip-label">JSON</span>
        <Text copyable={{ text: scanJsonPath }} style={{ color: 'inherit', fontSize: 'inherit' }}>
          {scanJsonPath}
        </Text>
      </span>
    </div>
  );
}

function formatBytes(value: number | undefined): string {
  if (typeof value !== 'number') return 'n/a';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
  return `${value} B`;
}

function formatComparisonNumber(metric: ScanMetricComparisonView, value: number | undefined): string {
  if (typeof value !== 'number') return 'n/a';
  if (metric.unit === 'bytes') return formatBytes(value);
  if (metric.unit === 'ratio') return `${Math.round(value * 100)}%`;
  return `${value}`;
}

function formatComparisonDelta(metric: ScanMetricComparisonView): string {
  if (typeof metric.delta !== 'number') return 'n/a';
  const sign = metric.delta > 0 ? '+' : '';
  if (metric.unit === 'bytes') return `${sign}${formatBytes(metric.delta)}`;
  if (metric.unit === 'ratio') return `${sign}${Math.round(metric.delta * 100)}%`;
  return `${sign}${metric.delta}`;
}

function scoreColor(score: number | null): string {
  if (score === null) return '#94a3b8';
  if (score >= 90) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

const SEVERITY_COLOR: Record<IssueSeverity, string> = {
  high: 'red',
  medium: 'orange',
  low: 'blue',
};

const HEALTH_META: Record<HealthLevel, { color: 'success' | 'warning' | 'error'; label: string }> = {
  good: { color: 'success', label: '健康' },
  warning: { color: 'warning', label: '需关注' },
  critical: { color: 'error', label: '严重' },
};

function StatusTag({ status }: { status: QualityStatus }) {
  const meta: Record<QualityStatus, { color: string; label: string }> = {
    ok: { color: 'green', label: '通过' },
    issues: { color: 'red', label: '发现问题' },
    skipped: { color: 'default', label: '跳过' },
    error: { color: 'volcano', label: '异常' },
  };
  return <Tag color={meta[status].color}>{meta[status].label}</Tag>;
}

function SeverityTag({ severity }: { severity: IssueSeverity }) {
  const label = severity === 'high' ? '高' : severity === 'medium' ? '中' : '低';
  return <Tag color={SEVERITY_COLOR[severity]}>{label}</Tag>;
}

function ComparisonDirectionTag({ direction }: { direction: ScanMetricComparisonView['direction'] }) {
  const meta: Record<ScanMetricComparisonView['direction'], { color: string; label: string }> = {
    improved: { color: 'green', label: '改善' },
    regressed: { color: 'red', label: '回退' },
    unchanged: { color: 'default', label: '不变' },
    unknown: { color: 'default', label: '无法比较' },
  };
  return <Tag color={meta[direction].color}>{meta[direction].label}</Tag>;
}

const TARGET_MISMATCH_LABELS: Record<TargetUrlMismatchReason, string> = {
  'redirected-to-login': '页面被重定向到登录/认证页，可能缺少登录态或权限不足',
  'different-origin': '最终页面与目标 URL 不同源',
  'different-path': '最终页面路径与目标 URL 不一致',
  unknown: '最终页面与目标 URL 不一致',
};

function formatTargetMismatchDescription(result: ScanResultModel): string {
  const runtime = result.runtime;
  const requestedUrl = runtime?.requestedUrl ?? result.input.url;
  const finalUrl = runtime?.finalUrl ?? '未采集';
  const reason = runtime?.targetMismatchReason;
  const reasonLabel = reason ? TARGET_MISMATCH_LABELS[reason] : '请提供登录态文件后重新扫描。';
  return `请求地址：${requestedUrl}\n最终地址：${finalUrl}\n${reasonLabel}`;
}

function ReportHero({
  result,
  scanDir,
  scanJsonPath,
  reportMarkdownPath,
}: Pick<ScanResultViewProps, 'result' | 'scanDir' | 'scanJsonPath' | 'reportMarkdownPath'>) {
  const ai = result.aiDiagnosis;
  const aiMeta = result.aiRunMeta;
  const aiError = result.errors.find((error) => error.module === 'ai');
  const targetMismatch = result.runtime?.targetUrlMatched === false;
  const scanModeLabel = result.scanMode === 'local' ? '本地模式' : '线上模式';
  const errorCount = result.errors.length;
  const perf = result.lighthouse?.scores.performance ?? null;

  let pillClass = 'health-pill health-pill--info';
  let pillLabel = '扫描完成';
  let summary = `性能分数 ${perf ?? 'n/a'}。可在概览页查看各模块证据与指标对比。`;

  if (targetMismatch) {
    pillClass = 'health-pill health-pill--critical';
    pillLabel = '目标未命中';
    summary = formatTargetMismatchDescription(result);
  } else if (ai) {
    const meta = HEALTH_META[ai.healthLevel];
    pillClass = `health-pill health-pill--${ai.healthLevel === 'good' ? 'good' : ai.healthLevel === 'warning' ? 'warning' : 'critical'}`;
    pillLabel = `AI · ${meta.label}`;
    summary = ai.summary;
  } else if (result.input.enableAi) {
    pillClass = 'health-pill health-pill--critical';
    pillLabel = 'AI 诊断失败';
    summary =
      aiMeta?.error ??
      aiError?.message ??
      '请检查 frontscope.config.json 与 API Key，并在「AI 诊断」页签查看调用详情。';
  } else if (errorCount > 0) {
    pillClass = 'health-pill health-pill--warning';
    pillLabel = `${errorCount} 个模块异常`;
    summary = `未开启 AI 诊断。${errorCount} 个采集模块出现异常，请查看概览中的模块状态。`;
  }

  return (
    <header className="scan-report-hero">
      <div className="scan-report-hero-top">
        <div>
          <span className={pillClass}>{pillLabel}</span>
          <Title level={2} className="scan-report-hero-title">
            {result.input.pageName ?? result.runtime?.title ?? '页面体检'}
          </Title>
          <Text className="scan-report-hero-sub">
            {scanModeLabel} · {result.id} · {result.input.url}
          </Text>
        </div>
        <Tag color="cyan" style={{ margin: 0, border: 'none' }}>
          <FolderOpenOutlined /> 已导出
        </Tag>
      </div>
      <Paragraph className="scan-report-summary">{summary}</Paragraph>
      <ReportPathsBar scanDir={scanDir} scanJsonPath={scanJsonPath} reportMarkdownPath={reportMarkdownPath} />
    </header>
  );
}

function AiCallMetaCard({ meta }: { meta: AiRunMetaView }) {
  return (
    <Card size="small" title="AI 调用信息" className="panel" style={{ marginBottom: 16 }}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="状态">
          <Tag color={meta.status === 'success' ? 'green' : meta.status === 'failed' ? 'red' : 'default'}>
            {meta.status === 'success' ? '成功' : meta.status === 'failed' ? '失败' : '未知'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Provider">{meta.provider ?? 'n/a'}</Descriptions.Item>
        <Descriptions.Item label="Model">{meta.model ?? 'n/a'}</Descriptions.Item>
        <Descriptions.Item label="Endpoint">{meta.endpoint ?? 'n/a'}</Descriptions.Item>
        <Descriptions.Item label="鉴权头">{meta.authHeader ?? 'n/a'}</Descriptions.Item>
        <Descriptions.Item label="API Key 已配置">{meta.apiKeyConfigured ? '是' : '否'}</Descriptions.Item>
        <Descriptions.Item label="证据条数">{meta.evidenceCount ?? 0}</Descriptions.Item>
        <Descriptions.Item label="耗时">{meta.durationMs != null ? `${meta.durationMs} ms` : 'n/a'}</Descriptions.Item>
        {meta.issueCount != null && <Descriptions.Item label="问题数">{meta.issueCount}</Descriptions.Item>}
      </Descriptions>
      {meta.error && (
        <Alert type="error" showIcon message="调用失败原因" description={meta.error} style={{ marginTop: 12 }} />
      )}
      {meta.rawResponsePreview && (
        <Card size="small" title="模型原始返回（预览）" style={{ marginTop: 12 }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>
            {meta.rawResponsePreview}
          </pre>
        </Card>
      )}
    </Card>
  );
}

function LighthouseScoreRow({ result }: { result: ScanResultModel }) {
  const scores = result.lighthouse?.scores;
  if (!scores) return null;

  const items = [
    { label: 'Performance', value: scores.performance },
    { label: 'Accessibility', value: scores.accessibility },
    { label: 'Best Practices', value: scores.bestPractices },
    { label: 'SEO', value: scores.seo },
  ];

  return (
    <div className="lighthouse-scores">
      {items.map((item) => {
        const value = item.value ?? 0;
        const color = scoreColor(item.value);
        return (
          <div key={item.label} className="lighthouse-score-card">
            <div
              className="lighthouse-score-ring"
              style={{ '--score': value, '--ring-color': color } as CSSProperties}
            >
              <span className="lighthouse-score-value">{item.value ?? '—'}</span>
            </div>
            <div className="lighthouse-score-label">{item.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreCards({ result }: { result: ScanResultModel }) {
  const scores = result.lighthouse?.scores;
  const runtimeErrors = (result.runtime?.consoleErrors.length ?? 0) + (result.runtime?.pageErrors.length ?? 0);
  const failedRequests = result.network?.summary.failedRequests ?? 0;
  const longTasks = result.performanceTrace?.longTasks.length ?? 0;
  const codeReviewFindings = result.projectQuality?.codeReview.findings.length ?? 0;
  const detachedNodes = result.memory?.baseline?.stats.detachedNodeCount ?? 0;
  const cards = [
    {
      title: 'Performance',
      value: scores?.performance ?? '—',
      sub: scores?.performance != null ? 'Lighthouse' : '未采集',
      color: scoreColor(scores?.performance ?? null),
    },
    {
      title: '运行时错误',
      value: runtimeErrors,
      sub: 'Console + Page',
      color: runtimeErrors > 0 ? '#dc2626' : '#059669',
    },
    {
      title: '失败请求',
      value: failedRequests,
      sub: 'Network',
      color: failedRequests > 0 ? '#dc2626' : '#059669',
    },
    {
      title: 'Long Task',
      value: longTasks,
      sub: 'Trace',
      color: longTasks > 0 ? '#d97706' : '#059669',
    },
    {
      title: '代码审查',
      value: result.projectEvidenceEnabled ? codeReviewFindings : '—',
      sub: result.projectEvidenceEnabled ? '本地 AST' : '线上跳过',
      color: codeReviewFindings > 0 ? '#d97706' : '#059669',
    },
    {
      title: 'Detached DOM',
      value: result.memory ? detachedNodes : '—',
      sub: result.memory ? 'Memory' : '未启用',
      color: detachedNodes > 0 ? '#d97706' : '#059669',
    },
  ];

  return (
    <div className="metric-grid">
      {cards.map((card) => (
        <div
          key={card.title}
          className="metric-tile"
          style={{ '--metric-color': card.color, '--metric-accent': card.color } as CSSProperties}
        >
          <span className="metric-tile-label">{card.title}</span>
          <div className="metric-tile-value">{card.value}</div>
          <span className="metric-tile-sub">{card.sub}</span>
        </div>
      ))}
    </div>
  );
}

function OverviewTab({
  result,
  scanJsonPath,
  reportMarkdownPath,
}: Pick<ScanResultViewProps, 'result' | 'scanJsonPath' | 'reportMarkdownPath'>) {
  const scanModeLabel = result.scanMode === 'local' ? '本地模式' : '线上模式';
  const moduleStatus: { name: string; ok: boolean | null }[] = [
    { name: '运行时', ok: Boolean(result.runtime) },
    { name: 'Lighthouse', ok: Boolean(result.lighthouse) },
    { name: 'Performance Trace', ok: Boolean(result.performanceTrace) },
    { name: 'Network', ok: Boolean(result.network) },
    { name: '项目质量', ok: result.projectEvidenceEnabled ? Boolean(result.projectQuality) : null },
    { name: '内存', ok: Boolean(result.memory) },
    {
      name: 'AI 诊断',
      ok: result.input.enableAi ? Boolean(result.aiDiagnosis) : null,
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Descriptions title="扫描信息" column={1} size="small" bordered>
          <Descriptions.Item label="扫描模式">{scanModeLabel}</Descriptions.Item>
          <Descriptions.Item label="报告 ID">{result.id}</Descriptions.Item>
          <Descriptions.Item label="页面地址">{result.input.url}</Descriptions.Item>
          <Descriptions.Item label="最终地址">{result.runtime?.finalUrl ?? '未采集'}</Descriptions.Item>
          <Descriptions.Item label="登录态文件">{result.input.authStatePath ?? '未提供'}</Descriptions.Item>
          <Descriptions.Item label="项目路径">{result.input.projectPath ?? '未提供'}</Descriptions.Item>
          <Descriptions.Item label="JSON 证据">{scanJsonPath}</Descriptions.Item>
          <Descriptions.Item label="Markdown 报告">{reportMarkdownPath}</Descriptions.Item>
        </Descriptions>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title="模块状态" className="panel" style={{ marginBottom: 16 }}>
          <Row gutter={[8, 8]}>
            {moduleStatus.map((module) => (
              <Col span={12} key={module.name}>
                <Tag color={module.ok === null ? 'default' : module.ok ? 'green' : 'red'}>
                  {module.ok === null ? '○' : module.ok ? '●' : '✕'} {module.name}
                </Tag>
              </Col>
            ))}
          </Row>
        </Card>
        {result.errors.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`${result.errors.length} 个模块异常`}
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {result.errors.map((error, index) => (
                  <li key={index}>
                    <Text code>{error.module}</Text>: {error.message}
                  </li>
                ))}
              </ul>
            }
          />
        )}
        {result.previousScanComparison && (
          <Card size="small" title="与上次扫描对比" className="panel" style={{ marginTop: 16 }}>
            <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
              <Descriptions.Item label="基线扫描">{result.previousScanComparison.baseScanId}</Descriptions.Item>
              <Descriptions.Item label="变化">
                改善 {result.previousScanComparison.summary.improved} 项，回退 {result.previousScanComparison.summary.regressed}{' '}
                项，不变 {result.previousScanComparison.summary.unchanged} 项
              </Descriptions.Item>
            </Descriptions>
            <Table<ScanMetricComparisonView>
              size="small"
              rowKey={comparisonMetricRowKey}
              pagination={false}
              columns={[
                { title: '指标', dataIndex: 'label' },
                { title: '上次', width: 90, render: (_, record) => formatComparisonNumber(record, record.before) },
                { title: '本次', width: 90, render: (_, record) => formatComparisonNumber(record, record.after) },
                { title: '变化', width: 90, render: (_, record) => formatComparisonDelta(record) },
                { title: '方向', width: 90, render: (_, record) => <ComparisonDirectionTag direction={record.direction} /> },
              ]}
              dataSource={result.previousScanComparison.metrics.filter((metric) => metric.direction !== 'unknown').slice(0, 6)}
            />
          </Card>
        )}
      </Col>
    </Row>
  );
}

function AiTab({ result }: { result: ScanResultModel }) {
  const ai = result.aiDiagnosis;
  const meta = result.aiRunMeta;
  const enabled = Boolean(result.input.enableAi || meta?.enabled);

  if (!enabled) {
    return <Empty description="未开启 AI 诊断。在扫描表单中打开「生成 AI 诊断」后，将显示调用信息与模型返回。" />;
  }

  if (!ai) {
    return (
      <>
        {meta ? (
          <AiCallMetaCard meta={meta} />
        ) : (
          <Alert
            type="warning"
            showIcon
            message="AI 诊断无运行记录"
            description="扫描请求可能未携带 enableAi，或服务端版本过旧。"
          />
        )}
        <Empty description="模型未返回可解析的诊断结果。请根据上方调用信息排查 API Key、模型名与网络。" />
      </>
    );
  }

  return (
    <>
      {meta && <AiCallMetaCard meta={meta} />}
      <Paragraph>{ai.summary}</Paragraph>
      <Space direction="vertical" size={12} className="full-width" style={{ marginBottom: 16 }}>
        {ai.topIssues.map((issue) => (
          <Card
            key={aiIssueRowKey(issue)}
            size="small"
            className="panel ai-issue-card"
            title={
              <Space wrap>
                <SeverityTag severity={issue.severity} />
                <Tag>{issue.category}</Tag>
                <Text strong>{issue.title}</Text>
              </Space>
            }
          >
            <Space direction="vertical" size={8} className="full-width">
              <div>
                <Text type="secondary">关联证据</Text>
                <div style={{ marginTop: 4 }}>
                  {issue.evidenceIds.map((id) => (
                    <Tag key={id}>{id}</Tag>
                  ))}
                </div>
              </div>
              <div>
                <Text type="secondary">可能原因</Text>
                <Paragraph style={{ marginBottom: 0 }}>{issue.possibleCause}</Paragraph>
              </div>
              <div>
                <Text type="secondary">修复方向</Text>
                <Paragraph style={{ marginBottom: 0 }}>{issue.suggestion}</Paragraph>
              </div>
              {issue.optimizationDirection && (
                <div>
                  <Text type="secondary">优化策略</Text>
                  <Paragraph style={{ marginBottom: 0 }}>{issue.optimizationDirection}</Paragraph>
                </div>
              )}
              {issue.implementationSteps && issue.implementationSteps.length > 0 && (
                <div>
                  <Text type="secondary">实施步骤</Text>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {issue.implementationSteps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
              {issue.codeHints && (
                <div>
                  <Text type="secondary">代码/配置提示</Text>
                  <Paragraph>
                    <Text code style={{ whiteSpace: 'pre-wrap' }}>
                      {issue.codeHints}
                    </Text>
                  </Paragraph>
                </div>
              )}
              <div>
                <Text type="secondary">验证方法</Text>
                <Paragraph style={{ marginBottom: 0 }}>{issue.verifyMethod}</Paragraph>
              </div>
            </Space>
          </Card>
        ))}
      </Space>
      {ai.nextActions.length > 0 && (
        <Card size="small" title="后续动作" className="panel">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {ai.nextActions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function PerformanceTab({ result }: { result: ScanResultModel }) {
  const lighthouse = result.lighthouse;
  const trace = result.performanceTrace;
  const traceCls = trace?.layoutShifts.reduce((sum, shift) => sum + shift.score, 0);
  const traceTbtMs = trace?.longTasks.reduce((sum, task) => sum + task.duration, 0);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Descriptions title="核心指标" column={1} size="small" bordered>
          <Descriptions.Item label="LCP">
            {lighthouse?.metrics.largestContentfulPaint ?? '未采集（登录态页需 Lighthouse 成功运行）'}
          </Descriptions.Item>
          <Descriptions.Item label="CLS">
            {lighthouse?.metrics.cumulativeLayoutShift ??
              (traceCls != null ? `${traceCls.toFixed(3)}（Trace 近似）` : '未采集')}
          </Descriptions.Item>
          <Descriptions.Item label="TBT">
            {lighthouse?.metrics.totalBlockingTime ??
              (traceTbtMs != null ? `${traceTbtMs.toFixed(0)} ms（Long Task 合计）` : '未采集')}
          </Descriptions.Item>
          <Descriptions.Item label="Speed Index">
            {lighthouse?.metrics.speedIndex ?? '未采集（仅 Lighthouse 提供）'}
          </Descriptions.Item>
        </Descriptions>
        {trace && (
          <Descriptions title="主线程耗时 (ms)" column={2} size="small" bordered style={{ marginTop: 16 }}>
            <Descriptions.Item label="Scripting">{trace.categoryDurations.scripting}</Descriptions.Item>
            <Descriptions.Item label="Rendering">{trace.categoryDurations.rendering}</Descriptions.Item>
            <Descriptions.Item label="Painting">{trace.categoryDurations.painting}</Descriptions.Item>
            <Descriptions.Item label="Loading">{trace.categoryDurations.loading}</Descriptions.Item>
          </Descriptions>
        )}
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title="Lighthouse 待改进审计" className="panel" style={{ marginBottom: 16 }}>
          {lighthouse?.audits.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lighthouse.audits.slice(0, 8).map((audit) => (
                <li key={audit.id}>
                  {audit.title}
                  {audit.displayValue ? <Text type="secondary">（{audit.displayValue}）</Text> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无明显问题或未采集" />
          )}
        </Card>
        <Card size="small" title={`Long Task（${trace?.longTasks.length ?? 0}）`} className="panel">
          {trace?.longTasks.length ? (
            <Table
              size="small"
              rowKey={longTaskRowKey}
              pagination={false}
              columns={[
                { title: '事件', dataIndex: 'topLevelEvent' },
                { title: '耗时(ms)', dataIndex: 'duration', width: 100 },
              ]}
              dataSource={trace.longTasks}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无长任务或未采集" />
          )}
        </Card>
      </Col>
    </Row>
  );
}

function NetworkTab({ result }: { result: ScanResultModel }) {
  const network = result.network;
  if (!network) return <Empty description="未采集网络证据" />;

  const { summary } = network;
  const itemColumns = [
    { title: '类型', dataIndex: 'resourceType', width: 90 },
    { title: '体积', dataIndex: 'transferSize', width: 100, render: (value: number) => formatBytes(value) },
    { title: '耗时(ms)', dataIndex: 'durationMs', width: 100, render: (value?: number) => value ?? 'n/a' },
    { title: 'URL', dataIndex: 'url', ellipsis: true },
  ];

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <div className="inline-stat-card">
            <Statistic title="请求总数" value={summary.totalRequests} />
          </div>
        </Col>
        <Col xs={12} md={6}>
          <div className="inline-stat-card">
            <Statistic
              title="失败请求"
              value={summary.failedRequests}
              valueStyle={{ color: summary.failedRequests ? '#dc2626' : undefined }}
            />
          </div>
        </Col>
        <Col xs={12} md={6}>
          <div className="inline-stat-card">
            <Statistic title="缓存命中率" value={Math.round(summary.cacheHitRatio * 100)} suffix="%" />
          </div>
        </Col>
        <Col xs={12} md={6}>
          <div className="inline-stat-card">
            <Statistic title="总传输体积" value={formatBytes(summary.totalTransferSize)} />
          </div>
        </Col>
      </Row>
      <Card size="small" title={`慢请求（${summary.slowRequests.length}）`} className="panel" style={{ marginBottom: 16 }}>
        <Table
          size="small"
          rowKey={networkItemRowKey}
          pagination={false}
          columns={itemColumns}
          dataSource={summary.slowRequests}
          locale={{ emptyText: '无慢请求' }}
        />
      </Card>
      <Card size="small" title={`大资源（${summary.largeResources.length}）`} className="panel">
        <Table
          size="small"
          rowKey={networkItemRowKey}
          pagination={false}
          columns={itemColumns}
          dataSource={summary.largeResources}
          locale={{ emptyText: '无大资源' }}
        />
      </Card>
    </>
  );
}

function RuntimeTab({ result }: { result: ScanResultModel }) {
  const runtime = result.runtime;
  if (!runtime) return <Empty description="未采集运行时证据" />;

  const renderList = (title: string, items: string[]) => (
    <Card size="small" title={`${title}（${items.length}）`} className="panel" style={{ marginBottom: 16 }}>
      {items.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 200, overflow: 'auto' }}>
          {items.map((item, index) => (
            <li key={index}>
              <Text type="danger">{item}</Text>
            </li>
          ))}
        </ul>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无" />
      )}
    </Card>
  );

  return (
    <>
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="请求地址">{runtime.requestedUrl ?? result.input.url}</Descriptions.Item>
        <Descriptions.Item label="页面标题">{runtime.title}</Descriptions.Item>
        <Descriptions.Item label="最终地址">{runtime.finalUrl}</Descriptions.Item>
        <Descriptions.Item label="目标命中">
          {runtime.targetUrlMatched === false ? (
            <Tag color="red">{runtime.targetMismatchReason ?? '未命中'}</Tag>
          ) : (
            <Tag color="green">是</Tag>
          )}
        </Descriptions.Item>
      </Descriptions>
      {renderList('控制台错误', runtime.consoleErrors.map((error) => error.text))}
      {renderList('页面异常', runtime.pageErrors.map((error) => error.message))}
      {renderList(
        'HTTP 错误',
        runtime.httpErrors.map((error) => `${error.method} ${error.url} → ${error.status} ${error.statusText}`),
      )}
      {renderList(
        '请求失败',
        runtime.requestFailures.map((failure) => `${failure.method} ${failure.url} ${failure.failureText ?? ''}`),
      )}
    </>
  );
}

function QualityTab({ result }: { result: ScanResultModel }) {
  if (!result.projectEvidenceEnabled) {
    return (
      <Alert
        type="info"
        showIcon
        message="本地项目证据已跳过"
        description="当前为线上模式，未采集 TypeScript、ESLint、依赖审计、无用代码、循环依赖与本地代码审查等证据。如需完整代码质量体检，请使用本地模式并提供项目路径。"
      />
    );
  }

  const quality = result.projectQuality;
  if (!quality) return <Empty description="未提供项目路径，未执行项目质量扫描" />;

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { name: 'TypeScript', node: quality.typecheck.status, extra: `错误 ${quality.typecheck.errorCount}` },
          { name: 'ESLint', node: quality.eslint.status, extra: `错误 ${quality.eslint.errorCount} / 警告 ${quality.eslint.warningCount}` },
          { name: '依赖漏洞', node: quality.audit.status, extra: `共 ${quality.audit.total}` },
          { name: '无用代码(Knip)', node: quality.unused.status, extra: `文件 ${quality.unused.unusedFiles} / 依赖 ${quality.unused.unusedDependencies}` },
          { name: '循环依赖(Madge)', node: quality.circular.status, extra: `${quality.circular.circularCount} 处` },
          { name: '代码审查', node: quality.codeReview.status, extra: `${quality.codeReview.findings.length} 项 / ${quality.codeReview.scannedFiles} 文件` },
        ].map((item) => (
          <Col xs={12} md={8} key={item.name}>
            <Card size="small" className="panel">
              <Text strong>{item.name}</Text>
              <div style={{ marginTop: 6 }}>
                <StatusTag status={item.node} /> <Text type="secondary">{item.extra}</Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Card size="small" title={`本地代码审查发现（${quality.codeReview.findings.length}）`} className="panel">
        <Table
          size="small"
          rowKey={codeReviewRowKey}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          columns={[
            { title: '严重度', dataIndex: 'severity', width: 80, render: (value: IssueSeverity) => <SeverityTag severity={value} /> },
            { title: '规则', dataIndex: 'ruleId', width: 180 },
            { title: '位置', width: 200, render: (_, record) => `${record.file}:${record.line}` },
            { title: '说明', dataIndex: 'message' },
          ]}
          dataSource={quality.codeReview.findings}
          locale={{ emptyText: quality.codeReview.skippedReason ?? '未发现问题' }}
        />
      </Card>
    </>
  );
}

function MemoryTab({ result }: { result: ScanResultModel }) {
  const memory = result.memory;
  if (!memory) return <Empty description="未启用内存诊断（可在表单中开启）" />;

  const baseline = memory.baseline;
  const comparison = memory.comparison;

  return (
    <>
      {comparison?.suspectedLeak && (
        <Alert
          type="warning"
          showIcon
          message="疑似内存泄漏"
          description={`重复加载 ${comparison.reloadRounds} 次后，对象数 +${comparison.nodeCountDelta}、detached 节点 +${comparison.detachedNodeCountDelta}。需人工在 DevTools Memory 面板验证。`}
          style={{ marginBottom: 16 }}
        />
      )}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small" className="panel">
            <Statistic title="节点数" value={baseline?.stats.nodeCount ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="panel">
            <Statistic
              title="Detached DOM"
              value={baseline?.stats.detachedNodeCount ?? 0}
              valueStyle={{ color: baseline?.stats.detachedNodeCount ? '#dc2626' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="panel">
            <Statistic title="堆体积" value={formatBytes(baseline?.stats.totalSizeBytes)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="panel">
            <Statistic title="疑似泄漏" value={comparison?.suspectedLeak ? '是' : '否'} />
          </Card>
        </Col>
      </Row>
      <Card size="small" title="Top 构造器" className="panel" style={{ marginBottom: 16 }}>
        <Table
          size="small"
          rowKey={memoryConstructorRowKey}
          pagination={false}
          columns={[
            { title: '构造器', dataIndex: 'name' },
            { title: '数量', dataIndex: 'count', width: 100 },
            { title: '自身体积', dataIndex: 'selfSizeBytes', width: 120, render: (value: number) => formatBytes(value) },
          ]}
          dataSource={baseline?.stats.topConstructors ?? []}
          locale={{ emptyText: '未采集' }}
        />
      </Card>
      <Alert
        type="info"
        showIcon
        message="说明"
        description={
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {memory.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        }
      />
    </>
  );
}

function ScanSetSummary({ scanSet }: { scanSet: ScanSetView }) {
  return (
    <Card title="多路由扫描汇总" style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={12} className="full-width">
        <Text>
          共扫描 {scanSet.summary.routeCount} 条路由，失败 {scanSet.summary.failedRoutes} 条
        </Text>
        <Table
          size="small"
          pagination={false}
          rowKey="url"
          dataSource={scanSet.routes}
          columns={[
            { title: 'URL', dataIndex: 'url', key: 'url' },
            { title: '最终 URL', dataIndex: 'finalUrl', key: 'finalUrl', render: (value?: string) => value ?? 'n/a' },
            {
              title: '目标命中',
              dataIndex: 'targetMatched',
              key: 'targetMatched',
              render: (value?: boolean) => (value === true ? '是' : value === false ? '否' : 'n/a'),
            },
            { title: '运行时错误', dataIndex: 'runtimeErrors', key: 'runtimeErrors' },
            { title: '失败请求', dataIndex: 'failedRequests', key: 'failedRequests' },
            {
              title: 'Performance',
              dataIndex: 'performanceScore',
              key: 'performanceScore',
              render: (value?: number | null) => (typeof value === 'number' ? value : 'n/a'),
            },
          ]}
        />
      </Space>
    </Card>
  );
}

export function ScanResultView({ result, scanDir, scanJsonPath, reportMarkdownPath, scanSet }: ScanResultViewProps) {
  const aiFailed = Boolean(result.input.enableAi && !result.aiDiagnosis);
  const defaultTab = result.input.enableAi ? 'ai' : 'overview';

  return (
    <div className="scan-report">
      <ReportHero
        result={result}
        scanDir={scanDir}
        scanJsonPath={scanJsonPath}
        reportMarkdownPath={reportMarkdownPath}
      />

      {result.runtime?.targetUrlMatched === false && (
        <Alert
          type="error"
          showIcon
          message="未命中目标页面，扫描结果可能是登录页或无权限页面"
          description={formatTargetMismatchDescription(result)}
          style={{ marginBottom: 16 }}
        />
      )}

      {!result.projectEvidenceEnabled && (
        <Alert
          type="info"
          showIcon
          message="线上模式：本地项目证据未采集"
          description="本次扫描仅包含页面运行时、性能、网络等线上证据。依赖分析、代码审查等项目质量模块已跳过。"
          style={{ marginBottom: 16 }}
        />
      )}

      <LighthouseScoreRow result={result} />
      <ScoreCards result={result} />

      {scanSet && <ScanSetSummary scanSet={scanSet} />}

      <Tabs
        className="scan-report-tabs"
        defaultActiveKey={defaultTab}
        items={[
          { key: 'overview', label: '概览', children: <div className="scan-report-tab-body"><OverviewTab result={result} scanJsonPath={scanJsonPath} reportMarkdownPath={reportMarkdownPath} /></div> },
          {
            key: 'ai',
            label: (
              <span>
                <RobotOutlined /> AI 诊断{aiFailed ? <Tag color="error" style={{ marginLeft: 6 }}>失败</Tag> : null}
              </span>
            ),
            children: <div className="scan-report-tab-body"><AiTab result={result} /></div>,
          },
          { key: 'performance', label: '性能', children: <div className="scan-report-tab-body"><PerformanceTab result={result} /></div> },
          { key: 'network', label: '网络', children: <div className="scan-report-tab-body"><NetworkTab result={result} /></div> },
          { key: 'runtime', label: '运行时', children: <div className="scan-report-tab-body"><RuntimeTab result={result} /></div> },
          { key: 'quality', label: '项目质量', children: <div className="scan-report-tab-body"><QualityTab result={result} /></div> },
          { key: 'memory', label: '内存', children: <div className="scan-report-tab-body"><MemoryTab result={result} /></div> },
        ]}
      />
    </div>
  );
}
