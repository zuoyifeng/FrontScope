import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { NormalizedScanInput } from '../types.js';

const scanAiConfigSchema = z.object({
  baseURL: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  authHeader: z.enum(['bearer', 'api-key']).optional(),
});

const rawInputSchema = z.object({
  scanMode: z.enum(['local', 'online']).optional(),
  projectPath: z.string().optional(),
  url: z.string().min(1),
  viewport: z.enum(['desktop', 'mobile']).optional(),
  pageName: z.string().optional(),
  outputDir: z.string().optional(),
  authStatePath: z.string().optional(),
  enableAi: z.boolean().optional(),
  enableMemory: z.boolean().optional(),
  memoryReloadRounds: z.number().int().min(0).max(20).optional(),
  ai: scanAiConfigSchema.optional(),
});

export function validateInput(rawInput: unknown): NormalizedScanInput {
  const input = rawInputSchema.parse(rawInput);

  if (!input.url.startsWith('http://') && !input.url.startsWith('https://')) {
    throw new Error('URL 必须以 http:// 或 https:// 开头');
  }

  const scanMode = input.scanMode ?? (input.projectPath ? 'local' : 'online');
  const viewport = input.viewport ?? 'desktop';

  if (scanMode === 'local' && !input.projectPath) {
    throw new Error('local mode requires projectPath');
  }

  // Online mode never reads local project files; ignore a stale projectPath
  // from old forms or saved requests before path existence checks.
  let projectPath: string | undefined;
  if (scanMode === 'local' && input.projectPath) {
    projectPath = resolve(input.projectPath);
    if (!existsSync(projectPath)) {
      throw new Error(`项目路径不存在: ${projectPath}`);
    }
  }

  let authStatePath: string | undefined;
  if (input.authStatePath) {
    authStatePath = resolve(input.authStatePath);
    if (!existsSync(authStatePath)) {
      throw new Error(`登录态文件不存在: ${authStatePath}`);
    }
  }

  const ai = input.ai
    ? {
        ...input.ai,
        baseURL: input.ai.baseURL?.trim() || undefined,
        apiKey: input.ai.apiKey?.trim() || undefined,
        model: input.ai.model?.trim() || undefined,
      }
    : undefined;

  if (input.ai) {
    if (!ai?.apiKey) {
      throw new Error('请求中的 AI 配置缺少 API Key。');
    }
    if (!ai?.model) {
      throw new Error('请求中的 AI 配置缺少模型名称，例如 mimo-v2.5-pro。');
    }
    if (!ai.baseURL) {
      throw new Error('请求中的 AI 配置缺少 Base URL，例如 https://api.xiaomimimo.com/v1。');
    }
  }

  return {
    ...input,
    scanMode,
    viewport,
    projectPath,
    authStatePath,
    ai,
  };
}
