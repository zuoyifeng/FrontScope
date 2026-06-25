import { analyzeWithAi } from './aiAnalyzer.js';
import { createAiProvider, type AiProvider } from './aiProvider.js';
import { DEFAULT_OPENAI_BASE_URL, describeAiConfig, resolveEffectiveAiConfig, type AiConfig } from './config.js';
import type { AiDiagnosis, CompactEvidenceItem } from './types.js';

export type AiRunStatus = 'success' | 'failed';

export interface AiRunMeta {
  enabled: boolean;
  status?: AiRunStatus;
  provider?: string;
  model?: string;
  baseURL?: string;
  endpoint?: string;
  authHeader?: string;
  apiKeyConfigured?: boolean;
  evidenceCount?: number;
  durationMs?: number;
  error?: string;
  rawResponsePreview?: string;
  issueCount?: number;
}

export interface AiDiagnosisRunResult {
  diagnosis?: AiDiagnosis;
  meta: AiRunMeta;
}

const RAW_PREVIEW_LIMIT = 2000;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildMetaFromConfig(config: AiConfig, evidenceCount: number): AiRunMeta {
  const described = describeAiConfig(config);
  return {
    enabled: true,
    provider: described.provider,
    model: described.model,
    baseURL: described.baseURL,
    endpoint: described.endpoint,
    authHeader: described.authHeader,
    apiKeyConfigured: described.apiKeyConfigured,
    evidenceCount,
  };
}

function logAiRun(meta: AiRunMeta): void {
  if (!meta.enabled) return;

  const status = meta.status ?? 'pending';
  console.log(
    `[FrontScope AI] ${status} provider=${meta.provider} model=${meta.model ?? 'n/a'} endpoint=${meta.endpoint} evidence=${meta.evidenceCount ?? 0} duration=${meta.durationMs ?? 0}ms`,
  );
  if (meta.error) {
    console.error(`[FrontScope AI] error: ${meta.error}`);
  }
}

export async function runAiDiagnosis(options: {
  evidence: CompactEvidenceItem[];
  configPath?: string;
  aiProvider?: AiProvider;
  aiConfigOverride?: Partial<AiConfig>;
}): Promise<AiDiagnosisRunResult> {
  const evidenceCount = options.evidence.length;

  if (options.aiProvider) {
    const startedAt = Date.now();
    const baseMeta: AiRunMeta = {
      enabled: true,
      provider: 'injected',
      evidenceCount,
      apiKeyConfigured: true,
    };

    try {
      const { diagnosis, rawOutput } = await analyzeWithAi({
        evidence: options.evidence,
        provider: options.aiProvider,
      });
      const meta: AiRunMeta = {
        ...baseMeta,
        status: 'success',
        durationMs: Date.now() - startedAt,
        issueCount: diagnosis.topIssues.length,
        rawResponsePreview: rawOutput.slice(0, RAW_PREVIEW_LIMIT),
      };
      logAiRun(meta);
      return { diagnosis, meta };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const meta: AiRunMeta = {
        ...baseMeta,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: message,
      };
      logAiRun(meta);
      return { meta };
    }
  }

  const config = resolveEffectiveAiConfig({
    configPath: options.configPath,
    override: options.aiConfigOverride,
  });
  const baseMeta = buildMetaFromConfig(config, evidenceCount);

  if (config.provider === 'mock') {
    return {
      meta: {
        ...baseMeta,
        status: 'failed',
        error:
          'AI provider 为 mock。请在扫描表单填写 Base URL / API Key / 模型，或在 frontscope.config.json 配置 openai provider。',
      },
    };
  }

  if (!config.apiKey) {
    return {
      meta: {
        ...baseMeta,
        status: 'failed',
        error:
          'AI provider 缺少 apiKey。请在扫描表单填写 API Key，或配置 frontscope.config.json / 环境变量。',
      },
    };
  }

  if (!config.model) {
    return {
      meta: {
        ...baseMeta,
        status: 'failed',
        error: 'AI provider 缺少 model。请在扫描表单填写模型，例如 mimo-v2.5-pro。',
      },
    };
  }

  const startedAt = Date.now();
  try {
    const provider = createAiProvider(config);
    const { diagnosis, rawOutput } = await analyzeWithAi({ evidence: options.evidence, provider });
    const meta: AiRunMeta = {
      ...baseMeta,
      status: 'success',
      durationMs: Date.now() - startedAt,
      issueCount: diagnosis.topIssues.length,
      rawResponsePreview: rawOutput.slice(0, RAW_PREVIEW_LIMIT),
    };
    logAiRun(meta);
    return { diagnosis, meta };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const meta: AiRunMeta = {
      ...baseMeta,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: message,
    };
    logAiRun(meta);
    return { meta };
  }
}

export function buildAiEndpoint(baseURL?: string): string {
  const root = trimTrailingSlash(baseURL ?? DEFAULT_OPENAI_BASE_URL);
  return `${root}/chat/completions`;
}
