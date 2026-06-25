import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CircularDependencyEvidence,
  DependencyAuditEvidence,
  EslintEvidence,
  ProjectQualityEvidence,
  TypecheckEvidence,
  UnusedEvidence,
} from '../types.js';
import { runCommand, resolveLocalBin, type CommandRunner } from './commandRunner.js';
import { scanCodeReview, type ScanCodeReviewOptions } from './codeReview.js';

export interface ProjectQualityOptions {
  runner?: CommandRunner;
  exists?: (path: string) => boolean;
  codeReview?: ScanCodeReviewOptions;
  /** Per-tool timeout. Audit/typecheck can be slow on large projects. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function detectPackageManager(projectPath: string, exists: (path: string) => boolean): 'pnpm' | 'npm' | 'yarn' | 'unknown' {
  if (exists(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(join(projectPath, 'yarn.lock'))) return 'yarn';
  if (exists(join(projectPath, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

const ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
];

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function runTypecheck(
  projectPath: string,
  runner: CommandRunner,
  exists: (path: string) => boolean,
  timeoutMs: number,
): Promise<TypecheckEvidence> {
  if (!exists(join(projectPath, 'tsconfig.json'))) {
    return { status: 'skipped', errorCount: 0, messages: [], skippedReason: '未发现 tsconfig.json。' };
  }

  const bin = resolveLocalBin(projectPath, 'tsc', exists);
  if (!bin) {
    return {
      status: 'skipped',
      errorCount: 0,
      messages: [],
      skippedReason: '本地未安装 typescript，建议运行: pnpm add -D typescript',
    };
  }

  const result = await runner(bin, ['--noEmit', '--pretty', 'false'], { cwd: projectPath, timeoutMs });
  if (result.timedOut) {
    return { status: 'error', errorCount: 0, messages: [], skippedReason: 'tsc 执行超时。' };
  }

  const output = `${result.stdout}\n${result.stderr}`;
  const errorLines = output.split('\n').filter((line) => /error TS\d+/.test(line));

  return {
    status: result.exitCode === 0 ? 'ok' : 'issues',
    errorCount: errorLines.length,
    messages: errorLines.slice(0, 5).map((line) => line.trim()),
  };
}

interface EslintJsonResult {
  filePath?: string;
  errorCount?: number;
  warningCount?: number;
}

async function runEslint(
  projectPath: string,
  runner: CommandRunner,
  exists: (path: string) => boolean,
  timeoutMs: number,
): Promise<EslintEvidence> {
  const hasConfig = ESLINT_CONFIG_FILES.some((file) => exists(join(projectPath, file)));
  if (!hasConfig) {
    return {
      status: 'skipped',
      errorCount: 0,
      warningCount: 0,
      topFiles: [],
      skippedReason: '未发现 ESLint 配置，跳过。',
    };
  }

  const bin = resolveLocalBin(projectPath, 'eslint', exists);
  if (!bin) {
    return {
      status: 'skipped',
      errorCount: 0,
      warningCount: 0,
      topFiles: [],
      skippedReason: '本地未安装 eslint，建议运行: pnpm add -D eslint',
    };
  }

  const result = await runner(bin, ['.', '--format', 'json', '--no-error-on-unmatched-pattern'], {
    cwd: projectPath,
    timeoutMs,
  });
  if (result.timedOut) {
    return { status: 'error', errorCount: 0, warningCount: 0, topFiles: [], skippedReason: 'eslint 执行超时。' };
  }

  const parsed = safeJsonParse(result.stdout);
  if (!Array.isArray(parsed)) {
    return {
      status: 'error',
      errorCount: 0,
      warningCount: 0,
      topFiles: [],
      skippedReason: `无法解析 ESLint 输出: ${result.stderr.slice(0, 200)}`.trim(),
    };
  }

  const files = parsed as EslintJsonResult[];
  const errorCount = files.reduce((total, file) => total + (file.errorCount ?? 0), 0);
  const warningCount = files.reduce((total, file) => total + (file.warningCount ?? 0), 0);
  const topFiles = files
    .filter((file) => (file.errorCount ?? 0) + (file.warningCount ?? 0) > 0)
    .sort((left, right) => (right.errorCount ?? 0) - (left.errorCount ?? 0))
    .slice(0, 5)
    .map((file) => ({
      file: file.filePath ? file.filePath.replace(`${projectPath}/`, '') : 'unknown',
      errorCount: file.errorCount ?? 0,
      warningCount: file.warningCount ?? 0,
    }));

  return {
    status: errorCount + warningCount > 0 ? 'issues' : 'ok',
    errorCount,
    warningCount,
    topFiles,
  };
}

async function runAudit(
  projectPath: string,
  runner: CommandRunner,
  exists: (path: string) => boolean,
  timeoutMs: number,
): Promise<DependencyAuditEvidence> {
  const empty = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
  const packageManager = detectPackageManager(projectPath, exists);

  if (packageManager === 'unknown') {
    return { status: 'skipped', total: 0, vulnerabilities: empty, skippedReason: '未识别包管理器，跳过依赖漏洞审计。' };
  }
  if (packageManager === 'yarn') {
    return {
      status: 'skipped',
      total: 0,
      vulnerabilities: empty,
      skippedReason: 'yarn audit 输出格式暂不支持解析，跳过。',
    };
  }

  const result = await runner(packageManager, ['audit', '--json'], { cwd: projectPath, timeoutMs });
  if (result.timedOut) {
    return { status: 'error', total: 0, vulnerabilities: empty, skippedReason: `${packageManager} audit 执行超时。` };
  }

  const parsed = safeJsonParse(result.stdout) as
    | { metadata?: { vulnerabilities?: Partial<typeof empty> & { total?: number } } }
    | undefined;
  const vulnerabilities = parsed?.metadata?.vulnerabilities;
  if (!vulnerabilities) {
    return {
      status: 'error',
      total: 0,
      vulnerabilities: empty,
      skippedReason: `无法解析 ${packageManager} audit 输出（可能需要网络）。`,
    };
  }

  const merged = {
    critical: vulnerabilities.critical ?? 0,
    high: vulnerabilities.high ?? 0,
    moderate: vulnerabilities.moderate ?? 0,
    low: vulnerabilities.low ?? 0,
    info: vulnerabilities.info ?? 0,
  };
  const total =
    vulnerabilities.total ?? merged.critical + merged.high + merged.moderate + merged.low + merged.info;

  return { status: total > 0 ? 'issues' : 'ok', total, vulnerabilities: merged };
}

async function runUnused(
  projectPath: string,
  runner: CommandRunner,
  exists: (path: string) => boolean,
  timeoutMs: number,
): Promise<UnusedEvidence> {
  const bin = resolveLocalBin(projectPath, 'knip', exists);
  if (!bin) {
    return {
      status: 'skipped',
      unusedFiles: 0,
      unusedDependencies: 0,
      unusedExports: 0,
      skippedReason: '本地未安装 knip，建议运行: pnpm add -D knip',
    };
  }

  const result = await runner(bin, ['--reporter', 'json', '--no-progress'], { cwd: projectPath, timeoutMs });
  if (result.timedOut) {
    return {
      status: 'error',
      unusedFiles: 0,
      unusedDependencies: 0,
      unusedExports: 0,
      skippedReason: 'knip 执行超时。',
    };
  }

  const parsed = safeJsonParse(result.stdout) as
    | { files?: unknown[]; issues?: { dependencies?: unknown[]; exports?: unknown[] } }
    | undefined;
  if (!parsed) {
    return {
      status: 'error',
      unusedFiles: 0,
      unusedDependencies: 0,
      unusedExports: 0,
      skippedReason: '无法解析 knip 输出。',
    };
  }

  const unusedFiles = Array.isArray(parsed.files) ? parsed.files.length : 0;
  const unusedDependencies = Array.isArray(parsed.issues?.dependencies) ? parsed.issues!.dependencies!.length : 0;
  const unusedExports = Array.isArray(parsed.issues?.exports) ? parsed.issues!.exports!.length : 0;

  return {
    status: unusedFiles + unusedDependencies + unusedExports > 0 ? 'issues' : 'ok',
    unusedFiles,
    unusedDependencies,
    unusedExports,
  };
}

async function runCircular(
  projectPath: string,
  runner: CommandRunner,
  exists: (path: string) => boolean,
  timeoutMs: number,
): Promise<CircularDependencyEvidence> {
  const bin = resolveLocalBin(projectPath, 'madge', exists);
  if (!bin) {
    return {
      status: 'skipped',
      circularCount: 0,
      cycles: [],
      skippedReason: '本地未安装 madge，建议运行: pnpm add -D madge',
    };
  }

  const target = exists(join(projectPath, 'src')) ? 'src' : '.';
  const result = await runner(bin, ['--circular', '--json', target], { cwd: projectPath, timeoutMs });
  if (result.timedOut) {
    return { status: 'error', circularCount: 0, cycles: [], skippedReason: 'madge 执行超时。' };
  }

  const parsed = safeJsonParse(result.stdout);
  const cycles = Array.isArray(parsed) ? (parsed as string[][]).filter((cycle) => Array.isArray(cycle)) : [];

  return {
    status: cycles.length > 0 ? 'issues' : 'ok',
    circularCount: cycles.length,
    cycles: cycles.slice(0, 5),
  };
}

/**
 * Run local project-quality checks. Each sub-check degrades independently:
 * external tools that are not installed are skipped with an install suggestion
 * (hybrid strategy), while the built-in AST code review always runs.
 * No check ever mutates the target project.
 */
export async function scanProjectQuality(
  projectPath: string,
  options: ProjectQualityOptions = {},
): Promise<ProjectQualityEvidence> {
  const runner = options.runner ?? runCommand;
  const exists = options.exists ?? existsSync;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const [typecheck, eslint, audit, unused, circular] = await Promise.all([
    runTypecheck(projectPath, runner, exists, timeoutMs),
    runEslint(projectPath, runner, exists, timeoutMs),
    runAudit(projectPath, runner, exists, timeoutMs),
    runUnused(projectPath, runner, exists, timeoutMs),
    runCircular(projectPath, runner, exists, timeoutMs),
  ]);

  const codeReview = scanCodeReview(projectPath, options.codeReview);

  return { typecheck, eslint, audit, unused, circular, codeReview };
}
