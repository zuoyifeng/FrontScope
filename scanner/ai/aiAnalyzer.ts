import { z } from 'zod';
import type { AiProvider } from './aiProvider.js';
import type { AiDiagnosis, CompactEvidenceItem } from './types.js';

const aiIssueSchema = z.object({
  title: z.string().min(1),
  severity: z.enum(['high', 'medium', 'low']),
  category: z.enum(['runtime', 'performance', 'network', 'memory', 'dependency', 'code-quality', 'project']),
  evidenceIds: z.array(z.string().min(1)).min(1),
  possibleCause: z.string().min(1),
  suggestion: z.string().min(1),
  optimizationDirection: z.string().min(8),
  implementationSteps: z.array(z.string().min(1)).min(2).max(8),
  codeHints: z.string().min(1).optional(),
  verifyMethod: z.string().min(1),
});

const aiDiagnosisSchema = z.object({
  summary: z.string().min(1),
  healthLevel: z.enum(['good', 'warning', 'critical']),
  topIssues: z.array(aiIssueSchema),
  nextActions: z.array(z.string()),
});

/** Strip markdown fences / prose wrappers so provider quirks still parse. */
export function normalizeRawAiOutput(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(trimmed);
  if (fenced) {
    return fenced[1].trim();
  }

  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    return trimmed.slice(jsonStart, jsonEnd + 1);
  }

  return trimmed;
}

export interface AnalyzeWithAiResult {
  diagnosis: AiDiagnosis;
  rawOutput: string;
}

export function parseAiDiagnosis(rawOutput: string, knownEvidenceIds: Set<string>): AiDiagnosis {
  const parsed = aiDiagnosisSchema.parse(JSON.parse(normalizeRawAiOutput(rawOutput)));

  for (const issue of parsed.topIssues) {
    if (issue.evidenceIds.length === 0) {
      throw new Error('AI issue must reference at least one evidence id');
    }

    for (const evidenceId of issue.evidenceIds) {
      if (!knownEvidenceIds.has(evidenceId)) {
        throw new Error(`AI issue references unknown evidence id: ${evidenceId}`);
      }
    }
  }

  return parsed;
}

export interface AnalyzeWithAiOptions {
  evidence: CompactEvidenceItem[];
  provider: AiProvider;
}

export async function analyzeWithAi(options: AnalyzeWithAiOptions): Promise<AnalyzeWithAiResult> {
  const rawOutput = await options.provider.generateDiagnosis({
    evidence: options.evidence,
  });

  try {
    return {
      diagnosis: parseAiDiagnosis(rawOutput, new Set(options.evidence.map((item) => item.id))),
      rawOutput,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}。原始返回预览: ${rawOutput.slice(0, 500)}`);
  }
}
