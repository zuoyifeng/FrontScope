import type { ScanResult } from '../types.js';
import type { CompactEvidenceItem } from './types.js';

export interface CompactEvidenceOptions {
  /** Global safety cap on the number of evidence items sent to the model. */
  maxItems?: number;
  /** Max length of each `summary` string before truncation. */
  maxSummaryChars?: number;
  /** Max length of each `detail` string before truncation. */
  maxDetailChars?: number;
}

const DEFAULTS = {
  maxItems: 120,
  maxSummaryChars: 300,
  maxDetailChars: 500,
} as const;

// Per-category caps so a single broken page cannot generate hundreds of items.
const RUNTIME_CONSOLE_CAP = 15;
const RUNTIME_PAGE_ERROR_CAP = 15;
const RUNTIME_HTTP_CAP = 15;
const TRACE_LAYOUT_SHIFT_CAP = 5;
const NETWORK_FAILED_CAP = 10;

function truncate(value: string | undefined, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function compactEvidence(result: ScanResult, options: CompactEvidenceOptions = {}): CompactEvidenceItem[] {
  const maxItems = options.maxItems ?? DEFAULTS.maxItems;
  const maxSummaryChars = options.maxSummaryChars ?? DEFAULTS.maxSummaryChars;
  const maxDetailChars = options.maxDetailChars ?? DEFAULTS.maxDetailChars;

  const items: CompactEvidenceItem[] = [];

  const add = (item: CompactEvidenceItem): void => {
    if (item.summary === undefined || item.summary === '') return;
    items.push({
      ...item,
      summary: truncate(item.summary, maxSummaryChars) ?? item.summary,
      detail: truncate(item.detail, maxDetailChars),
    });
  };

  result.runtime?.consoleErrors.slice(0, RUNTIME_CONSOLE_CAP).forEach((error, index) => {
    add({
      id: `runtime.console.${index}`,
      category: 'runtime',
      summary: `console ${error.type}: ${error.text}`,
      detail: error.location?.url,
    });
  });

  result.runtime?.pageErrors.slice(0, RUNTIME_PAGE_ERROR_CAP).forEach((error, index) => {
    add({
      id: `runtime.pageError.${index}`,
      category: 'runtime',
      summary: `page error: ${error.message}`,
      detail: error.stack,
    });
  });

  result.runtime?.httpErrors.slice(0, RUNTIME_HTTP_CAP).forEach((error, index) => {
    add({
      id: `runtime.http.${index}`,
      category: 'runtime',
      summary: `${error.method} ${error.url} returned ${error.status} ${error.statusText}`,
    });
  });

  if (result.runtime?.targetUrlMatched === false) {
    const requestedUrl = result.runtime.requestedUrl ?? result.input.url;
    add({
      id: 'runtime.targetMismatch',
      category: 'runtime',
      summary: `Target URL mismatch: requested ${requestedUrl}, landed on ${result.runtime.finalUrl}`,
      detail: result.runtime.targetMismatchReason,
    });
  }

  if (result.runtime) {
    add({
      id: 'runtime.summary',
      category: 'runtime',
      summary: `Page "${result.runtime.title ?? 'unknown'}" loaded at ${result.runtime.finalUrl ?? result.input.url}`,
      detail: `consoleErrors=${result.runtime.consoleErrors.length}, pageErrors=${result.runtime.pageErrors.length}, httpErrors=${result.runtime.httpErrors.length}`,
    });
  }

  add({
    id: 'lighthouse.metric.lcp',
    category: 'performance',
    summary: result.lighthouse?.metrics.largestContentfulPaint
      ? `LCP: ${result.lighthouse.metrics.largestContentfulPaint}`
      : '',
  });
  add({
    id: 'lighthouse.metric.cls',
    category: 'performance',
    summary: result.lighthouse?.metrics.cumulativeLayoutShift
      ? `CLS: ${result.lighthouse.metrics.cumulativeLayoutShift}`
      : '',
  });
  add({
    id: 'lighthouse.metric.tbt',
    category: 'performance',
    summary: result.lighthouse?.metrics.totalBlockingTime
      ? `TBT: ${result.lighthouse.metrics.totalBlockingTime}`
      : '',
  });

  result.lighthouse?.audits.forEach((audit) => {
    add({
      id: `lighthouse.audit.${audit.id}`,
      category: 'performance',
      summary: `${audit.title}${audit.displayValue ? ` (${audit.displayValue})` : ''}`,
      detail: audit.description,
    });
  });

  result.performanceTrace?.longTasks.forEach((task, index) => {
    add({
      id: `trace.longTask.${index}`,
      category: 'performance',
      summary: `${task.topLevelEvent} long task took ${task.duration} ms`,
      detail: task.stackSummary.join('\n'),
    });
  });

  result.performanceTrace?.layoutShifts.slice(0, TRACE_LAYOUT_SHIFT_CAP).forEach((shift, index) => {
    add({
      id: `trace.layoutShift.${index}`,
      category: 'performance',
      summary: `LayoutShift score ${shift.score} at ${shift.start} ms`,
      detail: shift.impactedNodes.join(', '),
    });
  });

  if (result.performanceTrace) {
    const trace = result.performanceTrace;
    const clsScore = trace.layoutShifts.reduce((sum, shift) => sum + shift.score, 0);
    add({
      id: 'trace.summary',
      category: 'performance',
      summary: `Trace captured ${trace.longTasks.length} long tasks, ${trace.layoutShifts.length} layout shifts, total ${trace.totalDurationMs.toFixed(0)} ms`,
      detail: `scripting=${trace.categoryDurations.scripting}ms, rendering=${trace.categoryDurations.rendering}ms, clsApprox=${clsScore.toFixed(3)}`,
    });
  }

  result.network?.summary.slowRequests.forEach((request, index) => {
    add({
      id: `network.slow.${index}`,
      category: 'network',
      summary: `${request.method} ${request.url} took ${request.durationMs ?? 'n/a'} ms`,
      detail: `${request.resourceType}, ${request.transferSize} bytes`,
    });
  });

  result.network?.summary.largeResources.forEach((request, index) => {
    add({
      id: `network.large.${index}`,
      category: 'network',
      summary: `${request.method} ${request.url} transferred ${request.transferSize} bytes`,
      detail: `${request.resourceType}, ${request.durationMs ?? 'n/a'} ms`,
    });
  });

  result.network?.requests
    .filter((request) => Boolean(request.failureText) || (typeof request.status === 'number' && request.status >= 400))
    .slice(0, NETWORK_FAILED_CAP)
    .forEach((request, index) => {
      add({
        id: `network.failed.${index}`,
        category: 'network',
        summary: `${request.method} ${request.url} failed with ${request.status ?? request.failureText ?? 'unknown error'}`,
        detail: request.statusText,
      });
    });

  // Dependencies are summarized rather than listed one-by-one: a raw dependency
  // list is noise for diagnosis until vulnerability/unused-dependency evidence
  // (V0.5) exists, and it would otherwise dominate the AI payload.
  if (result.projectEvidenceEnabled && result.package) {
    const dependencyCount = Object.keys(result.package.dependencies).length;
    const devDependencyCount = Object.keys(result.package.devDependencies).length;
    if (dependencyCount > 0 || devDependencyCount > 0 || result.package.frameworkHints.length > 0) {
      add({
        id: 'package.summary',
        category: 'dependency',
        summary: `${result.package.packageManager} 项目，dependencies ${dependencyCount} 个，devDependencies ${devDependencyCount} 个，框架特征: ${
          result.package.frameworkHints.join(', ') || '未识别'
        }`,
        detail: result.package.configFiles.join(', ') || undefined,
      });
    }
  }

  if (result.routeDiscovery?.status === 'ok') {
    result.routeDiscovery.candidates.forEach((candidate, index) => {
      add({
        id: `route.discovery.${index}`,
        category: 'project',
        summary: `Discovered route ${candidate.path} from ${candidate.source}`,
        detail: candidate.file,
      });
    });
  }

  const quality = result.projectQuality;
  if (result.projectEvidenceEnabled && quality) {
    if (quality.typecheck.status === 'issues') {
      add({
        id: 'quality.typecheck',
        category: 'code-quality',
        summary: `TypeScript 类型检查发现 ${quality.typecheck.errorCount} 个错误`,
        detail: quality.typecheck.messages.join('\n'),
      });
    }
    if (quality.eslint.status === 'issues') {
      add({
        id: 'quality.eslint',
        category: 'code-quality',
        summary: `ESLint 发现 ${quality.eslint.errorCount} 个错误、${quality.eslint.warningCount} 个警告`,
        detail: quality.eslint.topFiles.map((file) => `${file.file}: ${file.errorCount}e/${file.warningCount}w`).join('\n'),
      });
    }
    if (quality.audit.status === 'issues') {
      const { critical, high, moderate, low } = quality.audit.vulnerabilities;
      add({
        id: 'quality.audit',
        category: 'dependency',
        summary: `依赖漏洞 ${quality.audit.total} 个（critical ${critical}, high ${high}, moderate ${moderate}, low ${low}）`,
      });
    }
    if (quality.unused.status === 'issues') {
      add({
        id: 'quality.unused',
        category: 'code-quality',
        summary: `Knip 发现未使用文件 ${quality.unused.unusedFiles} 个、未使用依赖 ${quality.unused.unusedDependencies} 个、未使用导出 ${quality.unused.unusedExports} 个`,
      });
    }
    if (quality.circular.status === 'issues') {
      add({
        id: 'quality.circular',
        category: 'code-quality',
        summary: `检测到 ${quality.circular.circularCount} 处循环依赖`,
        detail: quality.circular.cycles.map((cycle) => cycle.join(' -> ')).join('\n'),
      });
    }
    quality.codeReview.findings.forEach((finding, index) => {
      add({
        id: `quality.codeReview.${index}`,
        category: 'code-quality',
        summary: `[${finding.ruleId}] ${finding.file}:${finding.line} ${finding.message}`,
        detail: `${finding.severity} @ ${finding.file}:${finding.line}`,
      });
    });
  }

  const memory = result.memory;
  if (memory?.baseline) {
    if (memory.baseline.stats.detachedNodeCount > 0) {
      add({
        id: 'memory.detached',
        category: 'memory',
        summary: `堆快照发现 ${memory.baseline.stats.detachedNodeCount} 个 detached DOM 节点（疑似未释放引用）`,
        detail: '需结合操作路径与人工验证，不能仅凭此断定泄漏。',
      });
    }
    if (memory.comparison?.suspectedLeak) {
      add({
        id: 'memory.leak',
        category: 'memory',
        summary: `重复加载 ${memory.comparison.reloadRounds} 次后对象数 +${memory.comparison.nodeCountDelta}、detached +${memory.comparison.detachedNodeCountDelta}，疑似内存泄漏`,
        detail: '请使用具体操作脚本复现并在 Chrome DevTools Memory 面板人工验证。',
      });
    }
  }

  result.errors.forEach((error, index) => {
    add({
      id: `project.moduleError.${index}`,
      category: 'project',
      summary: `${error.module} scanner failed: ${error.message}`,
    });
  });

  return items.slice(0, maxItems);
}
