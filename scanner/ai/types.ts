export type AiHealthLevel = 'good' | 'warning' | 'critical';
export type AiIssueSeverity = 'high' | 'medium' | 'low';
export type AiIssueCategory =
  | 'runtime'
  | 'performance'
  | 'network'
  | 'memory'
  | 'dependency'
  | 'code-quality'
  | 'project';

export interface CompactEvidenceItem {
  id: string;
  category: AiIssueCategory;
  summary: string;
  detail?: string;
}

export interface AiIssue {
  title: string;
  severity: AiIssueSeverity;
  category: AiIssueCategory;
  evidenceIds: string[];
  possibleCause: string;
  /** 一句话修复方向，面向工程师快速扫读 */
  suggestion: string;
  /** 优化策略：说明为什么要这么改、预期收益与取舍 */
  optimizationDirection: string;
  /** 可落地的实施步骤，按执行顺序排列 */
  implementationSteps: string[];
  /** 代码/配置层面的提示；仅当证据中出现文件、规则、URL 等可引用信息时填写 */
  codeHints?: string;
  verifyMethod: string;
}

export interface AiDiagnosis {
  summary: string;
  healthLevel: AiHealthLevel;
  topIssues: AiIssue[];
  nextActions: string[];
}

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

export interface AiProviderConfig {
  provider: 'mock' | 'openai';
  baseURL?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface AiDiagnosisInput {
  evidence: CompactEvidenceItem[];
}
