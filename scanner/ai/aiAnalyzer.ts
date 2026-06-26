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
  nextActions: z.array(z.string()).default([]),
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

/**
 * Close truncated strings and brackets when the model hits output limits mid-JSON.
 * This mirrors failures seen with long online-scan payloads on Mimo/OpenAI-compatible APIs.
 */
export function repairPossiblyTruncatedJson(raw: string): string {
  let text = normalizeRawAiOutput(raw).trim();
  if (!text) return text;

  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
    }
  }
  if (inString) {
    text += '"';
  }

  const stack: string[] = [];
  inString = false;
  escaped = false;
  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') stack.pop();
  }

  while (stack.length > 0) {
    text += stack.pop();
  }

  return text;
}

function parseJsonWithRepair(rawOutput: string): unknown {
  const normalized = normalizeRawAiOutput(rawOutput);
  try {
    return JSON.parse(normalized);
  } catch {
    return JSON.parse(repairPossiblyTruncatedJson(rawOutput));
  }
}

function sanitizeEvidenceIds(issue: z.infer<typeof aiIssueSchema>, knownEvidenceIds: Set<string>, fallbackId: string) {
  const validIds = issue.evidenceIds.filter((id) => knownEvidenceIds.has(id));
  return {
    ...issue,
    evidenceIds: validIds.length > 0 ? validIds : [fallbackId],
  };
}

export interface AnalyzeWithAiResult {
  diagnosis: AiDiagnosis;
  rawOutput: string;
}

export function parseAiDiagnosis(rawOutput: string, knownEvidenceIds: Set<string>): AiDiagnosis {
  const fallbackId = knownEvidenceIds.values().next().value;
  if (!fallbackId) {
    throw new Error('AI diagnosis requires at least one compact evidence item');
  }

  const parsed = aiDiagnosisSchema.parse(parseJsonWithRepair(rawOutput));
  const topIssues = parsed.topIssues
    .map((issue) => sanitizeEvidenceIds(issue, knownEvidenceIds, fallbackId))
    .filter((issue) => issue.evidenceIds.length > 0);

  if (topIssues.length === 0) {
    throw new Error('AI diagnosis did not contain any valid issues after evidence id sanitization');
  }

  return {
    ...parsed,
    topIssues,
  };
}

export interface AnalyzeWithAiOptions {
  evidence: CompactEvidenceItem[];
  provider: AiProvider;
}

export async function analyzeWithAi(options: AnalyzeWithAiOptions): Promise<AnalyzeWithAiResult> {
  if (options.evidence.length === 0) {
    throw new Error('AI diagnosis requires at least one compact evidence item');
  }

  const knownEvidenceIds = new Set(options.evidence.map((item) => item.id));
  let rawOutput = await options.provider.generateDiagnosis({
    evidence: options.evidence,
  });

  try {
    return {
      diagnosis: parseAiDiagnosis(rawOutput, knownEvidenceIds),
      rawOutput,
    };
  } catch (firstError) {
    if (options.evidence.length <= 20) {
      const detail = firstError instanceof Error ? firstError.message : String(firstError);
      throw new Error(`${detail}。原始返回预览: ${rawOutput.slice(0, 500)}`);
    }

    rawOutput = await options.provider.generateDiagnosis({
      evidence: options.evidence.slice(0, 20),
    });

    try {
      return {
        diagnosis: parseAiDiagnosis(rawOutput, knownEvidenceIds),
        rawOutput,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${detail}。原始返回预览: ${rawOutput.slice(0, 500)}`);
    }
  }
}
