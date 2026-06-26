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
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  BugOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { EvidenceModuleKey, EvidenceModuleView, LocalProjectIntakeView, ScanMode } from './types';
import { EVIDENCE_MODULE_STATUS_META, buildEvidenceModules } from './evidenceModules';
import { buildScanReadiness } from './scanReadiness';
import { ScanProgressPanel } from './ScanProgressPanel';
import type { ScanProgressApiResponse, ScanProgressView, ScanStartResponse } from './scanProgressTypes';
import {
  readImmediateScanPayload,
  readProgressScanPayload,
  type ScanPayload,
} from './resolveScanPayload';

const { Title, Text } = Typography;
const API_BASE_URL = import.meta.env.VITE_FRONTSCOPE_API_BASE_URL ?? 'http://localhost:3001';

const HERO_CAPABILITIES = [
  '运行时',
  'Lighthouse',
  'Network',
  '项目质量',
  '内存',
  'AI 诊断',
] as const;

function moduleStatusClass(status: EvidenceModuleView['status']): string {
  switch (status) {
    case 'scanning':
      return 'module-card--scanning';
    case 'collected':
      return 'module-card--collected';
    case 'failed':
      return 'module-card--failed';
    default:
      return '';
  }
}

function moduleStatusDotClass(status: EvidenceModuleView['status']): string {
  return `module-status-dot module-status-dot--${status}`;
}

function readinessIcon(status: 'pass' | 'fail' | 'pending' | 'skipped') {
  switch (status) {
    case 'pass':
      return <CheckCircleOutlined style={{ color: '#16a34a' }} />;
    case 'fail':
      return <CloseCircleOutlined style={{ color: '#dc2626' }} />;
    case 'pending':
      return <MinusCircleOutlined style={{ color: '#006eff' }} />;
    default:
      return <MinusCircleOutlined style={{ color: '#94a3b8' }} />;
  }
}

