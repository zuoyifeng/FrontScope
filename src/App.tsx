import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Collapse,
  Form,
  Input,
  InputNumber,
  Layout,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  BugOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ScanModule, ScanMode } from './features/scans/types';
import type { ScanResponse } from './features/scans/types';
import { initialModules, reportPreview } from './features/scans/sampleData';
import { ScanResultView } from './features/scans/ScanResultView';

const { Header, Content, Sider } = Layout;
const { Title, Text, Paragraph } = Typography;
const API_BASE_URL = import.meta.env.VITE_FRONTSCOPE_API_BASE_URL ?? 'http://localhost:3001';

const moduleIcon: Record<ScanModule['key'], ReactNode> = {
  runtime: <BugOutlined />,
  performance: <ThunderboltOutlined />,
  network: <ApiOutlined />,
  package: <FileSearchOutlined />,
};

interface AiStatus {
  provider: string;
  model: string | null;
  baseURL?: string;
  endpoint: string;
  authHeader: string;
  apiKeyConfigured: boolean;
  ready: boolean;
}

interface AuthProfile {
  profileName: string;
  authStatePath: string;
}

interface ScanFormValues {
  projectPath?: string;
  url: string;
  pageName?: string;
  outputDir?: string;
  authStatePath?: string;
  enableAi?: boolean;
  enableMemory?: boolean;
  memoryReloadRounds?: number;
}

