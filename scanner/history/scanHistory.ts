import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScanMode, ScanResult } from '../types.js';

export const HISTORY_FILE_NAME = 'history.json';

export interface ScanReportPaths {
  scanDir: string;
  scanJsonPath: string;
  reportMarkdownPath: string;
}

export interface ScanHistorySummary {
  performanceScore?: number;
  runtimeErrorCount?: number;
  failedRequestCount?: number;
  longTaskCount?: number;
  totalTransferSize?: number;
  codeReviewFindingCount?: number;
  dependencyVulnerabilityCount?: number;
  detachedDomNodeCount?: number;
  memorySuspectedLeak?: boolean;
}

export interface ScanHistoryEntryInput {
  url: string;
  viewport: string;
  scanMode?: ScanMode;
  pageName?: string;
  projectPath?: string;
}

export interface ScanHistoryEntry extends ScanReportPaths {
  id: string;
  createdAt: string;
  input: ScanHistoryEntryInput;
  summary: ScanHistorySummary;
}

export interface HistoryMatchKey {
  scanMode: ScanMode;
  url: string;
  pageName: string;
}

export function normalizeUrl(rawUrl: string): string {
  try {
    const [withoutHash] = rawUrl.split('#', 1);
    const [base, query] = withoutHash.split('?', 2);
    const parsed = new URL(base);
    parsed.hostname = parsed.hostname.toLowerCase();
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    const normalizedBase = `${parsed.protocol}//${parsed.host}${pathname}`;
    return query !== undefined ? `${normalizedBase}?${query}` : normalizedBase;
  } catch {
    return rawUrl;
  }
}

export function getHistoryKey(input: ScanHistoryEntryInput): HistoryMatchKey {
  return {
    scanMode: input.scanMode ?? (input.projectPath ? 'local' : 'online'),
    url: normalizeUrl(input.url),
    pageName: input.pageName ?? '',
  };
}

function historyKeysMatch(left: ScanHistoryEntryInput, right: ScanHistoryEntryInput): boolean {
  const leftKey = getHistoryKey(left);
  const rightKey = getHistoryKey(right);
  return (
    leftKey.scanMode === rightKey.scanMode &&
    leftKey.url === rightKey.url &&
    leftKey.pageName === rightKey.pageName
  );
}

export interface ScanHistory {
  version: 1;
  updatedAt: string;
  scans: ScanHistoryEntry[];
}

function emptyHistory(): ScanHistory {
  return { version: 1, updatedAt: new Date(0).toISOString(), scans: [] };
}

function runtimeErrorCount(result: ScanResult): number | undefined {
  if (!result.runtime) return undefined;
  return result.runtime.consoleErrors.length + result.runtime.pageErrors.length;
}

function failedRequestCount(result: ScanResult): number | undefined {
  if (result.network) return result.network.summary.failedRequests;
  if (!result.runtime) return undefined;
  return result.runtime.requestFailures.length + result.runtime.httpErrors.length;
}

function createSummary(result: ScanResult): ScanHistorySummary {
  return {
    performanceScore: result.lighthouse?.scores.performance ?? undefined,
    runtimeErrorCount: runtimeErrorCount(result),
    failedRequestCount: failedRequestCount(result),
    longTaskCount: result.performanceTrace?.longTasks.length,
    totalTransferSize: result.network?.summary.totalTransferSize,
    codeReviewFindingCount: result.projectQuality?.codeReview.findings.length,
    dependencyVulnerabilityCount: result.projectQuality?.audit.total,
    detachedDomNodeCount: result.memory?.baseline?.stats.detachedNodeCount,
    memorySuspectedLeak: result.memory?.comparison?.suspectedLeak,
  };
}

export function createScanHistoryEntry(result: ScanResult, paths: ScanReportPaths): ScanHistoryEntry {
  return {
    id: result.id,
    createdAt: result.createdAt,
    input: {
      url: result.input.url,
      viewport: result.input.viewport ?? 'desktop',
      scanMode: result.scanMode,
      pageName: result.input.pageName,
      projectPath: result.input.projectPath,
    },
    scanDir: paths.scanDir,
    scanJsonPath: paths.scanJsonPath,
    reportMarkdownPath: paths.reportMarkdownPath,
    summary: createSummary(result),
  };
}

export function readScanHistory(outputDir: string): ScanHistory {
  const historyPath = join(outputDir, HISTORY_FILE_NAME);
  if (!existsSync(historyPath)) return emptyHistory();

  try {
    const parsed = JSON.parse(readFileSync(historyPath, 'utf8')) as Partial<ScanHistory>;
    if (parsed.version !== 1 || !Array.isArray(parsed.scans)) return emptyHistory();
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      scans: parsed.scans,
    };
  } catch {
    return emptyHistory();
  }
}

export function appendScanHistory(outputDir: string, entry: ScanHistoryEntry): ScanHistory {
  mkdirSync(outputDir, { recursive: true });
  const history = readScanHistory(outputDir);
  const scans = [entry, ...history.scans.filter((scan) => scan.id !== entry.id)].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const next: ScanHistory = {
    version: 1,
    updatedAt: new Date().toISOString(),
    scans,
  };

  writeFileSync(join(outputDir, HISTORY_FILE_NAME), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export function findPreviousComparableScan(
  history: ScanHistory,
  current: ScanHistoryEntry,
): ScanHistoryEntry | undefined {
  return history.scans
    .filter((entry) => entry.id !== current.id && historyKeysMatch(entry.input, current.input))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

export function readScanResult(scanJsonPath: string): ScanResult {
  return JSON.parse(readFileSync(scanJsonPath, 'utf8')) as ScanResult;
}
