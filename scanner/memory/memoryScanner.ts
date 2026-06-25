import { writeFileSync } from 'node:fs';
import { parseHeapSnapshot } from './heapSnapshotParser.js';
import type {
  HeapSnapshotArtifact,
  MemoryComparisonEvidence,
  MemoryEvidence,
  ViewportMode,
} from '../types.js';

export interface MemoryScanOptions {
  url: string;
  viewport: ViewportMode;
  baselinePath: string;
  comparisonPath?: string;
  /** Reload the page N times between baseline and comparison snapshots. 0 disables comparison. */
  reloadRounds?: number;
  authStatePath?: string;
}

export interface MemoryCdpSession {
  send(method: string, params?: unknown): Promise<unknown>;
  on(method: string, handler: (params: unknown) => void): void;
  off?(method: string, handler: (params: unknown) => void): void;
}

export interface MemoryPage {
  goto(url: string, options: { waitUntil: 'networkidle'; timeout: number }): Promise<unknown>;
  reload?(options: { waitUntil: 'networkidle'; timeout: number }): Promise<unknown>;
}

export interface MemoryPageSession {
  page: MemoryPage;
  cdp: MemoryCdpSession;
  close(): Promise<void>;
}

export interface MemoryBrowserDriver {
  createPage(viewport: ViewportMode, options?: { authStatePath?: string }): Promise<MemoryPageSession>;
}

const NAVIGATION_TIMEOUT_MS = 60_000;
const BASELINE_NOTE =
  '单次堆快照无法确诊内存泄漏，结论需结合用户操作路径、多次快照对比，并由人工在 Chrome DevTools Memory 面板验证。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function captureSnapshot(cdp: MemoryCdpSession, snapshotPath: string): Promise<HeapSnapshotArtifact> {
  let data = '';
  const onChunk = (params: unknown): void => {
    if (isRecord(params) && typeof params.chunk === 'string') {
      data += params.chunk;
    }
  };

  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    cdp.off?.('HeapProfiler.addHeapSnapshotChunk', onChunk);
  }

  writeFileSync(snapshotPath, data, 'utf8');

  let stats;
  try {
    stats = parseHeapSnapshot(JSON.parse(data));
  } catch {
    stats = parseHeapSnapshot({});
  }

  return { path: snapshotPath, fileSizeBytes: Buffer.byteLength(data), stats };
}

function compareSnapshots(
  baseline: HeapSnapshotArtifact,
  after: HeapSnapshotArtifact,
  reloadRounds: number,
): MemoryComparisonEvidence {
  const nodeCountDelta = after.stats.nodeCount - baseline.stats.nodeCount;
  const detachedNodeCountDelta = after.stats.detachedNodeCount - baseline.stats.detachedNodeCount;
  const totalSizeBytesDelta = after.stats.totalSizeBytes - baseline.stats.totalSizeBytes;

  // Conservative heuristic: both detached DOM and overall object count must grow
  // meaningfully after repeated reloads before we even call it "suspected".
  const suspectedLeak =
    detachedNodeCountDelta > 0 && nodeCountDelta > Math.max(1000, baseline.stats.nodeCount * 0.1);

  return { reloadRounds, nodeCountDelta, detachedNodeCountDelta, totalSizeBytesDelta, suspectedLeak };
}

function createPlaywrightMemoryDriver(): MemoryBrowserDriver {
  return {
    async createPage(viewport, options) {
      const { chromium, devices } = await import('playwright');
      const browser = await chromium.launch();
      const context =
        viewport === 'mobile'
          ? await browser.newContext({ ...devices['iPhone 13'], storageState: options?.authStatePath })
          : await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: options?.authStatePath });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);

      return {
        page,
        cdp,
        close: async () => {
          await browser.close();
        },
      };
    },
  };
}

/**
 * Capture a heap snapshot after page load and, optionally, a second snapshot
 * after repeated reloads to surface memory-growth signals. The module is
 * intentionally conservative: it reports detached DOM counts and growth deltas
 * as "suspected" signals with a manual verification note, never a confirmed leak.
 */
export async function scanMemory(
  options: MemoryScanOptions,
  driver: MemoryBrowserDriver = createPlaywrightMemoryDriver(),
): Promise<MemoryEvidence> {
  const session = await driver.createPage(options.viewport, { authStatePath: options.authStatePath });
  const notes = [BASELINE_NOTE];

  try {
    await session.cdp.send('HeapProfiler.enable');
    await session.page.goto(options.url, { waitUntil: 'networkidle', timeout: NAVIGATION_TIMEOUT_MS });

    const baseline = await captureSnapshot(session.cdp, options.baselinePath);
    if (baseline.stats.detachedNodeCount > 0) {
      notes.push(
        `基线快照发现 ${baseline.stats.detachedNodeCount} 个 detached DOM 节点，可能是未释放的引用，建议结合操作路径确认。`,
      );
    }

    let comparison: MemoryComparisonEvidence | undefined;
    const reloadRounds = options.reloadRounds ?? 0;
    if (reloadRounds > 0 && options.comparisonPath && session.page.reload) {
      for (let round = 0; round < reloadRounds; round += 1) {
        await session.page.reload({ waitUntil: 'networkidle', timeout: NAVIGATION_TIMEOUT_MS });
      }
      const after = await captureSnapshot(session.cdp, options.comparisonPath);
      comparison = compareSnapshots(baseline, after, reloadRounds);
      if (comparison.suspectedLeak) {
        notes.push(
          `重复加载 ${reloadRounds} 次后，对象数增加 ${comparison.nodeCountDelta}、detached 节点增加 ${comparison.detachedNodeCountDelta}，存在疑似内存泄漏，请用具体操作脚本进一步复现并人工验证。`,
        );
      }
    }

    const status = baseline.stats.detachedNodeCount > 0 || comparison?.suspectedLeak ? 'issues' : 'ok';
    return { status, baseline, comparison, notes };
  } finally {
    await session.close();
  }
}