function ScanWorkspace() {
  const { message, notification } = AntApp.useApp();
  const [form] = Form.useForm<ScanFormValues>();
  const enableMemory = Form.useWatch('enableMemory', form);
  const [scanMode, setScanMode] = useState<ScanMode>('online');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(true);
  const [authProfiles, setAuthProfiles] = useState<AuthProfile[]>([]);
  const [authProfilesLoading, setAuthProfilesLoading] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [createProfileError, setCreateProfileError] = useState<string | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newLoginUrl, setNewLoginUrl] = useState('');
  const [newTargetUrl, setNewTargetUrl] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);

  const loadAuthProfiles = useCallback(async () => {
    setAuthProfilesLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth-profiles`);
      const data: { profiles: AuthProfile[] } = await response.json();
      setAuthProfiles(data.profiles ?? []);
    } catch {
      setAuthProfiles([]);
    } finally {
      setAuthProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/api/ai/status`)
      .then((response) => response.json())
      .then((status: AiStatus) => {
        if (cancelled) return;
        setAiStatus(status);
        form.setFieldsValue({ enableAi: Boolean(status.ready) });
      })
      .catch(() => {
        if (cancelled) return;
        setAiStatus(null);
        form.setFieldsValue({ enableAi: false });
      })
      .finally(() => {
        if (!cancelled) {
          setAiStatusLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form]);

  useEffect(() => {
    if (scanMode === 'online') {
      void loadAuthProfiles();
    }
  }, [scanMode, loadAuthProfiles]);

  const readiness = scanResult?.success
    ? scanResult.data?.result.lighthouse?.scores.performance ?? reportPreview.readiness
    : reportPreview.readiness;

  const handleCreateProfile = async () => {
    const profileName = newProfileName.trim();
    const loginUrl = newLoginUrl.trim();
    const targetUrl = newTargetUrl.trim() || form.getFieldValue('url')?.trim();

    if (!profileName || !loginUrl) {
      setCreateProfileError('请填写配置名称与登录页地址');
      return;
    }

    setCreatingProfile(true);
    setCreateProfileError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileName, loginUrl, targetUrl }),
      });
      const result = await response.json();

      if (!response.ok) {
        setCreateProfileError(result.error ?? '创建登录态失败');
        return;
      }

      await loadAuthProfiles();
      form.setFieldsValue({ authStatePath: result.authStatePath });
      setShowCreatePanel(false);
      setNewProfileName('');
      setNewLoginUrl('');
      setNewTargetUrl('');
      message.success('登录态已保存');
    } catch {
      setCreateProfileError('无法连接到 API 服务');
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleScan = async (values: ScanFormValues) => {
    setScanning(true);
    setScanResult(null);

    const payload = {
      scanMode,
      url: values.url,
      projectPath: scanMode === 'local' ? values.projectPath?.trim() || undefined : undefined,
      outputDir: values.outputDir?.trim() || undefined,
      pageName: values.pageName?.trim() || undefined,
      authStatePath: scanMode === 'online' ? values.authStatePath?.trim() || undefined : undefined,
      enableAi: Boolean(values.enableAi),
      enableMemory: Boolean(values.enableMemory),
      memoryReloadRounds: values.memoryReloadRounds,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result: ScanResponse = await response.json();
      setScanResult(result);

      if (result.success) {
        const data = result.data;
        if (data) {
          const aiMeta = data.result.aiRunMeta;
          const aiOk = aiMeta?.status === 'success';
          const notify = values.enableAi && !aiOk ? notification.warning : notification.success;

          notify({
            message: values.enableAi ? (aiOk ? '扫描完成，AI 诊断已生成' : '扫描完成，但 AI 诊断失败') : '扫描完成，报告已导出',
            description: (
              <div>
                <div>
                  Markdown：<Text copyable={{ text: data.reportMarkdownPath }}>{data.reportMarkdownPath}</Text>
                </div>
                <div style={{ marginTop: 4 }}>
                  JSON：<Text copyable={{ text: data.scanJsonPath }}>{data.scanJsonPath}</Text>
                </div>
                {values.enableAi && (
                  <div style={{ marginTop: 4 }}>
                    AI：
                    {aiOk
                      ? `成功 · ${aiMeta?.model ?? 'n/a'} · ${aiMeta?.durationMs ?? 0}ms · ${aiMeta?.issueCount ?? 0} 个问题`
                      : aiMeta?.error ?? '未返回诊断，请查看「AI 诊断」页签'}
                  </div>
                )}
              </div>
            ),
            duration: 12,
          });
          requestAnimationFrame(() => {
            resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          });
        } else {
          message.success('扫描完成！');
        }
      } else {
        message.error(`扫描失败: ${result.error}`);
      }
    } catch {
      message.error('无法连接到扫描服务，请确保 API 服务已启动');
      setScanResult({ success: false, error: '无法连接到扫描服务' });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Layout className="app-shell">
      <Sider width={248} className="app-sider">
        <div className="brand">
          <div className="brand-mark">FS</div>
          <div>
            <Text className="brand-name">FrontScope</Text>
            <Text className="brand-subtitle">网页性能与代码质量体检</Text>
          </div>
        </div>

        <Space direction="vertical" size={12} className="nav-stack">
          <Button type="primary" block icon={<DashboardOutlined />}>
            新建扫描
          </Button>
          <Button block icon={<FileSearchOutlined />}>
            体检报告
          </Button>
        </Space>
      </Sider>

      <Layout>
        <Header className="app-header">
          <div>
            <Text className="eyebrow">性能 · 网络 · 内存 · 代码质量</Text>
            <Title level={2}>前端证据体检工作台</Title>
          </div>
          <Tag color="blue">本地优先</Tag>
        </Header>

        <Content className="app-content">
          <Row gutter={[20, 20]}>
            <Col xs={24} xl={10}>
              <Card title="开始扫描" className="panel">
                <Form
                  form={form}
                  layout="vertical"
                  preserve
                  initialValues={{
                    enableAi: false,
                    enableMemory: false,
                    memoryReloadRounds: 0,
                  }}
                  onFinish={handleScan}
                >
                  <Form.Item label="扫描模式">
                    <Segmented<ScanMode>
                      block
                      value={scanMode}
                      onChange={(value) => setScanMode(value)}
                      options={[
                        { label: '本地模式', value: 'local' },
                        { label: '线上模式', value: 'online' },
                      ]}
                    />
                  </Form.Item>

                  <Form.Item label="页面地址" name="url" rules={[{ required: true, message: '请输入页面地址' }]}>
                    <Input placeholder="http://localhost:5173 或 https://example.com" />
                  </Form.Item>

                  {scanMode === 'local' ? (
                    <Form.Item
                      label="项目路径"
                      name="projectPath"
                      rules={[{ required: true, message: '本地模式需填写项目路径' }]}
                      tooltip="本地项目路径，用于扫描依赖、项目质量和本地代码审查。"
                    >
                      <Input placeholder="/absolute/path/to/frontend-project" />
                    </Form.Item>
                  ) : (
                    <>
                      <Form.Item
                        label="登录态配置"
                        name="authStatePath"
                        tooltip="选择已保存的登录态，用于扫描需要登录或有权限控制的目标页面。可不选直接扫描公开页面。"
                      >
                        <Select
                          allowClear
                          placeholder="选择登录态配置（可选）"
                          loading={authProfilesLoading}
                          options={authProfiles.map((profile) => ({
                            label: profile.profileName,
                            value: profile.authStatePath,
                          }))}
                        />
                      </Form.Item>
                      {!showCreatePanel ? (
                        <Button
                          type="dashed"
                          block
                          icon={<PlusOutlined />}
                          onClick={() => {
                            setShowCreatePanel(true);
                            setCreateProfileError(null);
                          }}
                          style={{ marginBottom: 16 }}
                        >
                          新建登录态配置
                        </Button>
                      ) : (
                        <Card
                          size="small"
                          title="新建登录态配置"
                          className="panel"
                          style={{ marginBottom: 16 }}
                          extra={
                            <Button
                              type="text"
                              size="small"
                              onClick={() => {
                                setShowCreatePanel(false);
                                setCreateProfileError(null);
                              }}
                            >
                              取消
                            </Button>
                          }
                        >
                          <Space direction="vertical" size={8} className="full-width">
                            <Input
                              placeholder="配置名称，例如 admin"
                              value={newProfileName}
                              onChange={(event) => setNewProfileName(event.target.value)}
                              disabled={creatingProfile}
                            />
                            <Input
                              placeholder="登录页地址，例如 https://example.com/login"
                              value={newLoginUrl}
                              onChange={(event) => setNewLoginUrl(event.target.value)}
                              disabled={creatingProfile}
                            />
                            <Input
                              placeholder="目标页地址（可选，默认使用上方页面地址）"
                              value={newTargetUrl}
                              onChange={(event) => setNewTargetUrl(event.target.value)}
                              disabled={creatingProfile}
                            />
                            {createProfileError && (
                              <Alert type="error" showIcon message={createProfileError} />
                            )}
                            <Button
                              type="primary"
                              block
                              loading={creatingProfile}
                              onClick={() => void handleCreateProfile()}
                            >
                              {creatingProfile ? '浏览器登录中…' : '生成登录态'}
                            </Button>
                          </Space>
                        </Card>
                      )}
                    </>
                  )}

                  <Collapse
                    ghost
                    items={[
                      {
                        key: 'advanced',
                        label: '高级选项',
                        children: (
                          <>
                            <Form.Item label="页面名称" name="pageName">
                              <Input placeholder="可选，例如：首页" />
                            </Form.Item>
                            <Form.Item
                              label="报告输出目录"
                              name="outputDir"
                              tooltip="默认：填写项目路径时为 {项目}/frontscope-reports；否则为当前工作目录下的 frontscope-reports/"
                            >
                              <Input placeholder="留空使用默认目录 frontscope-reports/" />
                            </Form.Item>
                          </>
                        ),
                      },
                    ]}
                    style={{ marginBottom: 16 }}
                  />

                  <Form.Item
                    label="生成 AI 诊断"
                    name="enableAi"
                    valuePropName="checked"
                    tooltip={
                      aiStatus?.ready
                        ? `使用项目配置中的 AI（${aiStatus.model ?? '默认模型'}）`
                        : '需在 frontscope.config.json 或环境变量中配置 AI'
                    }
                  >
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" disabled={aiStatusLoading} />
                  </Form.Item>

                  {!aiStatusLoading && aiStatus && !aiStatus.ready && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message="AI 配置未就绪"
                      description={
                        <div>
                          <div>Provider：{aiStatus.provider}</div>
                          <div>API Key：{aiStatus.apiKeyConfigured ? '已配置' : '未配置'}</div>
                          <div>模型：{aiStatus.model ?? '未配置'}</div>
                          <div style={{ marginTop: 8 }}>
                            请在 <Text code>frontscope.config.json</Text> 或环境变量中配置 openai provider、API Key 与模型。
                          </div>
                        </div>
                      }
                    />
                  )}

                  {!aiStatusLoading && aiStatus?.ready && (
                    <Alert
                      type="success"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message="AI 配置已就绪"
                      description={`将使用 ${aiStatus.model ?? '默认模型'}（${aiStatus.baseURL ?? aiStatus.endpoint}）`}
                    />
                  )}

                  <Form.Item
                    label="内存诊断"
                    name="enableMemory"
                    valuePropName="checked"
                    tooltip="采集堆快照（较慢）。设置重载次数大于 0 时执行前后对比，输出疑似泄漏信号。"
                  >
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>

                  {enableMemory && (
                    <>
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="堆快照可能包含页面内存中的业务数据，请仅在测试环境或脱敏账号下开启。"
                      />
                      <Form.Item label="内存重载对比次数" name="memoryReloadRounds" tooltip="0 表示仅采集单次基线快照">
                        <InputNumber min={0} max={20} style={{ width: '100%' }} />
                      </Form.Item>
                    </>
                  )}

                  <Button
                    type="primary"
                    block
                    size="large"
                    className="primary-action"
                    htmlType="submit"
                    loading={scanning}
                  >
                    {scanning ? '扫描中...' : '开始扫描'}
                  </Button>
                </Form>
              </Card>
            </Col>

            <Col xs={24} xl={14}>
              <Card title="证据采集模块" className="panel" style={{ marginBottom: 20 }}>
                <Row gutter={[16, 16]}>
                  {initialModules.map((item) => (
                    <Col xs={24} md={12} key={item.key}>
                      <div className="module-card">
                        <div className="module-icon">{moduleIcon[item.key]}</div>
                        <div>
                          <Text strong>{item.title}</Text>
                          <Paragraph className="module-description">{item.description}</Paragraph>
                          <Tag color="green">{item.status}</Tag>
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              </Card>

              <Card title="体检就绪度" className="panel">
                <Space direction="vertical" size={12} className="full-width">
                  <Progress percent={readiness} status="active" />
                  <Text type="secondary">
                    覆盖运行时、性能、网络、内存与本地代码质量证据，全部进入 JSON 与 Markdown 报告，并可由 AI
                    基于证据生成修复建议。
                  </Text>
                </Space>
              </Card>
            </Col>

            {scanResult && (
              <Col xs={24} ref={resultRef}>
                {scanResult.success && scanResult.data ? (
                  <ScanResultView
                    result={scanResult.data.result}
                    scanDir={scanResult.data.scanDir}
                    scanJsonPath={scanResult.data.scanJsonPath}
                    reportMarkdownPath={scanResult.data.reportMarkdownPath}
                  />
                ) : (
                  <Alert type="error" showIcon message="扫描失败" description={scanResult.error} />
                )}
              </Col>
            )}
          </Row>
        </Content>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <AntApp>
      <ScanWorkspace />
    </AntApp>
  );
}

export default App;
