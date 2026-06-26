import { resolveAiConfig, type AiConfig, type ResolveAiConfigOptions } from './config.js';
import { createOpenAiProvider } from './openaiProvider.js';
import type { AiDiagnosisInput } from './types.js';

export interface AiProvider {
  generateDiagnosis(input: AiDiagnosisInput): Promise<string>;
}

export function createMockAiProvider(): AiProvider {
  return {
    async generateDiagnosis(input) {
      const firstEvidence = input.evidence[0];
      return JSON.stringify({
        summary: firstEvidence ? `基于 ${input.evidence.length} 条证据生成诊断。` : '当前证据不足，无法生成明确诊断。',
        healthLevel: firstEvidence ? 'warning' : 'good',
        topIssues: firstEvidence
          ? [
              {
                title: '需要优先处理的前端健康问题',
                severity: 'medium',
                category: firstEvidence.category,
                evidenceIds: [firstEvidence.id],
                possibleCause: '该问题来自自动采集证据，需要结合项目上下文确认根因。',
                suggestion: '先定位证据对应的页面或配置，再做最小修复。',
                optimizationDirection: '以最小改动消除当前证据指出的风险，避免在根因未确认前做大范围重构。',
                implementationSteps: [
                  '根据 evidence id 在报告中定位原始证据与受影响模块。',
                  '在本地复现问题并做最小修复（组件、配置或依赖层面）。',
                  '重新运行 FrontScope 扫描，确认相关 evidence 消失或指标改善。',
                ],
                codeHints: firstEvidence.detail,
                verifyMethod: '重新运行 FrontScope 扫描并确认该证据消失或指标改善。',
              },
            ]
          : [],
        nextActions: firstEvidence ? ['查看报告中的证据项并制定修复顺序'] : ['补充运行时或项目证据后再生成 AI 诊断'],
      });
    },
  };
}

/**
 * Build an AI provider from a resolved config object.
 * Throws a clear, actionable error when a real provider is missing credentials.
 */
export function createAiProvider(config: AiConfig): AiProvider {
  if (config.provider === 'mock') {
    return createMockAiProvider();
  }

  if (config.provider === 'openai') {
    if (!config.apiKey) {
      throw new Error(
        'AI provider "openai" 缺少 apiKey。请在 frontscope.config.json 或环境变量中配置 API Key。',
      );
    }
    if (!config.model) {
      throw new Error('AI provider "openai" 缺少 model。请在 frontscope.config.json 的 ai.model 配置，例如 "gpt-4o-mini"。');
    }

    return createOpenAiProvider({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      authHeader: config.authHeader,
      model: config.model,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
    });
  }

  throw new Error(`不支持的 AI provider: ${String(config.provider)}`);
}

/**
 * Convenience factory: resolve config from file + env, then build a provider.
 */
export function createAiProviderFromConfig(options: ResolveAiConfigOptions = {}): AiProvider {
  return createAiProvider(resolveAiConfig(options));
}
