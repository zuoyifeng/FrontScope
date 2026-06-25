export type EvidenceModuleKey = 'runtime' | 'performance' | 'network' | 'project' | 'memory' | 'ai';

export type EvidenceModuleStatus =
  | 'pending'
  | 'skipped'
  | 'scanning'
  | 'collected'
  | 'failed'
  | 'blocked';

export interface EvidenceModuleView {
  key: EvidenceModuleKey;
  title: string;
  description: string;
  status: EvidenceModuleStatus;
  statusDetail?: string;
}

export type ReadinessCheckStatus = 'pass' | 'fail' | 'pending' | 'skipped';

export interface ReadinessCheck {
  key: string;
  label: string;
  status: ReadinessCheckStatus;
  detail?: string;
}

export interface ScanReadinessView {
  phase: 'pre' | 'scanning' | 'post';
  percent: number;
  checks: ReadinessCheck[];
  summary: string;
}

export type HealthLevel = 'good' | 'warning' | 'critical';
export type IssueSeverity = 'high' | 'medium' | 'low';
export type QualityStatus = 'ok' | 'issues' | 'skipped' | 'error';

export interface AiIssueView {
  title: string;
  severity: IssueSeverity;
  category: string;
  evidenceIds: string[];
  possibleCause: string;
  suggestion: string;
  optimizationDirection?: string;
  implementationSteps?: string[];
  codeHints?: string;
  verifyMethod: string;
}

export interface AiDiagnosisView {
  summary: string;
  healthLevel: HealthLevel;
  topIssues: AiIssueView[];
  nextActions: string[];
}

export interface AiRunMetaView {
  enabled: boolean;
  status?: 'success' | 'failed';
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

export interface LighthouseView {
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  metrics: {
    largestContentfulPaint?: string;
    cumulativeLayoutShift?: string;
    totalBlockingTime?: string;
    speedIndex?: string;
  };
  audits: { id: string; title: string; score: number | null; displayValue?: string }[];
}

export type TargetUrlMismatchReason =
  | 'redirected-to-login'
  | 'different-origin'
  | 'different-path'
  | 'unknown';

export interface RuntimeView {
  requestedUrl?: string;
  title: string;
  finalUrl: string;
  screenshotPath: string;
  targetUrlMatched?: boolean;
  targetMismatchReason?: TargetUrlMismatchReason;
  consoleErrors: { type: string; text: string }[];
  pageErrors: { message: string }[];
  requestFailures: { url: string; method: string; failureText?: string }[];
  httpErrors: { url: string; status: number; statusText: string; method: string }[];
}

export interface NetworkSummaryItemView {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  transferSize: number;
  durationMs?: number;
  fromCache: boolean;
}

export interface NetworkView {
  summary: {
    totalRequests: number;
    failedRequests: number;
    totalTransferSize: number;
    cacheHitRatio: number;
    slowRequests: NetworkSummaryItemView[];
    largeResources: NetworkSummaryItemView[];
  };
  requests: { url: string; method: string; status?: number; failureText?: string; statusText?: string }[];
}

export interface TraceView {
  tracePath: string;
  totalDurationMs: number;
  longTasks: { topLevelEvent: string; duration: number; start: number }[];
  layoutShifts: { start: number; score: number; impactedNodes: string[] }[];
  categoryDurations: { scripting: number; rendering: number; painting: number; loading: number };
}

export interface ProjectQualityView {
  typecheck: { status: QualityStatus; errorCount: number; messages: string[]; skippedReason?: string };
  eslint: {
    status: QualityStatus;
    errorCount: number;
    warningCount: number;
    topFiles: { file: string; errorCount: number; warningCount: number }[];
    skippedReason?: string;
  };
  audit: {
    status: QualityStatus;
    total: number;
    vulnerabilities: { critical: number; high: number; moderate: number; low: number; info: number };
    skippedReason?: string;
  };
  unused: {
    status: QualityStatus;
    unusedFiles: number;
    unusedDependencies: number;
    unusedExports: number;
    skippedReason?: string;
  };
  circular: { status: QualityStatus; circularCount: number; cycles: string[][]; skippedReason?: string };
  codeReview: {
    status: QualityStatus;
    scannedFiles: number;
    findings: { ruleId: string; severity: IssueSeverity; file: string; line: number; message: string }[];
    skippedReason?: string;
  };
}

export interface MemoryView {
  status: QualityStatus;
  baseline?: {
    path: string;
    fileSizeBytes: number;
    stats: {
      nodeCount: number;
      edgeCount: number;
      totalSizeBytes: number;
      detachedNodeCount: number;
      topConstructors: { name: string; count: number; selfSizeBytes: number }[];
    };
  };
  comparison?: {
    reloadRounds: number;
    nodeCountDelta: number;
    detachedNodeCountDelta: number;
    totalSizeBytesDelta: number;
    suspectedLeak: boolean;
  };
  notes: string[];
  skippedReason?: string;
}

export type ScanComparisonDirectionView = 'improved' | 'regressed' | 'unchanged' | 'unknown';

export interface ScanMetricComparisonView {
  key: string;
  label: string;
  before?: number;
  after?: number;
  delta?: number;
  unit?: string;
  direction: ScanComparisonDirectionView;
}

export interface ScanComparisonView {
  baseScanId: string;
  targetScanId: string;
  baseCreatedAt: string;
  targetCreatedAt: string;
  summary: {
    improved: number;
    regressed: number;
    unchanged: number;
  };
  metrics: ScanMetricComparisonView[];
}

export interface ScanModuleErrorView {
  module: string;
  message: string;
}

export type ScanMode = 'local' | 'online';

export interface ScanResultModel {
  id: string;
  createdAt: string;
  scanMode: ScanMode;
  projectEvidenceEnabled: boolean;
  input: {
    url: string;
    viewport?: string;
    pageName?: string;
    projectPath?: string;
    authStatePath?: string;
    enableAi?: boolean;
    enableMemory?: boolean;
  };
  runtime?: RuntimeView;
  lighthouse?: LighthouseView;
  performanceTrace?: TraceView;
  network?: NetworkView;
  package?: { packageManager: string; frameworkHints: string[]; configFiles: string[] };
  projectQuality?: ProjectQualityView;
  memory?: MemoryView;
  aiDiagnosis?: AiDiagnosisView;
  aiRunMeta?: AiRunMetaView;
  previousScanComparison?: ScanComparisonView;
  errors: ScanModuleErrorView[];
}

export interface ScanResponse {
  success: boolean;
  data?: {
    result: ScanResultModel;
    scanDir: string;
    scanJsonPath: string;
    reportMarkdownPath: string;
  };
  error?: string;
}
