// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanMemory, type MemoryBrowserDriver } from './memoryScanner.js';

const nodeFields = ['type', 'name', 'id', 'self_size', 'edge_count', 'detachedness'];
const nodeTypes = [['hidden', 'array', 'string', 'object', 'native'], 'string', 'number', 'number', 'number', 'number'];

function snapshotJson(detachedCount: number, extraObjects: number): string {
  const strings = ['', 'Window', 'Detached HTMLDivElement', 'MyComponent'];
  const nodes: number[] = [3, 1, 1, 100, 0, 1];
  for (let i = 0; i < detachedCount; i += 1) nodes.push(4, 2, 10 + i, 40, 0, 2);
  for (let i = 0; i < extraObjects; i += 1) nodes.push(3, 3, 100 + i, 60, 0, 1);
  const nodeCount = nodes.length / nodeFields.length;
  return JSON.stringify({
    snapshot: { meta: { node_fields: nodeFields, node_types: nodeTypes }, node_count: nodeCount, edge_count: 0 },
    nodes,
    strings,
  });
}

/**
 * Fake driver that emits a sequence of snapshots (one per takeHeapSnapshot call)
 * via the HeapProfiler chunk event, mirroring real CDP behavior.
 */
function createMemoryDriver(snapshots: string[]): MemoryBrowserDriver {
  return {
    async createPage() {
      const handlers: Record<string, Array<(params: unknown) => void>> = {};
      let snapshotIndex = 0;

      return {
        page: {
          async goto() {},
          async reload() {},
        },
        cdp: {
          async send(method: string) {
            if (method === 'HeapProfiler.takeHeapSnapshot') {
              const chunk = snapshots[Math.min(snapshotIndex, snapshots.length - 1)];
              snapshotIndex += 1;
              handlers['HeapProfiler.addHeapSnapshotChunk']?.forEach((handler) => handler({ chunk }));
            }
            return {};
          },
          on(method: string, handler: (params: unknown) => void) {
            handlers[method] = [...(handlers[method] ?? []), handler];
          },
          off(method: string, handler: (params: unknown) => void) {
            handlers[method] = (handlers[method] ?? []).filter((existing) => existing !== handler);
          },
        },
        close: async () => {},
      };
    },
  };
}

describe('scanMemory', () => {
  it('captures a baseline snapshot and reports detached DOM nodes', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-memory-'));
    const baselinePath = join(outputDir, 'heap-baseline.heapsnapshot');

    const evidence = await scanMemory(
      { url: 'https://example.com', viewport: 'desktop', baselinePath },
      createMemoryDriver([snapshotJson(2, 0)]),
    );

    expect(evidence.status).toBe('issues');
    expect(evidence.baseline?.stats.detachedNodeCount).toBe(2);
    expect(evidence.comparison).toBeUndefined();
    expect(readFileSync(baselinePath, 'utf8')).toContain('node_fields');
  });

  it('flags a suspected leak when objects and detached nodes grow after reloads', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-memory-cmp-'));
    const baselinePath = join(outputDir, 'heap-baseline.heapsnapshot');
    const comparisonPath = join(outputDir, 'heap-after.heapsnapshot');

    const evidence = await scanMemory(
      { url: 'https://example.com', viewport: 'desktop', baselinePath, comparisonPath, reloadRounds: 3 },
      createMemoryDriver([snapshotJson(1, 0), snapshotJson(50, 5000)]),
    );

    expect(evidence.comparison?.reloadRounds).toBe(3);
    expect(evidence.comparison?.suspectedLeak).toBe(true);
    expect(evidence.comparison?.detachedNodeCountDelta).toBeGreaterThan(0);
    expect(evidence.notes.some((note) => note.includes('疑似内存泄漏'))).toBe(true);
  });

  it('does not flag a leak when memory is stable across reloads', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-memory-stable-'));
    const baselinePath = join(outputDir, 'heap-baseline.heapsnapshot');
    const comparisonPath = join(outputDir, 'heap-after.heapsnapshot');

    const evidence = await scanMemory(
      { url: 'https://example.com', viewport: 'desktop', baselinePath, comparisonPath, reloadRounds: 3 },
      createMemoryDriver([snapshotJson(0, 0), snapshotJson(0, 0)]),
    );

    expect(evidence.status).toBe('ok');
    expect(evidence.comparison?.suspectedLeak).toBe(false);
  });
});
