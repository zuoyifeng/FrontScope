import type {
  EvidenceModuleKey,
  EvidenceModuleStatus,
  EvidenceModuleView,
  ScanMode,
  ScanResultModel,
} from './types';
import type { ScanProgressView } from './scanProgressTypes';

export const EVIDENCE_MODULE_DEFINITIONS: Record<
  EvidenceModuleKey,
  Pick<EvidenceModuleView, 'title' | 'description'>
> = {
  runtime: {
    title: '运行时诊断',
    description: '采集控制台错误、页面异常、失败请求和页面截图。',
  },
  performance: {
    title: '性能审计',
    description: '运行 Lighthouse 和 Performance Trace，提取评分、核心指标、长任务和布局偏移。',
  },
  network: {
    title: 'Network 资源诊断',
    description: '采集资源体积、缓存命中率、慢请求、大资源和失败请求。',
  },
  project: {
    title: '项目质量',
    description: '读取包元信息，并执行类型检查、Lint、依赖审计、无用代码、循环依赖与本地代码审查。',
  },
  memory: {
    title: '内存诊断',
    description: '采集堆快照；可配置重载前后对比以输出疑似泄漏信号。',
  },
  ai: {
    title: 'AI 诊断',
    description: '基于已采集证据生成优先级问题清单与修复建议。',
  },
};

export const EVIDENCE_MODULE_STATUS_META: Record<
  EvidenceModuleStatus,
  { label: string; color: 'default' | 'blue' | 'processing' | 'success' | 'error' | 'warning' }
> = {
  pending: { label: '待采集', color: 'blue' },
  skipped: { label: '已跳过', color: 'default' },
  scanning: { label: '采集中', color: 'processing' },
  collected: { label: '已采集', color: 'success' },
  failed: { label: '采集失败', color: 'error' },
  blocked: { label: '未就绪', color: 'warning' },
};

const MODULE_ERROR_KEYS: Record<EvidenceModuleKey, string[]> = {
  runtime: ['runtime'],
  performance: ['lighthouse', 'performance-trace'],
  network: ['network'],
  project: ['package', 'project-quality'],
  memory: ['memory'],
  ai: ['ai'],
};

export interface BuildEvidenceModulesInput {
  scanMode: ScanMode;
  url: string;
  projectPath?: string;
  enableMemory: boolean;
  enableAi: boolean;
  aiReady: boolean;
  scanning: boolean;
  scanResult: ScanResultModel | null;
  scanProgress?: ScanProgressView | null;
}

const PROGRESS_STEP_TO_MODULES: Record<string, EvidenceModuleKey[]> = {
  'page-session': ['runtime', 'network'],
  lighthouse: ['performance'],
  'project-package': ['project'],
  'project-quality': ['project'],
  memory: ['memory'],
  'ai-diagnosis': ['ai'],
};

function resolvePerformanceStatusFromProgress(progress: ScanProgressView): EvidenceModuleStatus {
  const pageSession = progress.steps.find((step) => step.key === 'page-session');
  const lighthouse = progress.steps.find((step) => step.key === 'lighthouse');

  const statuses = [pageSession?.status, lighthouse?.status].filter(Boolean);
  if (statuses.some((status) => status === 'running')) return 'scanning';
  if (statuses.some((status) => status === 'failed')) return 'failed';
  if (pageSession?.status === 'completed' && (lighthouse?.status === 'completed' || lighthouse?.status === 'skipped')) {
    return 'collected';
  }
  if (pageSession?.status === 'completed' && lighthouse?.status === 'pending') return 'scanning';
  return 'pending';
}

function resolveModuleStatusFromProgress(
  key: EvidenceModuleKey,
  progress: ScanProgressView,
): Pick<EvidenceModuleView, 'status' | 'statusDetail'> | null {
  if (key === 'performance') {
    return { status: resolvePerformanceStatusFromProgress(progress) };
  }

  const relatedSteps = Object.entries(PROGRESS_STEP_TO_MODULES)
    .filter(([, modules]) => modules.includes(key))
    .map(([stepKey]) => progress.steps.find((step) => step.key === stepKey))
    .filter((step): step is ScanProgressView['steps'][number] => Boolean(step));

  if (relatedSteps.length === 0) return null;

  if (relatedSteps.some((step) => step.status === 'running')) {
    const running = relatedSteps.find((step) => step.status === 'running');
    return { status: 'scanning', statusDetail: running?.detail };
  }
  if (relatedSteps.some((step) => step.status === 'failed')) {
    const failed = relatedSteps.find((step) => step.status === 'failed');
    return { status: 'failed', statusDetail: failed?.detail };
  }
  if (relatedSteps.every((step) => step.status === 'skipped')) {
    return { status: 'skipped', statusDetail: relatedSteps[0]?.detail };
  }
  if (relatedSteps.every((step) => step.status === 'completed' || step.status === 'skipped')) {
    return { status: 'collected' };
  }

  const pending = relatedSteps.find((step) => step.status === 'pending');
  return pending ? { status: 'pending' } : null;
}

function isModuleApplicable(key: EvidenceModuleKey, input: BuildEvidenceModulesInput): boolean {
  if (key === 'project') return true;
  if (key === 'memory') return input.enableMemory || Boolean(input.scanResult?.memory);
  if (key === 'ai') return input.enableAi || Boolean(input.scanResult?.aiRunMeta?.enabled);
  return true;
}

