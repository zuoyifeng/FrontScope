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
  createProfileFails?: boolean;
}) {
  const profileList = [...(handlers.authProfiles?.profiles ?? mockAuthProfiles.profiles)];

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

      if (url.endsWith('/api/scan')) {
        handlers.onScan?.(JSON.parse(String(init?.body)));
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              scanDir: '/tmp/scan',
              scanJsonPath: '/tmp/scan/scan.json',
              reportMarkdownPath: '/tmp/scan/report.md',
              result: {
                id: 'scan-1',
                scanMode: 'online',
                projectEvidenceEnabled: false,
                errors: [],
                input: { enableAi: true, url: 'http://localhost:5173' },
                aiRunMeta: { status: 'success', model: 'gpt-4o-mini', durationMs: 100, issueCount: 0 },
              },
            },
          }),
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
});
