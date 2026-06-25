import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TARGET_MISMATCH_LABELS } from '../scanners/runtimeScanner.js';
import type { ScanMetricComparison, ScanResult } from '../types.js';

export interface WriteReportResult {
  scanDir: string;
  scanJsonPath: string;
  reportMarkdownPath: string;
}

function formatScore(score: number | null | undefined): string {
  return typeof score === 'number' ? `${score}` : '未采集';
}

function formatBytes(value: number | undefined): string {
  if (typeof value !== 'number') return '未采集';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
  return `${value} B`;
}

function formatRatio(value: number | undefined): string {
  if (typeof value !== 'number') return '未采集';
  return `${Math.round(value * 100)}%`;
}

function formatMs(value: number | undefined): string {
  return typeof value === 'number' ? `${value} ms` : '未采集';
}

function qualityStatusLabel(status: string, skippedReason?: string): string {
  if (status === 'ok') return '通过';
  if (status === 'issues') return '发现问题';
  if (status === 'skipped') return `跳过${skippedReason ? `（${skippedReason}）` : ''}`;
  return `异常${skippedReason ? `（${skippedReason}）` : ''}`;
}

function createProjectQualitySection(result: ScanResult): string {
  if (!result.projectEvidenceEnabled) {
    return `## 项目质量诊断

- 已跳过：online mode cannot read local project files`;
  }

  const quality = result.projectQuality;
  if (!quality) {
    return `## 项目质量诊断

- 未提供项目路径或未执行项目质量扫描。`;
  }

  const codeReviewRows = quality.codeReview.findings.length
    ? quality.codeReview.findings
        .map(
          (finding) =>
            `| ${finding.severity} | ${finding.ruleId} | ${finding.file}:${finding.line} | ${finding.message} |`,
        )
        .join('\n')
    : '| - | - | - | 无 |';

  return `## 项目质量诊断

- TypeScript 类型检查: ${qualityStatusLabel(quality.typecheck.status, quality.typecheck.skippedReason)}，错误 ${quality.typecheck.errorCount} 个
- ESLint: ${qualityStatusLabel(quality.eslint.status, quality.eslint.skippedReason)}，错误 ${quality.eslint.errorCount} 个，警告 ${quality.eslint.warningCount} 个
- 依赖漏洞审计: ${qualityStatusLabel(quality.audit.status, quality.audit.skippedReason)}，共 ${quality.audit.total} 个（critical ${quality.audit.vulnerabilities.critical}, high ${quality.audit.vulnerabilities.high}, moderate ${quality.audit.vulnerabilities.moderate}, low ${quality.audit.vulnerabilities.low}）
- 无用代码/依赖（Knip）: ${qualityStatusLabel(quality.unused.status, quality.unused.skippedReason)}，未使用文件 ${quality.unused.unusedFiles}、未使用依赖 ${quality.unused.unusedDependencies}、未使用导出 ${quality.unused.unusedExports}
- 循环依赖（Madge）: ${qualityStatusLabel(quality.circular.status, quality.circular.skippedReason)}，共 ${quality.circular.circularCount} 处

### 本地代码审查

- 审查文件数: ${quality.codeReview.scannedFiles}
- 发现问题数: ${quality.codeReview.findings.length}${quality.codeReview.skippedReason ? `\n- 说明: ${quality.codeReview.skippedReason}` : ''}

| 严重度 | 规则 | 位置 | 说明 |
| --- | --- | --- | --- |
${codeReviewRows}`;
}

function createMemorySection(result: ScanResult): string {
  const memory = result.memory;
  if (!memory) {
    return `## Memory 内存诊断

- 未启用内存诊断（可通过 CLI \`--memory\` 或 UI 开关开启）。`;
  }

  const baseline = memory.baseline;
  const comparison = memory.comparison;
  const topConstructors = baseline?.stats.topConstructors.length
    ? baseline.stats.topConstructors
        .slice(0, 5)
        .map((item) => `| ${item.name} | ${item.count} | ${formatBytes(item.selfSizeBytes)} |`)
        .join('\n')
    : '| - | - | 无 |';

  return `## Memory 内存诊断

- 状态: ${qualityStatusLabel(memory.status, memory.skippedReason)}
- 基线快照文件: ${baseline?.path ?? '未采集'}
- 节点数: ${baseline?.stats.nodeCount ?? '未采集'}
- 堆对象自身体积合计: ${formatBytes(baseline?.stats.totalSizeBytes)}
- Detached DOM 节点数: ${baseline?.stats.detachedNodeCount ?? '未采集'}
- 前后对比: ${
    comparison
      ? `重复加载 ${comparison.reloadRounds} 次，对象数 Δ ${comparison.nodeCountDelta}，detached Δ ${comparison.detachedNodeCountDelta}，疑似泄漏 ${comparison.suspectedLeak ? '是' : '否'}`
      : '未执行（reloadRounds=0）'
  }

### Top 构造器

| 构造器 | 数量 | 自身体积 |
| --- | --- | --- |
${topConstructors}

> 说明：
${memory.notes.map((note) => `> - ${note}`).join('\n')}`;
}