function hasModuleEvidence(result: ScanResultModel, key: EvidenceModuleKey): boolean {
  switch (key) {
    case 'runtime':
      return Boolean(result.runtime);
    case 'performance':
      return Boolean(result.lighthouse || result.performanceTrace);
    case 'network':
      return Boolean(result.network);
    case 'project':
      return Boolean(result.package || result.projectQuality);
    case 'memory':
      return Boolean(result.memory && result.memory.status !== 'skipped');
    case 'ai':
      return result.aiRunMeta?.status === 'success';
    default:
      return false;
  }
}

function hasModuleFailure(result: ScanResultModel, key: EvidenceModuleKey): boolean {
  const errorKeys = MODULE_ERROR_KEYS[key];
  const moduleError = result.errors.find((error) => errorKeys.includes(error.module));
  if (moduleError) return true;

  if (key === 'ai' && result.aiRunMeta?.enabled && result.aiRunMeta.status === 'failed') {
    return true;
  }

  if (key === 'memory' && result.memory?.status === 'error') {
    return true;
  }

  return false;
}

function getFailureDetail(result: ScanResultModel, key: EvidenceModuleKey): string | undefined {
  const errorKeys = MODULE_ERROR_KEYS[key];
  const moduleError = result.errors.find((error) => errorKeys.includes(error.module));
  if (moduleError) return moduleError.message;
  if (key === 'ai' && result.aiRunMeta?.error) return result.aiRunMeta.error;
  return undefined;
}

function resolvePreScanStatus(
  key: EvidenceModuleKey,
  input: BuildEvidenceModulesInput,
): Pick<EvidenceModuleView, 'status' | 'statusDetail'> {
  const urlReady = Boolean(input.url.trim());

  if (key === 'project') {
    if (input.scanMode === 'online') {
      return { status: 'skipped', statusDetail: '线上模式不采集本地项目证据' };
    }
    if (!input.projectPath?.trim()) {
      return { status: 'blocked', statusDetail: '请填写项目路径' };
    }
    return { status: urlReady ? 'pending' : 'blocked', statusDetail: urlReady ? undefined : '请先填写页面地址' };
  }

  if (key === 'memory') {
    if (!input.enableMemory) {
      return { status: 'skipped', statusDetail: '未开启内存诊断' };
    }
    return { status: urlReady ? 'pending' : 'blocked', statusDetail: urlReady ? undefined : '请先填写页面地址' };
  }

  if (key === 'ai') {
    if (!input.enableAi) {
      return { status: 'skipped', statusDetail: '未开启 AI 诊断' };
    }
    if (!input.aiReady) {
      return { status: 'blocked', statusDetail: 'AI 配置未就绪' };
    }
    return { status: urlReady ? 'pending' : 'blocked', statusDetail: urlReady ? undefined : '请先填写页面地址' };
  }

  return { status: urlReady ? 'pending' : 'blocked', statusDetail: urlReady ? undefined : '请先填写页面地址' };
}

function resolvePostScanStatus(
  key: EvidenceModuleKey,
  input: BuildEvidenceModulesInput,
): Pick<EvidenceModuleView, 'status' | 'statusDetail'> {
  const result = input.scanResult;
  if (!result) {
    return resolvePreScanStatus(key, input);
  }

  if (key === 'project' && !result.projectEvidenceEnabled) {
    return { status: 'skipped', statusDetail: '线上模式不采集本地项目证据' };
  }

  if (key === 'memory' && !input.enableMemory && !result.memory) {
    return { status: 'skipped', statusDetail: '未开启内存诊断' };
  }

  if (key === 'ai' && !input.enableAi && !result.aiRunMeta?.enabled) {
    return { status: 'skipped', statusDetail: '未开启 AI 诊断' };
  }

  if (hasModuleFailure(result, key)) {
    return { status: 'failed', statusDetail: getFailureDetail(result, key) };
  }

  if (hasModuleEvidence(result, key)) {
    return { status: 'collected' };
  }

  return { status: 'failed', statusDetail: '未返回该模块证据' };
}

function resolveModuleStatus(
  key: EvidenceModuleKey,
  input: BuildEvidenceModulesInput,
): Pick<EvidenceModuleView, 'status' | 'statusDetail'> {
  if (input.scanProgress && input.scanning) {
    const fromProgress = resolveModuleStatusFromProgress(key, input.scanProgress);
    if (fromProgress) return fromProgress;
  }

  if (input.scanning) {
    const pre = resolvePreScanStatus(key, input);
    if (pre.status === 'skipped' || pre.status === 'blocked') {
      return pre;
    }
    return { status: 'scanning' };
  }

  if (input.scanResult) {
    return resolvePostScanStatus(key, input);
  }

  return resolvePreScanStatus(key, input);
}

export function buildEvidenceModules(input: BuildEvidenceModulesInput): EvidenceModuleView[] {
  const keys: EvidenceModuleKey[] = ['runtime', 'performance', 'network', 'project', 'memory', 'ai'];

  return keys
    .filter((key) => isModuleApplicable(key, input))
    .map((key) => {
      const definition = EVIDENCE_MODULE_DEFINITIONS[key];
      const resolved = resolveModuleStatus(key, input);
      return {
        key,
        title: definition.title,
        description: definition.description,
        ...resolved,
      };
    });
}

export function countEvidenceCompletion(modules: EvidenceModuleView[]): {
  collected: number;
  failed: number;
  applicable: number;
} {
  const actionable = modules.filter((module) => module.status !== 'skipped' && module.status !== 'blocked');
  return {
    collected: actionable.filter((module) => module.status === 'collected').length,
    failed: actionable.filter((module) => module.status === 'failed').length,
    applicable: actionable.length,
  };
}
