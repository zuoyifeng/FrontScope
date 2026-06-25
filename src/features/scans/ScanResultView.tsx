import { Alert, Button, Card, Col, Descriptions, Empty, Row, Statistic, Table, Tabs, Tag, Typography } from 'antd';
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
  TargetUrlMismatchReason,
} from './types';

const { Text, Paragraph } = Typography;

interface ScanResultViewProps {
  result: ScanResultModel;
  scanDir: string;
  scanJsonPath: string;
  reportMarkdownPath: string;
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

function ReportPathsCard({ scanDir, scanJsonPath, reportMarkdownPath }: Pick<ScanResultViewProps, 'scanDir' | 'scanJsonPath' | 'reportMarkdownPath'>) {
  return (
    <Alert
      type="success"
      showIcon
      icon={<FolderOpenOutlined />}
      message="报告已导出到本地"
      description={
        <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
          <Descriptions.Item label="报告目录">
            <Text copyable={{ text: scanDir }}>{scanDir}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Markdown">
            <Text copyable={{ text: reportMarkdownPath }}>{reportMarkdownPath}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="JSON 证据">
            <Text copyable={{ text: scanJsonPath }}>{scanJsonPath}</Text>
          </Descriptions.Item>
        </Descriptions>
      }
      action={
        <Button size="small" type="primary" onClick={() => navigator.clipboard.writeText(reportMarkdownPath)}>
          复制 Markdown 路径
        </Button>
      }
      style={{ marginBottom: 16 }}
    />
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

function HealthBanner({ result }: { result: ScanResultModel }) {
  const ai = result.aiDiagnosis;
  const aiMeta = result.aiRunMeta;
  const aiError = result.errors.find((error) => error.module === 'ai');
  const targetMismatch = result.runtime?.targetUrlMatched === false;

  if (targetMismatch) {
    return (
      <Alert
        type="error"
        showIcon
        message="未命中目标页面，扫描结果可能是登录页或无权限页面"
        description={formatTargetMismatchDescription(result)}
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (ai) {
    const meta = HEALTH_META[ai.healthLevel];
    return (
      <Alert
        type={meta.color}
        showIcon
        message={`AI 健康评级：${meta.label}（${ai.healthLevel}）`}
        description={ai.summary}
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (result.input.enableAi) {
    return (
      <Alert
        type="error"
        showIcon
        message="AI 诊断已开启但未成功返回"
        description={
          aiMeta?.error ??
          aiError?.message ??
          '请检查 frontscope.config.json 与 MIMO_API_KEY 环境变量，并在「AI 诊断」页签查看调用详情。'
        }
        style={{ marginBottom: 16 }}
      />
    );
  }

  const errorCount = result.errors.length;
  const perf = result.lighthouse?.scores.performance ?? null;
  const type = errorCount > 0 ? 'warning' : 'info';
  return (
    <Alert
      type={type}
      showIcon
      message={`扫描完成${errorCount > 0 ? `，${errorCount} 个模块异常` : ''}`}
      description={`未开启 AI 诊断。性能分数 ${perf ?? 'n/a'}，可在表单中开启“生成 AI 诊断”获得带证据的修复建议。`}
      style={{ marginBottom: 16 }}
    />
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

function ScoreCards({ result }: { result: ScanResultModel }) {
  const scores = result.lighthouse?.scores;
  const runtimeErrors = (result.runtime?.consoleErrors.length ?? 0) + (result.runtime?.pageErrors.length ?? 0);
  const failedRequests = result.network?.summary.failedRequests ?? 0;
  const longTasks = result.performanceTrace?.longTasks.length ?? 0;
  const codeReviewFindings = result.projectQuality?.codeReview.findings.length ?? 0;
  const detachedNodes = result.memory?.baseline?.stats.detachedNodeCount ?? 0;
  const cards = [
    { title: 'Performance', value: scores?.performance ?? null, color: scoreColor(scores?.performance ?? null) },
    { title: '运行时错误', value: runtimeErrors, color: runtimeErrors > 0 ? '#dc2626' : '#16a34a' },
    { title: '失败请求', value: failedRequests, color: failedRequests > 0 ? '#dc2626' : '#16a34a' },
    { title: 'Long Task', value: longTasks, color: longTasks > 0 ? '#d97706' : '#16a34a' },
    { title: '代码审查问题', value: codeReviewFindings, color: codeReviewFindings > 0 ? '#d97706' : '#16a34a' },
    { title: 'Detached DOM', value: detachedNodes, color: detachedNodes > 0 ? '#d97706' : '#16a34a' },
  ];
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      {cards.map((card) => (
        <Col xs={12} md={8} xl={4} key={card.title}>
          <Card size="small" className="panel">
            <Statistic
              title={card.title}
              value={card.value ?? '—'}
              valueStyle={{ color: card.color, fontWeight: 700 }}
            />
          </Card>
        </Col>
      ))}
    </Row>
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

  const columns = [
    { title: '优先级', dataIndex: 'severity', width: 80, render: (value: IssueSeverity) => <SeverityTag severity={value} /> },
    { title: '类别', dataIndex: 'category', width: 110, render: (value: string) => <Tag>{value}</Tag> },
    { title: '问题', dataIndex: 'title' },
    {
      title: '证据',
      dataIndex: 'evidenceIds',
      render: (value: string[]) => value.map((id) => <Tag key={id}>{id}</Tag>),
    },
    { title: '修复建议', dataIndex: 'suggestion' },
    { title: '验证方法', dataIndex: 'verifyMethod' },
  ];

  return (
    <>
      {meta && <AiCallMetaCard meta={meta} />}
      <Paragraph>{ai.summary}</Paragraph>
      <Table<AiIssueView>
        size="small"
        rowKey={aiIssueRowKey}
        columns={columns}
        dataSource={ai.topIssues}
        pagination={false}
        style={{ marginBottom: 16 }}
      />
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

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Descriptions title="核心指标" column={1} size="small" bordered>
          <Descriptions.Item label="LCP">{lighthouse?.metrics.largestContentfulPaint ?? '未采集'}</Descriptions.Item>
          <Descriptions.Item label="CLS">{lighthouse?.metrics.cumulativeLayoutShift ?? '未采集'}</Descriptions.Item>
          <Descriptions.Item label="TBT">{lighthouse?.metrics.totalBlockingTime ?? '未采集'}</Descriptions.Item>
          <Descriptions.Item label="Speed Index">{lighthouse?.metrics.speedIndex ?? '未采集'}</Descriptions.Item>
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
          <Card size="small" className="panel">
            <Statistic title="请求总数" value={summary.totalRequests} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="panel">
            <Statistic title="失败请求" value={summary.failedRequests} valueStyle={{ color: summary.failedRequests ? '#dc2626' : undefined }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="panel">
            <Statistic title="缓存命中率" value={Math.round(summary.cacheHitRatio * 100)} suffix="%" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="panel">
            <Statistic title="总传输体积" value={formatBytes(summary.totalTransferSize)} />
          </Card>
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

export function ScanResultView({ result, scanDir, scanJsonPath, reportMarkdownPath }: ScanResultViewProps) {
  const aiFailed = Boolean(result.input.enableAi && !result.aiDiagnosis);
  const defaultTab = result.input.enableAi ? 'ai' : 'overview';
  const scanModeLabel = result.scanMode === 'local' ? '本地模式' : '线上模式';

  return (
    <Card title={`体检结果 · ${result.id} · ${scanModeLabel}`} className="panel">
      <ReportPathsCard scanDir={scanDir} scanJsonPath={scanJsonPath} reportMarkdownPath={reportMarkdownPath} />
      {!result.projectEvidenceEnabled && (
        <Alert
          type="info"
          showIcon
          message="线上模式：本地项目证据未采集"
          description="本次扫描仅包含页面运行时、性能、网络等线上证据。依赖分析、代码审查等项目质量模块已跳过。"
          style={{ marginBottom: 16 }}
        />
      )}
      <HealthBanner result={result} />
      <ScoreCards result={result} />
      <Tabs
        defaultActiveKey={defaultTab}
        items={[
          { key: 'overview', label: '概览', children: <OverviewTab result={result} scanJsonPath={scanJsonPath} reportMarkdownPath={reportMarkdownPath} /> },
          {
            key: 'ai',
            label: (
              <span>
                <RobotOutlined /> AI 诊断{aiFailed ? <Tag color="error" style={{ marginLeft: 6 }}>失败</Tag> : null}
              </span>
            ),
            children: <AiTab result={result} />,
          },
          { key: 'performance', label: '性能', children: <PerformanceTab result={result} /> },
          { key: 'network', label: '网络', children: <NetworkTab result={result} /> },
          { key: 'runtime', label: '运行时', children: <RuntimeTab result={result} /> },
          { key: 'quality', label: '项目质量', children: <QualityTab result={result} /> },
          { key: 'memory', label: '内存', children: <MemoryTab result={result} /> },
        ]}
      />
    </Card>
  );
}