function formatComparisonNumber(metric: ScanMetricComparison, value: number | undefined): string {
  if (typeof value !== 'number') return '未采集';
  if (metric.unit === 'bytes') return formatBytes(value);
  if (metric.unit === 'ratio') return `${Math.round(value * 100)}%`;
  return `${value}`;
}

function formatDirection(direction: ScanMetricComparison['direction']): string {
  if (direction === 'improved') return '改善';
  if (direction === 'regressed') return '回退';
  if (direction === 'unchanged') return '不变';
  return '无法比较';
}

function formatDelta(metric: ScanMetricComparison): string {
  if (typeof metric.delta !== 'number') return '未采集';
  const sign = metric.delta > 0 ? '+' : '';
  if (metric.unit === 'bytes') return `${sign}${formatBytes(metric.delta)}`;
  if (metric.unit === 'ratio') return `${sign}${Math.round(metric.delta * 100)}%`;
  return `${sign}${metric.delta}`;
}

function createComparisonSection(result: ScanResult): string {
  const comparison = result.previousScanComparison;
  if (!comparison) {
    return `## 与上次扫描对比

- 未找到同扫描模式与 URL 的历史扫描。本次结果已写入本地历史索引，下一次同页面扫描会自动生成对比。`;
  }

  const rows = comparison.metrics
    .filter((metric) => metric.direction !== 'unknown')
    .map(
      (metric) =>
        `| ${metric.label} | ${formatComparisonNumber(metric, metric.before)} | ${formatComparisonNumber(
          metric,
          metric.after,
        )} | ${formatDelta(metric)} | ${formatDirection(metric.direction)} |`,
    )
    .join('\n');

  return `## 与上次扫描对比

- 对比基线: ${comparison.baseScanId}（${comparison.baseCreatedAt}）
- 改善 ${comparison.summary.improved} 项，回退 ${comparison.summary.regressed} 项，不变 ${comparison.summary.unchanged} 项

| 指标 | 上次 | 本次 | 变化 | 方向 |
| --- | --- | --- | --- | --- |
${rows || '| - | - | - | - | 无可比较指标 |'}`;
}

function createTargetMismatchSection(result: ScanResult): string {
  if (result.runtime?.targetUrlMatched !== false) {
    return '';
  }

  const requestedUrl = result.runtime.requestedUrl ?? result.input.url;
  const finalUrl = result.runtime.finalUrl;
  const reason = result.runtime.targetMismatchReason;
  const reasonLabel = reason ? TARGET_MISMATCH_LABELS[reason] : '最终页面与目标 URL 不一致';

  return `## ⚠️ 目标页面未命中

- 请求地址: ${requestedUrl}
- 最终地址: ${finalUrl}
- 原因代码: ${reason ?? 'unknown'}
- 说明: ${reasonLabel}

> 扫描结果可能来自登录页、SSO 页或无权限页面。请提供有效的登录态文件后重新扫描。

`;
}

