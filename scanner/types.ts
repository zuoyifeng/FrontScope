import type { AiDiagnosis, AiRunMeta } from './ai/types.js';

export type ViewportMode = 'desktop' | 'mobile';
export type ScanMode = 'local' | 'online';
export type AiAuthHeader = 'bearer' | 'api-key';

/** Per-scan AI credentials from the UI or CLI; never persisted with the apiKey. */
export interface ScanAiConfig {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  authHeader?: AiAuthHeader;
}

export interface ScanInput {
  scanMode?: ScanMode;
  projectPath?: string;
  url: string;
  viewport?: ViewportMode;
  pageName?: string;
  outputDir?: string;
  authStatePath?: string;
  enableAi?: boolean;
  enableMemory?: boolean;
  memoryReloadRounds?: number;
  ai?: ScanAiConfig;
}

/** Scan input after validateInput; scanMode and viewport are always normalized. */
export type NormalizedScanInput = ScanInput & {
  scanMode: ScanMode;
  viewport: ViewportMode;
};

export interface PackageEvidence {
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'unknown';
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  frameworkHints: string[];
  configFiles: string[];
}

export interface ConsoleMessageEvidence {
  type: string;
  text: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

export interface PageErrorEvidence {
  message: string;
  stack?: string;
}

export interface RequestFailureEvidence {
  url: string;
  method: string;
  resourceType: string;
  failureText?: string;
}

export interface HttpErrorEvidence {
  url: string;
  status: number;
  statusText: string;
  method: string;
}

export type TargetUrlMismatchReason =
  | 'redirected-to-login'
  | 'different-origin'
  | 'different-path'
  | 'unknown';

export interface TargetUrlEvidence {
  requestedUrl: string;
  finalUrl: string;
  matched: boolean;
  mismatchReason?: TargetUrlMismatchReason;
}

export interface RuntimeEvidence {
  requestedUrl?: string;
  finalUrl: string;
  title: string;
  screenshotPath: string;
  targetUrlMatched?: boolean;
  targetMismatchReason?: TargetUrlMismatchReason;
  consoleErrors: ConsoleMessageEvidence[];
  pageErrors: PageErrorEvidence[];
  requestFailures: RequestFailureEvidence[];
  httpErrors: HttpErrorEvidence[];
}

export interface LighthouseAuditEvidence {
  id: string;
  title: string;
  score: number | null;
  displayValue?: string;
  description?: string;
}

export interface LighthouseEvidence {
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
  audits: LighthouseAuditEvidence[];
}

export interface TraceEventEvidence {
  name: string;
  start: number;
  duration: number;
}

export interface LongTaskEvidence {
  start: number;
  duration: number;
  topLevelEvent: string;
  stackSummary: string[];
}

export interface LayoutShiftEvidence {
  start: number;
  score: number;
  impactedNodes: string[];
}

export interface PerformanceTraceEvidence {
  tracePath: string;
  totalDurationMs: number;
  longTasks: LongTaskEvidence[];
  categoryDurations: {
    scripting: number;
    rendering: number;
    painting: number;
    loading: number;
  };
  layoutEvents: TraceEventEvidence[];
  styleEvents: TraceEventEvidence[];
  paintEvents: TraceEventEvidence[];
  layoutShifts: LayoutShiftEvidence[];
}

export interface NetworkTimingEvidence {
  startTime?: number;
  endTime?: number;
  totalDurationMs?: number;
  dnsMs?: number;
  connectMs?: number;
  sslMs?: number;
  requestMs?: number;
  ttfbMs?: number;
  downloadMs?: number;
}

export interface NetworkRequestEvidence {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  statusText?: string;
  mimeType?: string;
  priority?: string;
  initiatorType?: string;
  fromDiskCache: boolean;
  fromMemoryCache: boolean;
  fromServiceWorker: boolean;
  transferSize: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  timing: NetworkTimingEvidence;
  failureText?: string;
}

export interface NetworkRequestSummaryItem {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  transferSize: number;
  durationMs?: number;
  fromCache: boolean;
}

export interface NetworkSummaryEvidence {
  totalRequests: number;
  failedRequests: number;
  totalTransferSize: number;
  cacheHitRatio: number;
  slowRequests: NetworkRequestSummaryItem[];
  largeResources: NetworkRequestSummaryItem[];
}

export interface NetworkEvidence {
  requests: NetworkRequestEvidence[];
  summary: NetworkSummaryEvidence;
}

export type ProjectQualityStatus = 'ok' | 'issues' | 'skipped' | 'error';

export interface TypecheckEvidence {
  status: ProjectQualityStatus;
  errorCount: number;
  messages: string[];
  skippedReason?: string;
}

export interface EslintFileSummary {
  file: string;
  errorCount: number;
  warningCount: number;
}

export interface EslintEvidence {
  status: ProjectQualityStatus;
  errorCount: number;
  warningCount: number;
  topFiles: EslintFileSummary[];
  skippedReason?: string;
}

export interface DependencyAuditEvidence {
  status: ProjectQualityStatus;
  total: number;
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    info: number;
  };
  skippedReason?: string;
}

