import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compactEvidence } from '../ai/evidenceCompactor.js';
import { runAiDiagnosis } from '../ai/diagnosisRunner.js';
import type { AiProvider } from '../ai/aiProvider.js';
import { resolveSecurityConfig, type SecurityConfig } from '../ai/config.js';
import { assertPathWithinRoots, assertUrlAllowed } from '../security/guards.js';
import { compareScans } from '../history/scanComparison.js';
import {
  appendScanHistory,
  createScanHistoryEntry,
  findPreviousComparableScan,
  readScanHistory,
  readScanResult,
} from '../history/scanHistory.js';
import { createScanId } from '../report/createScanId.js';
import { writeReport } from '../report/writeReport.js';
import { redactScanInput } from './redactScanInput.js';
import { scanLighthouse } from '../scanners/lighthouseScanner.js';
import { scanPackage } from '../scanners/packageScanner.js';
import { collectPageEvidence, type PageSessionDriver } from './pageSession.js';
import { scanProjectQuality } from '../projectQuality/projectQualityScanner.js';
import type { CommandRunner } from '../projectQuality/commandRunner.js';
import { scanMemory, type MemoryBrowserDriver } from '../memory/memoryScanner.js';
import type {
  LighthouseEvidence,
  MemoryEvidence,
  NetworkEvidence,
  PackageEvidence,
  PerformanceTraceEvidence,
  ProjectQualityEvidence,
  RuntimeEvidence,
  NormalizedScanInput,
  ScanInput,
  ScanModuleError,
  ScanModuleKey,
  ScanResult,
} from '../types.js';
import { validateInput } from './validateInput.js';
import type { ScanProgressUpdate } from './scanProgress.js';

export interface RunScanResult {
  result: ScanResult;
  scanDir: string;
  scanJsonPath: string;
  reportMarkdownPath: string;
}

export interface RunScanDependencies {
  pageSessionDriver?: PageSessionDriver;
  aiProvider?: AiProvider;
  /** Explicit config file path; falls back to cwd/env discovery when omitted. */
  configPath?: string;
  /** Pre-resolved security policy; falls back to config file discovery when omitted. */
  security?: SecurityConfig;
  /** Injected command runner for project-quality tools (used in tests). */
  commandRunner?: CommandRunner;
  /** Injected memory browser driver (used in tests). */
  memoryDriver?: MemoryBrowserDriver;
  /** Optional progress reporter for Web UI polling. */
  onProgress?: (update: ScanProgressUpdate) => void;
}

