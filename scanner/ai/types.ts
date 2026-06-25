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
  suggestion: string;
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
