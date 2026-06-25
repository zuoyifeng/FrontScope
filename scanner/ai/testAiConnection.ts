import { describeAiConfig, resolveLayeredAiConfig } from './config.js';
import { testOpenAiConnection } from './openaiProvider.js';

const RESPONSE_PREVIEW_LIMIT = 120;

export interface AiConnectionTestResult {
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

export async function runAiConnectionTest(options: {
  configPath?: string;
  projectPath?: string;
} = {}): Promise<AiConnectionTestResult> {
  const config = resolveLayeredAiConfig({
    configPath: options.configPath,
    projectPath: options.projectPath,
  });
  const described = describeAiConfig(config);
  const baseMeta = {
    provider: described.provider,
    model: described.model,
    baseURL: described.baseURL,
    endpoint: described.endpoint,
    authHeader: described.authHeader,
    apiKeyConfigured: described.apiKeyConfigured,
    durationMs: 0,
  };

  if (config.provider === 'mock') {
    return {
      ...baseMeta,
      success: false,
      error:
        '当前 AI provider 为 mock，无法做真实联通测试。请在 frontscope.config.json 或环境变量中配置 openai provider。',
    };
  }

  if (!config.apiKey) {
    return {
      ...baseMeta,
      success: false,
      error: '缺少 API Key。请在 frontscope.config.json 或环境变量中配置。',
    };
  }

  if (!config.model) {
    return {
      ...baseMeta,
      success: false,
      error: '缺少模型名称。请在 frontscope.config.json 或环境变量中配置 ai.model。',
    };
  }

  try {
    const { content, durationMs } = await testOpenAiConnection({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      authHeader: config.authHeader,
      model: config.model,
      timeoutMs: config.timeoutMs,
    });

    return {
      ...baseMeta,
      success: true,
      durationMs,
      responsePreview: content.slice(0, RESPONSE_PREVIEW_LIMIT),
    };
  } catch (error) {
    return {
      ...baseMeta,
      success: false,
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
