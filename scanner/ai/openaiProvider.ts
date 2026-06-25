import { DEFAULT_OPENAI_BASE_URL } from './config.js';
import { buildDiagnosisMessages } from './prompt.js';
import type { AiProvider } from './aiProvider.js';

export type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

export type AuthHeaderStyle = 'bearer' | 'api-key';

export interface OpenAiProviderOptions {
  baseURL?: string;
  apiKey: string;
  /** `api-key` 用于小米 Mimo 等使用 api-key 请求头的兼容端点 */
  authHeader?: AuthHeaderStyle;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Injected for tests so the provider never hits the network in unit tests. */
  fetchImpl?: FetchImpl;
}

const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_OUTPUT_TOKENS = 2000;
const DEFAULT_TIMEOUT_MS = 60_000;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

function extractContent(data: unknown): string | undefined {
  const response = data as ChatCompletionResponse;
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('');
  }
  return undefined;
}

function buildAuthHeaders(apiKey: string, authHeader: AuthHeaderStyle): Record<string, string> {
  if (authHeader === 'api-key') {
    return { 'api-key': apiKey };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

function buildRequestBody(options: OpenAiProviderOptions, system: string, user: string): Record<string, unknown> {
  const maxTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const authHeader = options.authHeader ?? 'bearer';
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  if (authHeader === 'api-key') {
    return {
      model: options.model,
      messages,
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      max_completion_tokens: maxTokens,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    };
  }

  return {
    model: options.model,
    messages,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Create an AI provider that talks to any OpenAI-compatible Chat Completions
 * endpoint (OpenAI, DeepSeek, local servers, ...). It relies only on `fetch`
 * so no provider SDK is required, and never logs the apiKey.
 */
export function createOpenAiProvider(options: OpenAiProviderOptions): AiProvider {
  const baseURL = trimTrailingSlash(options.baseURL ?? DEFAULT_OPENAI_BASE_URL);
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));

  return {
    async generateDiagnosis(input) {
      const { system, user } = buildDiagnosisMessages(input.evidence);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      try {
        const authHeader = options.authHeader ?? 'bearer';
        const response = await fetchImpl(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildAuthHeaders(options.apiKey, authHeader),
          },
          body: JSON.stringify(buildRequestBody(options, system, user)),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await safeReadText(response);
          throw new Error(`AI provider 请求失败: ${response.status} ${response.statusText} ${detail}`.trim());
        }

        const content = extractContent(await response.json());
        if (!content) {
          throw new Error('AI provider 返回内容为空，无法解析诊断结果。');
        }

        return content;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`AI provider 请求超时（${options.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms）。`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
