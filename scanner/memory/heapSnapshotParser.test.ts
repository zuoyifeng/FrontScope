// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseHeapSnapshot } from './heapSnapshotParser.js';

// Minimal V8-style snapshot with node_fields:
// [type, name, id, self_size, edge_count, detachedness]
function createSnapshot() {
  const nodeFields = ['type', 'name', 'id', 'self_size', 'edge_count', 'detachedness'];
  const nodeTypes = [
    ['hidden', 'array', 'string', 'object', 'native'],
    'string',
    'number',
    'number',
    'number',
    'number',
  ];
  const strings = ['', 'Window', 'Detached HTMLDivElement', 'MyComponent'];

  // 3 nodes:
  // - object "Window" 100 bytes, attached
  // - native "Detached HTMLDivElement" 40 bytes, detachedness=2
  // - object "MyComponent" 60 bytes, attached
  const nodes = [
    3, 1, 1, 100, 0, 1,
    4, 2, 2, 40, 0, 2,
    3, 3, 3, 60, 0, 1,
  ];

  return {
    snapshot: { meta: { node_fields: nodeFields, node_types: nodeTypes }, node_count: 3, edge_count: 0 },
    nodes,
    strings,
  };
}

describe('parseHeapSnapshot', () => {
  it('aggregates node count, total size, detached nodes, and top constructors', () => {
    const stats = parseHeapSnapshot(createSnapshot());

    expect(stats.nodeCount).toBe(3);
    expect(stats.totalSizeBytes).toBe(200);
    expect(stats.detachedNodeCount).toBe(1);
    expect(stats.topConstructors.map((item) => item.name)).toEqual(
      expect.arrayContaining(['Window', 'Detached HTMLDivElement', 'MyComponent']),
    );
  });

  it('detects detached nodes by name when detachedness field is absent', () => {
    const nodeFields = ['type', 'name', 'id', 'self_size', 'edge_count'];
    const nodeTypes = [['hidden', 'array', 'string', 'object', 'native'], 'string', 'number', 'number', 'number'];
    const stats = parseHeapSnapshot({
      snapshot: { meta: { node_fields: nodeFields, node_types: nodeTypes }, node_count: 1, edge_count: 0 },
      nodes: [4, 1, 1, 32, 0],
      strings: ['', 'Detached HTMLLIElement'],
    });

    expect(stats.detachedNodeCount).toBe(1);
  });

  it('returns empty stats for malformed input', () => {
    expect(parseHeapSnapshot({}).nodeCount).toBe(0);
    expect(parseHeapSnapshot(null).totalSizeBytes).toBe(0);
  });
});