function toModuleError(module: ScanModuleKey, error: unknown): ScanModuleError {
  if (error instanceof Error) {
    return {
      module,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    module,
    message: String(error),
  };
}

function reportProgress(
  onProgress: RunScanDependencies['onProgress'],
  update: ScanProgressUpdate,
): void {
  onProgress?.(update);
}

/**
 * Resolve where scan artifacts are written:
 * 1. explicit outputDir
 * 2. {projectPath}/frontscope-reports
 * 3. FRONTSCOPE_OUTPUT_DIR or {cwd}/frontscope-reports (API / CLI default)
 */
export function resolveOutputDir(input: Pick<ScanInput, 'outputDir' | 'projectPath'>): string {
  if (input.outputDir) {
    return resolve(input.outputDir);
  }
  if (input.projectPath) {
    return join(input.projectPath, 'frontscope-reports');
  }
  const fromEnv = process.env.FRONTSCOPE_OUTPUT_DIR;
  return resolve(fromEnv ?? join(process.cwd(), 'frontscope-reports'));
}

export async function runScan(rawInput: unknown, dependencies: RunScanDependencies = {}): Promise<RunScanResult> {
  const input: NormalizedScanInput = validateInput(rawInput);
  const shouldScanProject = input.scanMode === 'local' && Boolean(input.projectPath);

  const security = dependencies.security ?? resolveSecurityConfig({ configPath: dependencies.configPath });
  assertUrlAllowed(input.url, {
    allowPrivateNetwork: security.allowPrivateNetwork,
    allowedHosts: security.allowedUrlHosts,
  });
  if (input.projectPath) {
    assertPathWithinRoots(input.projectPath, security.allowedProjectRoots, '项目路径');
  }
  if (input.authStatePath) {
    assertPathWithinRoots(input.authStatePath, security.allowedProjectRoots, '登录态文件');
  }

  const createdAt = new Date();
  const id = createScanId(createdAt, input.pageName);
  const errors: ScanModuleError[] = [];

  const outputDir = resolveOutputDir(input);
  if (input.outputDir) {
    assertPathWithinRoots(outputDir, security.allowedOutputRoots, '输出目录');
  }
  const scanDir = join(outputDir, id);
  mkdirSync(scanDir, { recursive: true });

  // Runtime, network, and performance-trace evidence are collected in a single
  // browser session with one page load instead of three separate launches.
  let runtime: RuntimeEvidence | undefined;
  let network: NetworkEvidence | undefined;
  let performanceTrace: PerformanceTraceEvidence | undefined;
  reportProgress(dependencies.onProgress, { stepKey: 'page-session', stepStatus: 'running' });
  try {
    const pageEvidence = await collectPageEvidence(
      {
        url: input.url,
        viewport: input.viewport,
        screenshotPath: join(scanDir, 'screenshot.png'),
        tracePath: join(scanDir, 'trace.json'),
        authStatePath: input.authStatePath,
      },
      dependencies.pageSessionDriver,
    );
    runtime = pageEvidence.runtime;
    network = pageEvidence.network;
    performanceTrace = pageEvidence.performanceTrace;
    errors.push(...pageEvidence.errors);
    reportProgress(dependencies.onProgress, {
      stepKey: 'page-session',
      stepStatus: pageEvidence.errors.length > 0 && !runtime && !network ? 'failed' : 'completed',
    });
  } catch (error) {
    errors.push(toModuleError('runtime', error));
    errors.push(toModuleError('network', error));
    errors.push(toModuleError('performance-trace', error));
    reportProgress(dependencies.onProgress, { stepKey: 'page-session', stepStatus: 'failed' });
  }

  let lighthouse: LighthouseEvidence | undefined;
  if (input.authStatePath) {
    reportProgress(dependencies.onProgress, {
      stepKey: 'lighthouse',
      stepStatus: 'skipped',
      stepDetail: '登录态场景下暂跳过 Lighthouse',
    });
    errors.push(
      toModuleError(
        'lighthouse',
        new Error('检测到登录态文件：当前 Lighthouse 模块暂不复用 storageState，已跳过以避免误测登录页。'),
      ),
    );
  } else {
    reportProgress(dependencies.onProgress, { stepKey: 'lighthouse', stepStatus: 'running' });
    try {
      lighthouse = await scanLighthouse({
        url: input.url,
        viewport: input.viewport,
      });
      reportProgress(dependencies.onProgress, { stepKey: 'lighthouse', stepStatus: 'completed' });
    } catch (error) {
      errors.push(toModuleError('lighthouse', error));
      reportProgress(dependencies.onProgress, { stepKey: 'lighthouse', stepStatus: 'failed' });
    }
  }

  let packageEvidence: PackageEvidence | undefined;
  let projectQuality: ProjectQualityEvidence | undefined;
  if (shouldScanProject && input.projectPath) {
    reportProgress(dependencies.onProgress, { stepKey: 'project-package', stepStatus: 'running' });
    try {
      packageEvidence = scanPackage(input.projectPath);
      reportProgress(dependencies.onProgress, { stepKey: 'project-package', stepStatus: 'completed' });
    } catch (error) {
      packageEvidence = undefined;
      errors.push(toModuleError('package', error));
      reportProgress(dependencies.onProgress, { stepKey: 'project-package', stepStatus: 'failed' });
    }

    reportProgress(dependencies.onProgress, { stepKey: 'project-quality', stepStatus: 'running' });
    try {
      projectQuality = await scanProjectQuality(input.projectPath, {
        runner: dependencies.commandRunner,
      });
      reportProgress(dependencies.onProgress, { stepKey: 'project-quality', stepStatus: 'completed' });
    } catch (error) {
      errors.push(toModuleError('project-quality', error));
      reportProgress(dependencies.onProgress, { stepKey: 'project-quality', stepStatus: 'failed' });
    }
  }

  let memory: MemoryEvidence | undefined;
  if (input.enableMemory) {
    reportProgress(dependencies.onProgress, { stepKey: 'memory', stepStatus: 'running' });
    try {
      memory = await scanMemory(
        {
          url: input.url,
          viewport: input.viewport,
          baselinePath: join(scanDir, 'heap-baseline.heapsnapshot'),
          comparisonPath: join(scanDir, 'heap-after.heapsnapshot'),
          reloadRounds: input.memoryReloadRounds ?? 0,
          authStatePath: input.authStatePath,
        },
        dependencies.memoryDriver,
      );
      reportProgress(dependencies.onProgress, {
        stepKey: 'memory',
        stepStatus: memory?.status === 'error' ? 'failed' : 'completed',
      });
    } catch (error) {
      errors.push(toModuleError('memory', error));
      reportProgress(dependencies.onProgress, { stepKey: 'memory', stepStatus: 'failed' });
    }
  }

  const result: ScanResult = {
    id,
    createdAt: createdAt.toISOString(),
    scanMode: input.scanMode,
    projectEvidenceEnabled: shouldScanProject,
    input,
    runtime,
    lighthouse,
    performanceTrace,
    network,
    package: packageEvidence,
    projectQuality,
    memory,
    errors,
  };

  if (input.enableAi) {
    reportProgress(dependencies.onProgress, { stepKey: 'ai-diagnosis', stepStatus: 'running' });
    const aiRun = await runAiDiagnosis({
      evidence: compactEvidence(result),
      configPath: dependencies.configPath,
      projectPath: input.projectPath,
      aiProvider: dependencies.aiProvider,
      aiConfigOverride: input.ai
        ? {
            baseURL: input.ai.baseURL,
            apiKey: input.ai.apiKey,
            model: input.ai.model,
            authHeader: input.ai.authHeader ?? 'api-key',
            provider: 'openai',
          }
        : undefined,
    });
    result.aiRunMeta = aiRun.meta;
    if (aiRun.diagnosis) {
      result.aiDiagnosis = aiRun.diagnosis;
    } else if (aiRun.meta.error) {
      result.errors.push(toModuleError('ai', new Error(aiRun.meta.error)));
    }
    reportProgress(dependencies.onProgress, {
      stepKey: 'ai-diagnosis',
      stepStatus: aiRun.meta.status === 'success' ? 'completed' : 'failed',
      stepDetail: aiRun.meta.error,
    });
  }

  result.input = redactScanInput(result.input);

  reportProgress(dependencies.onProgress, { stepKey: 'report', stepStatus: 'running' });
  const plannedPaths = {
    scanDir,
    scanJsonPath: join(scanDir, 'scan.json'),
    reportMarkdownPath: join(scanDir, 'report.md'),
  };

  try {
    const history = readScanHistory(outputDir);
    const currentEntry = createScanHistoryEntry(result, plannedPaths);
    const previousEntry = findPreviousComparableScan(history, currentEntry);
    if (previousEntry) {
      result.previousScanComparison = compareScans(readScanResult(previousEntry.scanJsonPath), result);
    }
  } catch (error) {
    result.errors.push(toModuleError('history', error));
  }

  let written = writeReport(result, outputDir);
  try {
    appendScanHistory(outputDir, createScanHistoryEntry(result, written));
  } catch (error) {
    result.errors.push(toModuleError('history', error));
    written = writeReport(result, outputDir);
  }

  reportProgress(dependencies.onProgress, { stepKey: 'report', stepStatus: 'completed' });

  return {
    result,
    scanDir: written.scanDir,
    scanJsonPath: written.scanJsonPath,
    reportMarkdownPath: written.reportMarkdownPath,
  };
}