const moduleIcon: Record<EvidenceModuleKey, ReactNode> = {
  runtime: <BugOutlined />,
  performance: <ThunderboltOutlined />,
  network: <ApiOutlined />,
  project: <FileSearchOutlined />,
  memory: <DashboardOutlined />,
  ai: <RobotOutlined />,
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

interface AiConnectionTestResult {
  success: boolean;
  provider: string;
  model?: string;
  baseURL?: string;
  endpoint?: string;
  authHeader?: string;
  apiKeyConfigured: boolean;
  durationMs: number;
  error?: string;
  responsePreview?: string;
}

type AuthProfileVerificationStatus =
  | 'unknown'
  | 'valid'
  | 'login-redirect'
  | 'unauthorized'
  | 'error';

interface AuthProfileMetadata {
  profileName: string;
  authStatePath: string;
  loginUrl: string;
  targetOrigin: string;
  createdAt: string;
  lastVerifiedAt?: string;
  verification: {
    status: AuthProfileVerificationStatus;
    finalUrl?: string;
    message?: string;
  };
}

interface AuthProfile {
  profileName: string;
  authStatePath: string;
  metadata?: AuthProfileMetadata;
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

export interface ScanWorkspaceProps {
  onReportReady: (data: ScanPayload) => void;
}

function notifyScanComplete(
  data: ScanPayload,
  enableAi: boolean,
  notification: ReturnType<typeof AntApp.useApp>['notification'],
) {
  const aiMeta = data.result.aiRunMeta;
  const aiOk = aiMeta?.status === 'success';
  const notify = enableAi && !aiOk ? notification.warning : notification.success;

  notify({
    message: enableAi ? (aiOk ? '扫描完成，AI 诊断已生成' : '扫描完成，但 AI 诊断失败') : '扫描完成，报告已导出',
    description: (
      <div>
        <div>
          Markdown：<Text copyable={{ text: data.reportMarkdownPath }}>{data.reportMarkdownPath}</Text>
        </div>
        <div style={{ marginTop: 4 }}>
          JSON：<Text copyable={{ text: data.scanJsonPath }}>{data.scanJsonPath}</Text>
        </div>
        {enableAi && (
          <div style={{ marginTop: 4 }}>
            AI：
            {aiOk
              ? `成功 · ${aiMeta?.model ?? 'n/a'} · ${aiMeta?.durationMs ?? 0}ms · ${aiMeta?.issueCount ?? 0} 个问题`
              : aiMeta?.error ?? '未返回诊断，请打开报告查看详情'}
          </div>
        )}
      </div>
    ),
    duration: 8,
  });
}

export function ScanWorkspace({ onReportReady }: ScanWorkspaceProps) {
  const { message, notification } = AntApp.useApp();
  const [form] = Form.useForm<ScanFormValues>();
  const enableMemory = Form.useWatch('enableMemory', form);
  const enableAi = Form.useWatch('enableAi', form);
  const url = Form.useWatch('url', form) ?? '';
  const projectPath = Form.useWatch('projectPath', form) ?? '';
  const authStatePath = Form.useWatch('authStatePath', form) ?? '';
  const [scanMode, setScanMode] = useState<ScanMode>('online');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgressView | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(true);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiConnectionTest, setAiConnectionTest] = useState<AiConnectionTestResult | null>(null);
  const [authProfiles, setAuthProfiles] = useState<AuthProfile[]>([]);
  const [authProfilesLoading, setAuthProfilesLoading] = useState(false);
  const [authProfileVerifying, setAuthProfileVerifying] = useState(false);
  const [authProfileVerifyError, setAuthProfileVerifyError] = useState<string | null>(null);
  const [authRecording, setAuthRecording] = useState<{
    recordingId: string;
    profileName: string;
    loginUrl: string;
    targetUrl: string;
    message: string;
  } | null>(null);
  const [startingRecording, setStartingRecording] = useState(false);
  const [completingRecording, setCompletingRecording] = useState(false);
  const [cancelingRecording, setCancelingRecording] = useState(false);
  const [createProfileError, setCreateProfileError] = useState<string | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newLoginUrl, setNewLoginUrl] = useState('');
  const [newTargetUrl, setNewTargetUrl] = useState('');
  const [localProjectIntake, setLocalProjectIntake] = useState<LocalProjectIntakeView | null>(null);
  const [inspectingProject, setInspectingProject] = useState(false);
  const [inspectProjectError, setInspectProjectError] = useState<string | null>(null);

  const completedScanResult = scanProgress?.result?.result ?? null;
  const selectedAuthProfile = useMemo(
    () => authProfiles.find((profile) => profile.authStatePath === authStatePath),
    [authProfiles, authStatePath],
  );

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

  useEffect(() => {
    setLocalProjectIntake(null);
    setInspectProjectError(null);
  }, [projectPath, scanMode]);

  const handleInspectLocalProject = async () => {
    const trimmedPath = projectPath.trim();
    if (!trimmedPath) {
      setInspectProjectError('请先填写项目路径');
      return;
    }

    setInspectingProject(true);
    setInspectProjectError(null);
    setLocalProjectIntake(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/local-projects/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: trimmedPath }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        const errorMessage = result.error ?? '本地项目检查失败';
        setInspectProjectError(errorMessage);
        message.error(errorMessage);
        return;
      }

      setLocalProjectIntake(result.data as LocalProjectIntakeView);
      message.success('本地项目检查完成');
    } catch {
      const errorMessage = '无法连接到 API 服务';
      setInspectProjectError(errorMessage);
      message.error(errorMessage);
    } finally {
      setInspectingProject(false);
    }
  };

  const apiReachable = !aiStatusLoading && aiStatus !== null;
  const workspaceInput = useMemo(
    () => ({
      scanMode,
      url,
      projectPath,
      enableMemory: Boolean(enableMemory),
      enableAi: Boolean(enableAi),
      aiReady: Boolean(aiStatus?.ready),
      aiStatusLoading,
      apiReachable,
      scanning,
      scanResult: completedScanResult,
      scanProgress,
    }),
    [
      aiStatus?.ready,
      aiStatusLoading,
      apiReachable,
      completedScanResult,
      enableAi,
      enableMemory,
      projectPath,
      scanMode,
      scanProgress,
      scanning,
      url,
    ],
  );
  const evidenceModules = useMemo(() => buildEvidenceModules(workspaceInput), [workspaceInput]);
  const scanReadiness = useMemo(() => buildScanReadiness(workspaceInput), [workspaceInput]);

  const handleTestAiConnection = async () => {
    setAiTesting(true);
    setAiConnectionTest(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: scanMode === 'local' ? projectPath.trim() || undefined : undefined,
        }),
      });
      const result: AiConnectionTestResult = await response.json();
      setAiConnectionTest(result);

      if (result.success) {
        message.success(`AI 接口联通成功（${result.durationMs}ms）`);
      } else {
        message.error(result.error ?? 'AI 接口联通失败');
      }
    } catch {
      const fallback: AiConnectionTestResult = {
        success: false,
        provider: aiStatus?.provider ?? 'unknown',
        apiKeyConfigured: Boolean(aiStatus?.apiKeyConfigured),
        durationMs: 0,
        error: '无法连接到 API 服务，请确认 pnpm dev 或 pnpm dev:api 已启动',
      };
      setAiConnectionTest(fallback);
      message.error(fallback.error);
    } finally {
      setAiTesting(false);
    }
  };

  const handleStartAuthRecording = async () => {
    const profileName = newProfileName.trim();
    const loginUrl = newLoginUrl.trim();
    const targetUrl = newTargetUrl.trim() || form.getFieldValue('url')?.trim();

    if (!profileName || !loginUrl) {
      setCreateProfileError('请填写配置名称与登录页地址');
      return;
    }

    if (!targetUrl) {
      setCreateProfileError('请填写目标页地址，或在上方填写页面地址');
      return;
    }

    setStartingRecording(true);
    setCreateProfileError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth-profiles/recordings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileName, loginUrl, targetUrl }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setCreateProfileError(result.error ?? '启动登录录制失败');
        return;
      }

      setAuthRecording(result.data);
    } catch {
      setCreateProfileError('无法连接到 API 服务');
    } finally {
      setStartingRecording(false);
    }
  };

  const handleCompleteAuthRecording = async () => {
    if (!authRecording) return;
    setCompletingRecording(true);
    setCreateProfileError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth-profiles/recordings/${encodeURIComponent(authRecording.recordingId)}/complete`,
        { method: 'POST' },
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        setCreateProfileError(result.error ?? '登录态验证失败，未保存配置');
        return;
      }

      await loadAuthProfiles();
      form.setFieldsValue({ authStatePath: result.data.authStatePath });
      setAuthProfiles((profiles) =>
        profiles.some((profile) => profile.profileName === result.data.profileName)
          ? profiles.map((profile) =>
              profile.profileName === result.data.profileName ? { ...profile, metadata: result.data } : profile,
            )
          : [
              ...profiles,
              {
                profileName: result.data.profileName,
                authStatePath: result.data.authStatePath,
                metadata: result.data,
              },
            ],
      );
      setAuthRecording(null);
      setShowCreatePanel(false);
      setNewProfileName('');
      setNewLoginUrl('');
      setNewTargetUrl('');
      message.success('登录态已验证并保存');
    } catch {
      setCreateProfileError('无法连接到 API 服务');
    } finally {
      setCompletingRecording(false);
    }
  };

  const handleCancelAuthRecording = async () => {
    if (!authRecording) {
      setShowCreatePanel(false);
      setCreateProfileError(null);
      return;
    }

    setCancelingRecording(true);
    try {
      await fetch(
        `${API_BASE_URL}/api/auth-profiles/recordings/${encodeURIComponent(authRecording.recordingId)}/cancel`,
        { method: 'POST' },
      );
    } finally {
      setAuthRecording(null);
      setCancelingRecording(false);
      setShowCreatePanel(false);
      setCreateProfileError(null);
    }
  };

  const authVerificationLabel: Record<AuthProfileVerificationStatus, string> = {
    unknown: '未验证',
    valid: '登录态有效',
    'login-redirect': '跳转登录页',
    unauthorized: '权限不足',
    error: '验证失败',
  };

  const authVerificationColor: Record<AuthProfileVerificationStatus, string> = {
    unknown: 'default',
    valid: 'success',
    'login-redirect': 'warning',
    unauthorized: 'error',
    error: 'error',
  };

  const handleVerifyAuthProfile = async () => {
    const profile = selectedAuthProfile;
    const targetUrl = url.trim();
    if (!profile) {
      setAuthProfileVerifyError('请选择登录态配置');
      return;
    }
    if (!targetUrl) {
      setAuthProfileVerifyError('请先填写页面地址');
      return;
    }

    setAuthProfileVerifying(true);
    setAuthProfileVerifyError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth-profiles/${encodeURIComponent(profile.profileName)}/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl }),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error ?? '登录态验证失败';
        setAuthProfileVerifyError(errorMessage);
        message.error(errorMessage);
        return;
      }

      const metadata = result as AuthProfileMetadata;
      setAuthProfiles((profiles) =>
        profiles.map((item) =>
          item.profileName === metadata.profileName ? { ...item, metadata } : item,
        ),
      );

      if (metadata.verification.status === 'valid') {
        message.success('登录态验证通过');
      } else {
        message.warning(metadata.verification.message ?? authVerificationLabel[metadata.verification.status]);
      }
    } catch {
      const errorMessage = '无法连接到 API 服务';
      setAuthProfileVerifyError(errorMessage);
      message.error(errorMessage);
    } finally {
      setAuthProfileVerifying(false);
    }
  };

  const handleScan = async (values: ScanFormValues) => {
    setScanning(true);
    setScanError(null);
    setScanProgress(null);

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

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      const startResponse = await fetch(`${API_BASE_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const started = (await startResponse.json()) as ScanStartResponse;

      const immediatePayload = readImmediateScanPayload(started);
      if (immediatePayload) {
        notifyScanComplete(immediatePayload, Boolean(values.enableAi), notification);
        onReportReady(immediatePayload);
        return;
      }

      if (!startResponse.ok || !started.success || !started.data?.progressId) {
        const errorMessage = started.error ?? '扫描启动失败';
        setScanError(errorMessage);
        message.error(errorMessage);
        return;
      }

      const progressId = started.data.progressId;

      while (true) {
        const progressResponse = await fetch(`${API_BASE_URL}/api/scan/progress/${progressId}`);
        const progressPayload = (await progressResponse.json()) as ScanProgressApiResponse;

        if (!progressResponse.ok || !progressPayload.success || !progressPayload.data) {
          const errorMessage = progressPayload.error ?? '无法获取扫描进度';
          setScanError(errorMessage);
          message.error(errorMessage);
          return;
        }

        setScanProgress(progressPayload.data);

        const completedPayload = readProgressScanPayload(progressPayload.data);
        if (completedPayload) {
          notifyScanComplete(completedPayload, Boolean(values.enableAi), notification);
          onReportReady(completedPayload);
          return;
        }

        if (progressPayload.data.status === 'failed') {
          const errorMessage = progressPayload.data.error ?? '扫描失败';
          setScanError(errorMessage);
          message.error(errorMessage);
          return;
        }

        await wait(500);
      }
    } catch {
      const errorMessage = '无法连接到扫描服务，请确保 API 服务已启动';
      setScanError(errorMessage);
      message.error(errorMessage);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="page-workspace">
      <header className="workspace-hero">
        <div className="workspace-hero-inner">
          <div className="workspace-hero-copy">
            <Text className="workspace-hero-eyebrow">Evidence-first · Local-first</Text>
            <Title level={2} className="workspace-hero-title">
              前端AI Health Check工作台
            </Title>
          </div>
          <div className="capability-strip" role="list" aria-label="扫描能力">
            {HERO_CAPABILITIES.map((cap) => (
              <span key={cap} className="capability-pill" role="listitem">
                <span className="capability-pill-dot" aria-hidden />
                {cap}
              </span>
            ))}
          </div>
        </div>
      </header>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={10}>
          <Card title="开始扫描" className="panel workspace-card">
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
                <>
                  <Form.Item
                    label="项目路径"
                    name="projectPath"
                    rules={[{ required: true, message: '本地模式需填写项目路径' }]}
                    tooltip="本地项目路径，用于扫描依赖、项目质量和本地代码审查。"
                  >
                    <Input placeholder="/absolute/path/to/frontend-project" />
                  </Form.Item>
                  <Space direction="vertical" size={8} className="full-width" style={{ marginBottom: 16 }}>
                    <Button
                      onClick={() => void handleInspectLocalProject()}
                      loading={inspectingProject}
                      disabled={!projectPath.trim()}
                    >
                      检查本地项目
                    </Button>
                    {inspectProjectError && <Alert type="error" showIcon message={inspectProjectError} />}
                    {localProjectIntake && (
                      <Card size="small" title="本地项目摘要">
                        <Space direction="vertical" size={4} className="full-width">
                          <Text>包管理器：{localProjectIntake.packageManager}</Text>
                          <Text>
                            开发脚本：
                            {localProjectIntake.devScripts.length > 0
                              ? localProjectIntake.devScripts.map((script) => `${script.name} (${script.command})`).join('、')
                              : '未识别'}
                          </Text>
                          <Text>
                            框架检测：
                            {localProjectIntake.frameworkDetections.length > 0
                              ? localProjectIntake.frameworkDetections
                                  .map((item) => `${item.framework} (${item.confidence})`)
                                  .join('、')
                              : '未识别'}
                          </Text>
                          <Text>路由候选：{localProjectIntake.routeCandidates.length} 条</Text>
                        </Space>
                      </Card>
                    )}
                  </Space>
                </>
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
                  <Space direction="vertical" size={8} className="full-width" style={{ marginBottom: 16 }}>
                    <Space wrap>
                      <Button
                        onClick={() => void handleVerifyAuthProfile()}
                        loading={authProfileVerifying}
                        disabled={!selectedAuthProfile}
                      >
                        验证登录态
                      </Button>
                      {selectedAuthProfile?.metadata?.verification && (
                        <Tag color={authVerificationColor[selectedAuthProfile.metadata.verification.status]}>
                          {authVerificationLabel[selectedAuthProfile.metadata.verification.status]}
                        </Tag>
                      )}
                    </Space>
                    {authProfileVerifyError && <Alert type="error" showIcon message={authProfileVerifyError} />}
                  </Space>
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
                          onClick={() => void handleCancelAuthRecording()}
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
                          disabled={startingRecording || Boolean(authRecording)}
                        />
                        <Input
                          placeholder="登录页地址，例如 https://example.com/login"
                          value={newLoginUrl}
                          onChange={(event) => setNewLoginUrl(event.target.value)}
                          disabled={startingRecording || Boolean(authRecording)}
                        />
                        <Input
                          placeholder="目标页地址（可选，默认使用上方页面地址）"
                          value={newTargetUrl}
                          onChange={(event) => setNewTargetUrl(event.target.value)}
                          disabled={startingRecording || Boolean(authRecording)}
                        />
                        {createProfileError && <Alert type="error" showIcon message={createProfileError} />}
                        {authRecording ? (
                          <>
                            <Alert type="info" showIcon message={authRecording.message} />
                            <Button
                              type="primary"
                              block
                              loading={completingRecording}
                              onClick={() => void handleCompleteAuthRecording()}
                            >
                              我已完成登录，验证并保存
                            </Button>
                            <Button
                              block
                              loading={cancelingRecording}
                              onClick={() => void handleCancelAuthRecording()}
                            >
                              取消录制
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="primary"
                            block
                            loading={startingRecording}
                            onClick={() => void handleStartAuthRecording()}
                          >
                            {startingRecording ? '正在打开浏览器…' : '开始登录录制'}
                          </Button>
                        )}
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
                <div className="ai-status-bar ai-status-bar--warn">
                  <Tag color="warning">AI 配置未就绪</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    API Key：{aiStatus.apiKeyConfigured ? '已配置' : '未配置'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    模型：{aiStatus.model ?? '未配置'}
                  </Text>
                </div>
              )}

              {!aiStatusLoading && aiStatus?.ready && (
                <div className="ai-status-bar ai-status-bar--ready">
                  <Tag color="success">AI 配置已就绪</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {aiStatus.model ?? '默认模型'}
                  </Text>
                </div>
              )}

              <Button
                block
                loading={aiTesting}
                disabled={aiStatusLoading}
                onClick={() => void handleTestAiConnection()}
                style={{ marginBottom: aiConnectionTest ? 12 : 16 }}
              >
                {aiTesting ? '正在测试 AI 接口…' : '测试 AI 接口联通'}
              </Button>

              {aiConnectionTest && (
                <Alert
                  type={aiConnectionTest.success ? 'success' : 'error'}
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={aiConnectionTest.success ? 'AI 接口联通成功' : 'AI 接口联通失败'}
                  description={
                    aiConnectionTest.success ? (
                      <Text code>{aiConnectionTest.responsePreview ?? `${aiConnectionTest.durationMs}ms`}</Text>
                    ) : (
                      aiConnectionTest.error
                    )
                  }
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

        <Col xs={24} lg={14}>
          {scanProgress && (
            <Card title="扫描进度" className="panel workspace-card" style={{ marginBottom: 20 }}>
              <ScanProgressPanel progress={scanProgress} />
            </Card>
          )}

          {scanError && (
            <Alert
              type="error"
              showIcon
              message="扫描未完成"
              description={scanError}
              style={{ marginBottom: 20 }}
              closable
              onClose={() => setScanError(null)}
            />
          )}

          <Card title="证据采集模块" className="panel workspace-card" style={{ marginBottom: 20 }}>
            <Row gutter={[12, 12]}>
              {evidenceModules.map((item, index) => {
                const statusMeta = EVIDENCE_MODULE_STATUS_META[item.status];
                return (
                  <Col xs={24} sm={12} key={item.key}>
                    <Tooltip title={item.description} placement="top">
                      <div
                        className={`module-card ${moduleStatusClass(item.status)}`}
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <div className="module-icon">{moduleIcon[item.key]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="module-title-row">
                            <Text strong style={{ fontSize: 13 }}>
                              {item.title}
                            </Text>
                            <span className={moduleStatusDotClass(item.status)} title={statusMeta.label} />
                          </div>
                          <div className="module-caps">
                            {item.caps.map((cap) => (
                              <span key={cap} className="module-cap">
                                {cap}
                              </span>
                            ))}
                          </div>
                          <Tag color={statusMeta.color} style={{ marginTop: 8 }}>
                            {statusMeta.label}
                          </Tag>
                          {item.statusDetail && (
                            <Text
                              type="secondary"
                              ellipsis
                              style={{ display: 'block', marginTop: 4, fontSize: 11 }}
                            >
                              {item.statusDetail}
                            </Text>
                          )}
                        </div>
                      </div>
                    </Tooltip>
                  </Col>
                );
              })}
            </Row>
          </Card>

          <Card title="体检就绪度" className="panel workspace-card">
            <div className="readiness-ring-wrap">
              <Progress
                type="circle"
                percent={scanReadiness.percent}
                size={88}
                strokeColor={{ '0%': '#38bdf8', '100%': '#006eff' }}
                status={
                  scanReadiness.phase === 'scanning'
                    ? 'active'
                    : scanReadiness.percent === 100
                      ? 'success'
                      : scanReadiness.phase === 'post' && scanReadiness.percent === 0
                        ? 'exception'
                        : 'normal'
                }
              />
              <div className="readiness-checks-compact">
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
                  {scanReadiness.summary}
                </Text>
                {scanReadiness.checks.map((check) => (
                  <div key={check.key} className="readiness-check-row">
                    <span className="readiness-check-icon">{readinessIcon(check.status)}</span>
                    <Text style={{ flex: 1 }}>{check.label}</Text>
                    {check.status === 'pass' ? (
                      <Tag color="success" style={{ margin: 0 }}>
                        通过
                      </Tag>
                    ) : check.status === 'fail' ? (
                      <Tag color="error" style={{ margin: 0 }}>
                        未满足
                      </Tag>
                    ) : check.status === 'pending' ? (
                      <Tag color="processing" style={{ margin: 0 }}>
                        进行中
                      </Tag>
                    ) : (
                      <Tag style={{ margin: 0 }}>跳过</Tag>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
