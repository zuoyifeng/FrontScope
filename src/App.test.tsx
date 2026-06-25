import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const mockAiStatusReady = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  baseURL: 'https://api.openai.com/v1',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  authHeader: 'bearer',
  apiKeyConfigured: true,
  ready: true,
};

const mockAiStatusNotReady = {
  provider: 'mock',
  model: null,
  baseURL: 'https://api.openai.com/v1',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  authHeader: 'bearer',
  apiKeyConfigured: false,
  ready: false,
};

const mockAuthProfiles = {
  profiles: [
    { profileName: 'admin', authStatePath: '.frontscope/auth/admin.json' },
    { profileName: 'ops', authStatePath: '.frontscope/auth/ops.json' },
  ],
};

function mockFetch(handlers: {
  aiStatus?: typeof mockAiStatusReady | typeof mockAiStatusNotReady;
  authProfiles?: typeof mockAuthProfiles;
  onScan?: (body: unknown) => void;
  onCreateProfile?: (body: unknown) => unknown;
  onAiTest?: (body: unknown) => void;
  onScanProgress?: (progressId: string) => void;
  aiTestResult?: {
    success: boolean;
    provider: string;
    apiKeyConfigured: boolean;
    durationMs: number;
    error?: string;
    responsePreview?: string;
    model?: string;
    endpoint?: string;
  };
  scanProgress?: {
    status: 'running' | 'completed' | 'failed';
    percent: number;
    currentStepLabel?: string;
    steps: Array<{ key: string; label: string; status: string; detail?: string }>;
    result?: {
      result: Record<string, unknown>;
      scanDir: string;
      scanJsonPath: string;
      reportMarkdownPath: string;
    };
    error?: string;
  };
  createProfileFails?: boolean;
}) {
  const profileList = [...(handlers.authProfiles?.profiles ?? mockAuthProfiles.profiles)];
  const progressStore = new Map<string, NonNullable<typeof handlers.scanProgress>>();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/ai/status')) {
        return {
          ok: true,
          json: async () => handlers.aiStatus ?? mockAiStatusNotReady,
        } as Response;
      }

      if (url.endsWith('/api/auth-profiles') && (!init?.method || init.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({ profiles: profileList }),
        } as Response;
      }

      if (url.endsWith('/api/auth-profiles') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        handlers.onCreateProfile?.(body);
        if (handlers.createProfileFails) {
          return {
            ok: false,
            status: 400,
            json: async () => ({ success: false, error: 'profile name is invalid', field: 'profileName' }),
          } as Response;
        }
        const createdProfile = {
          profileName: body.profileName,
          authStatePath: `.frontscope/auth/${body.profileName}.json`,
        };
        profileList.push(createdProfile);
        return {
          ok: true,
          json: async () => createdProfile,
        } as Response;
      }

      if (url.endsWith('/api/scan') && init?.method === 'POST') {
        handlers.onScan?.(JSON.parse(String(init?.body)));
        const progressId = 'progress-test-1';
        progressStore.set(progressId, handlers.scanProgress ?? {
          status: 'completed',
          percent: 100,
          currentStepLabel: '生成报告',
          steps: [
            { key: 'page-session', label: '页面会话采集', status: 'completed' },
            { key: 'report', label: '生成报告', status: 'completed' },
          ],
          result: {
            result: {
              id: 'scan-1',
              scanMode: 'online',
              projectEvidenceEnabled: false,
              errors: [],
              input: { enableAi: true, url: 'http://localhost:5173' },
              aiRunMeta: { status: 'success', model: 'gpt-4o-mini', durationMs: 100, issueCount: 0 },
            },
            scanDir: '/tmp/scan',
            scanJsonPath: '/tmp/scan/scan.json',
            reportMarkdownPath: '/tmp/scan/report.md',
          },
        });
        handlers.onScanProgress?.(progressId);
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { progressId },
          }),
        } as Response;
      }

      if (url.includes('/api/scan/progress/')) {
        const progressId = url.split('/').pop() ?? '';
        const progress = progressStore.get(progressId);
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              progressId,
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              ...(progress ?? {
                status: 'failed',
                percent: 0,
                steps: [],
                error: 'progress not found',
              }),
            },
          }),
        } as Response;
      }

      if (url.endsWith('/api/ai/test')) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        handlers.onAiTest?.(body);
        return {
          ok: true,
          json: async () =>
            handlers.aiTestResult ?? {
              success: true,
              provider: 'openai',
              model: 'gpt-4o-mini',
              endpoint: 'https://api.openai.com/v1/chat/completions',
              apiKeyConfigured: true,
              durationMs: 128,
              responsePreview: '{"ok":true}',
            },
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

async function switchToLocalMode() {
  fireEvent.click(screen.getByText('本地模式'));
  await waitFor(() => {
    expect(screen.getByPlaceholderText('/absolute/path/to/frontend-project')).toBeInTheDocument();
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the Chinese FrontScope scan workspace', async () => {
    mockFetch({ aiStatus: mockAiStatusNotReady });
    render(<App />);

    expect(screen.getByText('FrontScope')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '前端证据体检工作台' })).toBeInTheDocument();
    expect(screen.getAllByText('开始扫描')).toHaveLength(2);
    expect(screen.getByText('证据采集模块')).toBeInTheDocument();
    expect(screen.getByText('运行时诊断')).toBeInTheDocument();
    expect(screen.getByText('Network 资源诊断')).toBeInTheDocument();
    expect(screen.getAllByText('未就绪').length).toBeGreaterThan(0);
    expect(screen.getByText('未满足')).toBeInTheDocument();
    expect(screen.getByText('生成 AI 诊断')).toBeInTheDocument();
    expect(screen.getByText('本地模式')).toBeInTheDocument();
    expect(screen.getByText('线上模式')).toBeInTheDocument();
  });

  it('does not render AI credential inputs', async () => {
    mockFetch({ aiStatus: mockAiStatusReady });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI 配置已就绪')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('模型')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('鉴权方式')).not.toBeInTheDocument();
  });

  it('shows config-not-ready state when AI status is not ready', async () => {
    mockFetch({ aiStatus: mockAiStatusNotReady });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI 配置未就绪')).toBeInTheDocument();
    });

    expect(screen.getByText('API Key：未配置')).toBeInTheDocument();
    expect(screen.getByText('模型：未配置')).toBeInTheDocument();
  });

  it('submits enableAi true and no ai object when AI status is ready', async () => {
    let scanBody: unknown;
    mockFetch({
      aiStatus: mockAiStatusReady,
      onScan: (body) => {
        scanBody = body;
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI 配置已就绪')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('http://localhost:5173 或 https://example.com'), {
      target: { value: 'http://localhost:5173' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始扫描' }));

    await waitFor(() => {
      expect(scanBody).toBeDefined();
    });

    expect(scanBody).toMatchObject({
      scanMode: 'online',
      url: 'http://localhost:5173',
      enableAi: true,
    });
    expect(scanBody).not.toHaveProperty('ai');
    expect(scanBody).not.toHaveProperty('viewport');
  });

  it('local mode renders project path input', async () => {
    mockFetch({ aiStatus: mockAiStatusNotReady });
    render(<App />);

    await switchToLocalMode();

    expect(screen.getByPlaceholderText('/absolute/path/to/frontend-project')).toBeInTheDocument();
    expect(screen.queryByText('登录态配置')).not.toBeInTheDocument();
    expect(screen.getByText('请填写项目路径')).toBeInTheDocument();
  });

  it('online mode renders auth profile selector', async () => {
    mockFetch({ aiStatus: mockAiStatusNotReady, authProfiles: mockAuthProfiles });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('登录态配置')).toBeInTheDocument();
    });

    expect(screen.getByText('新建登录态配置')).toBeInTheDocument();
  });

  it('does not render viewport controls', async () => {
    mockFetch({ aiStatus: mockAiStatusNotReady });
    render(<App />);

    expect(screen.queryByText('扫描视口')).not.toBeInTheDocument();
    expect(screen.queryByText('桌面端')).not.toBeInTheDocument();
    expect(screen.queryByText('移动端')).not.toBeInTheDocument();
  });

  it('submitted payload includes scanMode and omits viewport in local mode', async () => {
    let scanBody: unknown;
    mockFetch({
      aiStatus: mockAiStatusNotReady,
      onScan: (body) => {
        scanBody = body;
      },
    });

    render(<App />);
    await switchToLocalMode();

    fireEvent.change(screen.getByPlaceholderText('http://localhost:5173 或 https://example.com'), {
      target: { value: 'http://localhost:5173' },
    });
    fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/frontend-project'), {
      target: { value: '/tmp/project' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始扫描' }));

    await waitFor(() => {
      expect(scanBody).toBeDefined();
    });

    expect(scanBody).toMatchObject({
      scanMode: 'local',
      url: 'http://localhost:5173',
      projectPath: '/tmp/project',
    });
    expect(scanBody).not.toHaveProperty('viewport');
    expect(scanBody).not.toHaveProperty('authStatePath');
  });

  it('online mode loads profile list', async () => {
    mockFetch({ aiStatus: mockAiStatusNotReady, authProfiles: mockAuthProfiles });
    render(<App />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth-profiles'));
    });
  });

  it('create profile calls POST with profile name, login URL, and target URL', async () => {
    let createBody: unknown;
    mockFetch({
      aiStatus: mockAiStatusNotReady,
      authProfiles: { profiles: [] },
      onCreateProfile: (body) => {
        createBody = body;
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('新建登录态配置')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('新建登录态配置'));
    fireEvent.change(screen.getByPlaceholderText('配置名称，例如 admin'), {
      target: { value: 'staging-admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('登录页地址，例如 https://example.com/login'), {
      target: { value: 'https://example.com/login' },
    });
    fireEvent.change(screen.getByPlaceholderText('目标页地址（可选，默认使用上方页面地址）'), {
      target: { value: 'https://example.com/app' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成登录态' }));

    await waitFor(() => {
      expect(createBody).toBeDefined();
    });

    expect(createBody).toEqual({
      profileName: 'staging-admin',
      loginUrl: 'https://example.com/login',
      targetUrl: 'https://example.com/app',
    });
  });

  it('successful create selects returned auth path', async () => {
    mockFetch({
      aiStatus: mockAiStatusNotReady,
      authProfiles: { profiles: [] },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('新建登录态配置')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('新建登录态配置'));
    fireEvent.change(screen.getByPlaceholderText('配置名称，例如 admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('登录页地址，例如 https://example.com/login'), {
      target: { value: 'https://example.com/login' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成登录态' }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('配置名称，例如 admin')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
  });

  it('failed create shows error state', async () => {
    mockFetch({
      aiStatus: mockAiStatusNotReady,
      authProfiles: { profiles: [] },
      createProfileFails: true,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('新建登录态配置')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('新建登录态配置'));
    fireEvent.change(screen.getByPlaceholderText('配置名称，例如 admin'), {
      target: { value: '../secret' },
    });
    fireEvent.change(screen.getByPlaceholderText('登录页地址，例如 https://example.com/login'), {
      target: { value: 'https://example.com/login' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成登录态' }));

    await waitFor(() => {
      expect(screen.getByText('profile name is invalid')).toBeInTheDocument();
    });
  });

  it('runs AI connectivity test and shows success result', async () => {
    let aiTestBody: unknown;
    mockFetch({
      aiStatus: mockAiStatusReady,
      onAiTest: (body) => {
        aiTestBody = body;
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI 配置已就绪')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '测试 AI 接口联通' }));

    await waitFor(() => {
      expect(screen.getByText('AI 接口联通成功')).toBeInTheDocument();
      expect(screen.getByText('{"ok":true}')).toBeInTheDocument();
    });

    expect(aiTestBody).toEqual({});
  });
});
