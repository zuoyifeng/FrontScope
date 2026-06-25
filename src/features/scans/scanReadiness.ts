import { buildEvidenceModules, countEvidenceCompletion } from './evidenceModules';
import type { BuildEvidenceModulesInput } from './evidenceModules';
import type { ReadinessCheck, ScanReadinessView } from './types';
import type { ScanProgressView } from './scanProgressTypes';

export interface BuildScanReadinessInput extends BuildEvidenceModulesInput {
  aiStatusLoading: boolean;
  apiReachable: boolean;
  scanProgress?: ScanProgressView | null;
}

function buildPreScanChecks(input: BuildScanReadinessInput): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [
    {
      key: 'url',
      label: '页面地址',
      status: input.url.trim() ? 'pass' : 'fail',
      detail: input.url.trim() ? undefined : '请填写待扫描页面地址',
    },
    {
      key: 'api',
      label: 'API 服务',
      status: input.aiStatusLoading ? 'pending' : input.apiReachable ? 'pass' : 'fail',
      detail: input.apiReachable ? undefined : '请启动 pnpm dev',
    },
  ];

  if (input.scanMode === 'local') {
    checks.push({
      key: 'projectPath',
      label: '项目路径',
      status: input.projectPath?.trim() ? 'pass' : 'fail',
      detail: input.projectPath?.trim() ? undefined : '本地模式需填写项目路径',
    });
  }

  if (input.enableAi) {
    checks.push({
      key: 'ai',
      label: 'AI 配置',
      status: input.aiStatusLoading ? 'pending' : input.aiReady ? 'pass' : 'fail',
      detail: input.aiReady ? undefined : '请在 frontscope.config.json 或环境变量中配置 AI',
    });
  }

  return checks;
}

function buildPostScanChecks(input: BuildScanReadinessInput, modules: ReturnType<typeof buildEvidenceModules>): ReadinessCheck[] {
  return modules
    .filter((module) => module.status !== 'skipped' && module.status !== 'blocked')
    .map((module) => ({
      key: module.key,
      label: module.title,
      status:
        module.status === 'collected'
          ? 'pass'
          : module.status === 'failed'
            ? 'fail'
            : module.status === 'scanning'
              ? 'pending'
              : 'pending',
      detail: module.statusDetail,
    }));
}

function computePercent(checks: ReadinessCheck[]): number {
  const required = checks.filter((check) => check.status !== 'skipped');
  if (required.length === 0) return 0;

  const passed = required.filter((check) => check.status === 'pass').length;
  return Math.round((passed / required.length) * 100);
}

export function buildScanReadiness(input: BuildScanReadinessInput): ScanReadinessView {
  const modules = buildEvidenceModules(input);

  if (input.scanning && input.scanProgress) {
    return {
      phase: 'scanning',
      percent: input.scanProgress.percent,
      checks: input.scanProgress.steps
        .filter((step) => step.status !== 'skipped')
        .map((step) => ({
          key: step.key,
          label: step.label,
          status:
            step.status === 'completed'
              ? 'pass'
              : step.status === 'failed'
                ? 'fail'
                : step.status === 'running'
                  ? 'pending'
                  : 'pending',
          detail: step.detail,
        })),
      summary: input.scanProgress.currentStepLabel
        ? `正在监测：${input.scanProgress.currentStepLabel}`
        : '正在采集证据，请稍候…',
    };
  }

  if (input.scanning) {
    const actionable = modules.filter((module) => module.status !== 'skipped' && module.status !== 'blocked');
    return {
      phase: 'scanning',
      percent: 50,
      checks: actionable.map((module) => ({
        key: module.key,
        label: module.title,
        status: 'pending' as const,
        detail: '采集中',
      })),
      summary: '正在采集证据，请稍候…',
    };
  }

  if (input.scanResult) {
    const checks = buildPostScanChecks(input, modules);
    const { collected, failed, applicable } = countEvidenceCompletion(modules);
    const percent = applicable > 0 ? Math.round((collected / applicable) * 100) : 0;

    return {
      phase: 'post',
      percent,
      checks,
      summary:
        failed > 0
          ? `已完成 ${collected}/${applicable} 个证据模块，${failed} 个模块采集失败。`
          : `已完成 ${collected}/${applicable} 个证据模块，结果已写入 JSON 与 Markdown 报告。`,
    };
  }

  const checks = buildPreScanChecks(input);
  const percent = computePercent(checks);
  const pendingCount = checks.filter((check) => check.status === 'fail').length;

  return {
    phase: 'pre',
    percent,
    checks,
    summary:
      pendingCount > 0
        ? `扫描前检查：尚有 ${pendingCount} 项未满足，补齐后即可开始扫描。`
        : '扫描前检查已通过，可以开始采集证据。',
  };
}
