import type { ScanComparison, ScanComparisonDirection, ScanMetricComparison, ScanResult } from '../types.js';

interface MetricSpec {
  key: string;
  label: string;
  unit?: string;
  higherIsBetter: boolean;
  read(scan: ScanResult): number | undefined;
}

function runtimeErrorCount(scan: ScanResult): number | undefined {
  if (!scan.runtime) return undefined;
  return scan.runtime.consoleErrors.length + scan.runtime.pageErrors.length;
}

function failedRequestCount(scan: ScanResult): number | undefined {
  if (scan.network) return scan.network.summary.failedRequests;
  if (!scan.runtime) return undefined;
  return scan.runtime.requestFailures.length + scan.runtime.httpErrors.length;
}

function dependencyVulnerabilityCount(scan: ScanResult): number | undefined {
  return scan.projectQuality?.audit.total;
}

const METRICS: MetricSpec[] = [
  {
    key: 'performanceScore',
    label: 'Performance',
    higherIsBetter: true,
    read: (scan) => scan.lighthouse?.scores.performance ?? undefined,
  },
  {
    key: 'accessibilityScore',
    label: 'Accessibility',
    higherIsBetter: true,
    read: (scan) => scan.lighthouse?.scores.accessibility ?? undefined,
  },
  {
    key: 'bestPracticesScore',
    label: 'Best Practices',
    higherIsBetter: true,
    read: (scan) => scan.lighthouse?.scores.bestPractices ?? undefined,
  },
  {
    key: 'seoScore',
    label: 'SEO',
    higherIsBetter: true,
    read: (scan) => scan.lighthouse?.scores.seo ?? undefined,
  },
  { key: 'runtimeErrors', label: '运行时错误', higherIsBetter: false, read: runtimeErrorCount },
  { key: 'failedRequests', label: '失败请求', higherIsBetter: false, read: failedRequestCount },
  {
    key: 'totalTransferSize',
    label: '总传输体积',
    unit: 'bytes',
    higherIsBetter: false,
    read: (scan) => scan.network?.summary.totalTransferSize,
  },
  {
    key: 'cacheHitRatio',
    label: '缓存命中率',
    unit: 'ratio',
    higherIsBetter: true,
    read: (scan) => scan.network?.summary.cacheHitRatio,
  },
  {
    key: 'slowRequests',
    label: '慢请求',
    higherIsBetter: false,
    read: (scan) => scan.network?.summary.slowRequests.length,
  },
  {
    key: 'largeResources',
    label: '大资源',
    higherIsBetter: false,
    read: (scan) => scan.network?.summary.largeResources.length,
  },
  {
    key: 'longTasks',
    label: 'Long Task',
    higherIsBetter: false,
    read: (scan) => scan.performanceTrace?.longTasks.length,
  },
  {
    key: 'layoutShifts',
    label: 'Layout Shift',
    higherIsBetter: false,
    read: (scan) => scan.performanceTrace?.layoutShifts.length,
  },
  {
    key: 'typecheckErrors',
    label: 'TypeScript 错误',
    higherIsBetter: false,
    read: (scan) => scan.projectQuality?.typecheck.errorCount,
  },
  {
    key: 'eslintErrors',
    label: 'ESLint 错误',
    higherIsBetter: false,
    read: (scan) => scan.projectQuality?.eslint.errorCount,
  },
  {
    key: 'codeReviewFindings',
    label: '代码审查问题',
    higherIsBetter: false,
    read: (scan) => scan.projectQuality?.codeReview.findings.length,
  },
  {
    key: 'dependencyVulnerabilities',
    label: '依赖漏洞',
    higherIsBetter: false,
    read: dependencyVulnerabilityCount,
  },
  {
    key: 'detachedDomNodes',
    label: 'Detached DOM',
    higherIsBetter: false,
    read: (scan) => scan.memory?.baseline?.stats.detachedNodeCount,
  },
];

function directionFor(before: number | undefined, after: number | undefined, higherIsBetter: boolean): ScanComparisonDirection {
  if (typeof before !== 'number' || typeof after !== 'number') return 'unknown';
  const delta = after - before;
  if (delta === 0) return 'unchanged';
  const better = higherIsBetter ? delta > 0 : delta < 0;
  return better ? 'improved' : 'regressed';
}

function compareMetric(base: ScanResult, target: ScanResult, spec: MetricSpec): ScanMetricComparison {
  const before = spec.read(base);
  const after = spec.read(target);
  const direction = directionFor(before, after, spec.higherIsBetter);

  return {
    key: spec.key,
    label: spec.label,
    before,
    after,
    delta: typeof before === 'number' && typeof after === 'number' ? after - before : undefined,
    unit: spec.unit,
    direction,
  };
}

export function compareScans(base: ScanResult, target: ScanResult): ScanComparison {
  const metrics = METRICS.map((spec) => compareMetric(base, target, spec));
  const knownMetrics = metrics.filter((metric) => metric.direction !== 'unknown');

  return {
    baseScanId: base.id,
    targetScanId: target.id,
    baseCreatedAt: base.createdAt,
    targetCreatedAt: target.createdAt,
    summary: {
      improved: knownMetrics.filter((metric) => metric.direction === 'improved').length,
      regressed: knownMetrics.filter((metric) => metric.direction === 'regressed').length,
      unchanged: knownMetrics.filter((metric) => metric.direction === 'unchanged').length,
    },
    metrics,
  };
}
