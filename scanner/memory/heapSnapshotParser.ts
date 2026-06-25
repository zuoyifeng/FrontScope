import type { HeapSnapshotStats } from '../types.js';

interface RawHeapSnapshot {
  snapshot?: {
    meta?: {
      node_fields?: string[];
      node_types?: unknown[];
    };
    node_count?: number;
    edge_count?: number;
  };
  nodes?: number[];
  strings?: string[];
}

const DETACHED_FIELD_VALUE = 2; // V8 detachedness: 0 unknown, 1 attached, 2 detached
const TOP_CONSTRUCTOR_LIMIT = 10;

function emptyStats(edgeCount = 0): HeapSnapshotStats {
  return {
    nodeCount: 0,
    edgeCount,
    totalSizeBytes: 0,
    detachedNodeCount: 0,
    topConstructors: [],
  };
}

/**
 * Parse a V8 `.heapsnapshot` JSON into compact statistics.
 *
 * The snapshot stores nodes as a flat integer array; each node occupies
 * `node_fields.length` slots. `type` and `name` index into separate enum/string
 * tables. We surface only report-friendly aggregates (counts, sizes, detached
 * DOM nodes, top constructors) and never attempt to assert a leak by itself.
 */
export function parseHeapSnapshot(raw: unknown): HeapSnapshotStats {
  if (typeof raw !== 'object' || raw === null) {
    return emptyStats();
  }

  const snapshot = raw as RawHeapSnapshot;
  const meta = snapshot.snapshot?.meta;
  const nodeFields = meta?.node_fields ?? [];
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const strings = Array.isArray(snapshot.strings) ? snapshot.strings : [];
  const fieldCount = nodeFields.length;

  if (fieldCount === 0 || nodes.length === 0) {
    return emptyStats(snapshot.snapshot?.edge_count ?? 0);
  }

  const typeIndex = nodeFields.indexOf('type');
  const nameIndex = nodeFields.indexOf('name');
  const selfSizeIndex = nodeFields.indexOf('self_size');
  const detachednessIndex = nodeFields.indexOf('detachedness');

  const nodeTypeNames =
    typeIndex >= 0 && Array.isArray(meta?.node_types?.[typeIndex])
      ? (meta?.node_types?.[typeIndex] as string[])
      : [];

  let totalSizeBytes = 0;
  let detachedNodeCount = 0;
  const byConstructor = new Map<string, { count: number; selfSizeBytes: number }>();

  for (let offset = 0; offset + fieldCount <= nodes.length; offset += fieldCount) {
    const selfSize = selfSizeIndex >= 0 ? nodes[offset + selfSizeIndex] ?? 0 : 0;
    totalSizeBytes += selfSize;

    const nameValue = nameIndex >= 0 ? nodes[offset + nameIndex] : -1;
    const name = nameValue >= 0 && nameValue < strings.length ? strings[nameValue] : '';

    const typeValue = typeIndex >= 0 ? nodes[offset + typeIndex] : -1;
    const typeName = typeValue >= 0 && typeValue < nodeTypeNames.length ? nodeTypeNames[typeValue] : '';

    const detachedByField = detachednessIndex >= 0 && nodes[offset + detachednessIndex] === DETACHED_FIELD_VALUE;
    if (detachedByField || name.startsWith('Detached')) {
      detachedNodeCount += 1;
    }

    if (typeName === 'object' || typeName === 'native') {
      const entry = byConstructor.get(name) ?? { count: 0, selfSizeBytes: 0 };
      entry.count += 1;
      entry.selfSizeBytes += selfSize;
      byConstructor.set(name, entry);
    }
  }

  const topConstructors = [...byConstructor.entries()]
    .map(([name, value]) => ({ name: name || '(anonymous)', count: value.count, selfSizeBytes: value.selfSizeBytes }))
    .sort((left, right) => right.count - left.count)
    .slice(0, TOP_CONSTRUCTOR_LIMIT);

  return {
    nodeCount: snapshot.snapshot?.node_count ?? Math.floor(nodes.length / fieldCount),
    edgeCount: snapshot.snapshot?.edge_count ?? 0,
    totalSizeBytes,
    detachedNodeCount,
    topConstructors,
  };
}