export interface UnusedEvidence {
  status: ProjectQualityStatus;
  unusedFiles: number;
  unusedDependencies: number;
  unusedExports: number;
  skippedReason?: string;
}

export interface CircularDependencyEvidence {
  status: ProjectQualityStatus;
  circularCount: number;
  cycles: string[][];
  skippedReason?: string;
}

export interface CodeReviewFinding {
  ruleId: string;
  severity: 'high' | 'medium' | 'low';
  file: string;
  line: number;
  message: string;
}

export interface CodeReviewEvidence {
  status: ProjectQualityStatus;
  scannedFiles: number;
  findings: CodeReviewFinding[];
  skippedReason?: string;
}

export interface ProjectQualityEvidence {
  typecheck: TypecheckEvidence;
  eslint: EslintEvidence;
  audit: DependencyAuditEvidence;
  unused: UnusedEvidence;
  circular: CircularDependencyEvidence;
  codeReview: CodeReviewEvidence;
}

export interface MemoryConstructorStat {
  name: string;
  count: number;
  selfSizeBytes: number;
}

export interface HeapSnapshotStats {
  nodeCount: number;
  edgeCount: number;
  totalSizeBytes: number;
  detachedNodeCount: number;
  topConstructors: MemoryConstructorStat[];
}

export interface HeapSnapshotArtifact {
  path: string;
  fileSizeBytes: number;
  stats: HeapSnapshotStats;
}

export interface MemoryComparisonEvidence {
  reloadRounds: number;
  nodeCountDelta: number;
  detachedNodeCountDelta: number;
  totalSizeBytesDelta: number;
  suspectedLeak: boolean;
}

export interface MemoryEvidence {
  status: ProjectQualityStatus;
  baseline?: HeapSnapshotArtifact;
  comparison?: MemoryComparisonEvidence;
  notes: string[];
  skippedReason?: string;
}

export type ScanComparisonDirection = 'improved' | 'regressed' | 'unchanged' | 'unknown';

export interface ScanMetricComparison {
  key: string;
  label: string;
  before?: number;
  after?: number;
  delta?: number;
  unit?: string;
  direction: ScanComparisonDirection;
}

export interface ScanComparison {
  baseScanId: string;
  targetScanId: string;
  baseCreatedAt: string;
  targetCreatedAt: string;
  summary: {
    improved: number;
    regressed: number;
    unchanged: number;
  };
  metrics: ScanMetricComparison[];
}

export type ScanModuleKey =
  | 'runtime'
  | 'lighthouse'
  | 'network'
  | 'performance-trace'
  | 'package'
  | 'project-quality'
  | 'memory'
  | 'history'
  | 'ai';

export interface ScanModuleError {
  module: ScanModuleKey;
  message: string;
  stack?: string;
}

export interface ScanResult {
  id: string;
  createdAt: string;
  scanMode: ScanMode;
  projectEvidenceEnabled: boolean;
  input: ScanInput;
  runtime?: RuntimeEvidence;
  lighthouse?: LighthouseEvidence;
  performanceTrace?: PerformanceTraceEvidence;
  network?: NetworkEvidence;
  package?: PackageEvidence;
  projectQuality?: ProjectQualityEvidence;
  memory?: MemoryEvidence;
  aiDiagnosis?: AiDiagnosis;
  aiRunMeta?: AiRunMeta;
  previousScanComparison?: ScanComparison;
  errors: ScanModuleError[];
}