function createMarkdownReport(result: ScanResult): string {
  const runtimeErrorCount =
    (result.runtime?.consoleErrors.length ?? 0) + (result.runtime?.pageErrors.length ?? 0);
  const failedRequestCount =
    (result.runtime?.requestFailures.length ?? 0) + (result.runtime?.httpErrors.length ?? 0);
  const moduleErrors = result.errors.length
    ? result.errors.map((error) => `- ${error.module}: ${error.message}`).join('\n')
    : '- 无';
  const projectEvidenceStatus = result.projectEvidenceEnabled
    ? '- 已启用（local mode）'
    : `- 已跳过：online mode cannot read local project files`;
  const aiDiagnosis = result.aiDiagnosis
    ? `- 健康等级: ${result.aiDiagnosis.healthLevel}
- 摘要: ${result.aiDiagnosis.summary}

| 优先级 | 类别 | 问题 | 证据 | 建议 | 验证方法 |
| --- | --- | --- | --- | --- | --- |
${result.aiDiagnosis.topIssues
  .map(
    (issue) =>
      `| ${issue.severity} | ${issue.category} | ${issue.title} | ${issue.evidenceIds.join(', ')} | ${issue.suggestion} | ${issue.verifyMethod} |`,
  )
  .join('\n')}

后续动作:
${result.aiDiagnosis.nextActions.map((action) => `- ${action}`).join('\n') || '- 无'}`
    : result.aiRunMeta?.enabled
      ? `AI 诊断未生成。

调用信息:
- Provider: ${result.aiRunMeta.provider ?? 'n/a'}
- Model: ${result.aiRunMeta.model ?? 'n/a'}
- Endpoint: ${result.aiRunMeta.endpoint ?? 'n/a'}
- 状态: ${result.aiRunMeta.status ?? 'n/a'}
- 错误: ${result.aiRunMeta.error ?? '无'}`
      : 'AI 诊断未开启。';
  const slowRequests = result.network?.summary.slowRequests.length
    ? result.network.summary.slowRequests
        .map(
          (request) =>
            `| ${request.method} | ${request.resourceType} | ${request.durationMs ?? 'n/a'} ms | ${formatBytes(request.transferSize)} | ${request.url} |`,
        )
        .join('\n')
    : '| - | - | - | - | 无 |';
  const largeResources = result.network?.summary.largeResources.length
    ? result.network.summary.largeResources
        .map(
          (request) =>
            `| ${request.method} | ${request.resourceType} | ${formatBytes(request.transferSize)} | ${request.durationMs ?? 'n/a'} ms | ${request.url} |`,
        )
        .join('\n')
    : '| - | - | - | - | 无 |';
  const failedNetworkRequests = result.network?.requests.filter(
    (request) => Boolean(request.failureText) || (typeof request.status === 'number' && request.status >= 400),
  );
  const failedNetworkRows = failedNetworkRequests?.length
    ? failedNetworkRequests
        .map(
          (request) =>
            `| ${request.method} | ${request.resourceType} | ${request.status ?? 'failed'} | ${request.failureText ?? request.statusText ?? ''} | ${request.url} |`,
        )
        .join('\n')
    : '| - | - | - | - | 无 |';
  const longTaskRows = result.performanceTrace?.longTasks.length
    ? result.performanceTrace.longTasks
        .map(
          (task) =>
            `| ${task.topLevelEvent} | ${formatMs(task.duration)} | ${formatMs(task.start)} | ${task.stackSummary.join('<br>') || '无'} |`,
        )
        .join('\n')
    : '| - | - | - | 无 |';
  const layoutShiftRows = result.performanceTrace?.layoutShifts.length
    ? result.performanceTrace.layoutShifts
        .map(
          (shift) =>
            `| ${formatMs(shift.start)} | ${shift.score} | ${shift.impactedNodes.join(', ') || '未采集'} |`,
        )
        .join('\n')
    : '| - | - | 无 |';

  return `# FrontScope 体检报告

## 扫描信息

- 报告 ID: ${result.id}
- 创建时间: ${result.createdAt}
- 扫描模式: ${result.scanMode}
- 页面地址: ${result.input.url}
- 页面名称: ${result.input.pageName ?? '未填写'}
- 扫描视口: ${result.input.viewport}
- 项目路径: ${result.input.projectPath ?? '未提供'}
- 登录态配置: ${result.input.authStatePath ?? '未使用'}
- 本地项目证据: ${projectEvidenceStatus}

${createTargetMismatchSection(result)}## 模块状态

${moduleErrors}

## AI 诊断

${aiDiagnosis}

${createComparisonSection(result)}

## 运行时证据

- 请求地址: ${result.runtime?.requestedUrl ?? result.input.url}
- 页面标题: ${result.runtime?.title ?? '未采集'}
- 最终地址: ${result.runtime?.finalUrl ?? '未采集'}
- 目标命中: ${result.runtime?.targetUrlMatched === false ? '否' : result.runtime?.targetUrlMatched === true ? '是' : '未采集'}
${result.runtime?.targetMismatchReason ? `- 未命中原因: ${result.runtime.targetMismatchReason}` : ''}
- 截图路径: ${result.runtime?.screenshotPath ?? '未采集'}
- 运行时错误数: ${runtimeErrorCount}
- 失败请求数: ${failedRequestCount}

## Lighthouse 指标

- Performance: ${formatScore(result.lighthouse?.scores.performance)}
- Accessibility: ${formatScore(result.lighthouse?.scores.accessibility)}
- Best Practices: ${formatScore(result.lighthouse?.scores.bestPractices)}
- SEO: ${formatScore(result.lighthouse?.scores.seo)}
- LCP: ${result.lighthouse?.metrics.largestContentfulPaint ?? '未采集'}
- CLS: ${result.lighthouse?.metrics.cumulativeLayoutShift ?? '未采集'}
- TBT: ${result.lighthouse?.metrics.totalBlockingTime ?? '未采集'}
- Speed Index: ${result.lighthouse?.metrics.speedIndex ?? '未采集'}

## Performance Trace 诊断

- Trace 文件: ${result.performanceTrace?.tracePath ?? '未采集'}
- Trace 总时长: ${formatMs(result.performanceTrace?.totalDurationMs)}
- Long Task 数量: ${result.performanceTrace?.longTasks.length ?? '未采集'}
- Scripting 耗时: ${formatMs(result.performanceTrace?.categoryDurations.scripting)}
- Rendering 耗时: ${formatMs(result.performanceTrace?.categoryDurations.rendering)}
- Painting 耗时: ${formatMs(result.performanceTrace?.categoryDurations.painting)}
- Loading 耗时: ${formatMs(result.performanceTrace?.categoryDurations.loading)}
- Layout 事件数: ${result.performanceTrace?.layoutEvents.length ?? '未采集'}
- Style Recalc 事件数: ${result.performanceTrace?.styleEvents.length ?? '未采集'}
- Paint 事件数: ${result.performanceTrace?.paintEvents.length ?? '未采集'}
- Layout Shift 数量: ${result.performanceTrace?.layoutShifts.length ?? '未采集'}

### Long Task Top 5

| 事件 | 耗时 | 开始时间 | 调用栈摘要 |
| --- | --- | --- | --- |
${longTaskRows}

### Layout Shift

| 开始时间 | 分数 | 影响节点 |
| --- | --- | --- |
${layoutShiftRows}

## Network 资源诊断

- 请求总数: ${result.network?.summary.totalRequests ?? '未采集'}
- 失败请求数: ${result.network?.summary.failedRequests ?? '未采集'}
- 总传输体积: ${formatBytes(result.network?.summary.totalTransferSize)}
- 缓存命中率: ${formatRatio(result.network?.summary.cacheHitRatio)}

### 慢请求 Top 5

| 方法 | 类型 | 耗时 | 体积 | URL |
| --- | --- | --- | --- | --- |
${slowRequests}

### 大资源 Top 5

| 方法 | 类型 | 体积 | 耗时 | URL |
| --- | --- | --- | --- | --- |
${largeResources}

### 失败请求

| 方法 | 类型 | 状态 | 错误 | URL |
| --- | --- | --- | --- | --- |
${failedNetworkRows}

## 项目信息

${result.projectEvidenceEnabled ? `- 包管理器: ${result.package?.packageManager ?? '未采集'}
- 框架特征: ${result.package?.frameworkHints.join(', ') || '未识别'}
- 配置文件: ${result.package?.configFiles.join(', ') || '未识别'}` : `- 已跳过：online mode cannot read local project files`}

${createProjectQualitySection(result)}

${createMemorySection(result)}

## 原始证据

完整 JSON 证据请查看同目录的 \`scan.json\`。
`;
}

export function writeReport(result: ScanResult, outputDir: string): WriteReportResult {
  const scanDir = join(outputDir, result.id);
  mkdirSync(scanDir, { recursive: true });

  const scanJsonPath = join(scanDir, 'scan.json');
  writeFileSync(scanJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const reportMarkdownPath = join(scanDir, 'report.md');
  writeFileSync(reportMarkdownPath, createMarkdownReport(result), 'utf8');

  return {
    scanDir,
    scanJsonPath,
    reportMarkdownPath,
  };
}
