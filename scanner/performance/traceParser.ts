import type {
  LayoutShiftEvidence,
  LongTaskEvidence,
  PerformanceTraceEvidence,
  TraceEventEvidence,
} from '../types.js';

const LONG_TASK_THRESHOLD_MS = 50;
const SCRIPTING_EVENTS = new Set([
  'RunTask',
  'EvaluateScript',
  'FunctionCall',
  'EventDispatch',
  'TimerFire',
  'RunMicrotasks',
  'v8.compile',
]);
const RENDERING_EVENTS = new Set(['Layout', 'RecalculateStyles', 'UpdateLayoutTree']);
const PAINTING_EVENTS = new Set(['Paint', 'RasterTask', 'CompositeLayers']);
const LOADING_EVENTS = new Set(['ResourceReceiveResponse', 'ResourceFinish', 'ParseHTML']);

interface TraceEvent {
  name?: string;
  cat?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  args?: {
    data?: {
      score?: number;
      impacted_nodes?: Array<{ node_name?: string }>;
      stackTrace?: Array<{
        functionName?: string;
        url?: string;
        lineNumber?: number;
      }>;
    };
  };
}

interface TracePayload {
  traceEvents?: TraceEvent[];
}

function isTracePayload(value: unknown): value is TracePayload {
  return typeof value === 'object' && value !== null && Array.isArray((value as TracePayload).traceEvents);
}

function toMs(value: number): number {
  return Number((value / 1000).toFixed(3));
}

function eventStartMs(event: TraceEvent): number {
  return toMs(event.ts ?? 0);
}

function eventDurationMs(event: TraceEvent): number {
  return toMs(event.dur ?? 0);
}

function toTraceEventEvidence(event: TraceEvent): TraceEventEvidence {
  return {
    name: event.name ?? 'unknown',
    start: eventStartMs(event),
    duration: eventDurationMs(event),
  };
}

/**
 * Compute the min ts and max (ts + dur) without spreading the whole array into
 * Math.min/Math.max, which overflows the call stack on large real traces.
 */
function computeTimeBounds(events: TraceEvent[]): { firstTs: number; lastTs: number } {
  let firstTs = Number.POSITIVE_INFINITY;
  let lastTs = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (typeof event.ts !== 'number') continue;
    const start = event.ts;
    const end = start + (event.dur ?? 0);
    if (start < firstTs) firstTs = start;
    if (end > lastTs) lastTs = end;
  }

  return { firstTs, lastTs };
}

/**
 * Keep only top-level events (not contained within another event's time span),
 * so a long `RunTask` and its nested children are not all reported as separate
 * long tasks. Assumes single-threaded ordering, which holds for the main thread
 * timeline events FrontScope records.
 */
function selectTopLevelEvents(completeEvents: TraceEvent[]): TraceEvent[] {
  const sorted = [...completeEvents].sort((left, right) => {
    const startDiff = (left.ts ?? 0) - (right.ts ?? 0);
    if (startDiff !== 0) return startDiff;
    return (right.dur ?? 0) - (left.dur ?? 0);
  });

  const topLevel: TraceEvent[] = [];
  let coveredUntil = Number.NEGATIVE_INFINITY;

  for (const event of sorted) {
    const start = event.ts ?? 0;
    const end = start + (event.dur ?? 0);
    if (start >= coveredUntil) {
      topLevel.push(event);
      coveredUntil = end;
    }
  }

  return topLevel;
}

/**
 * Sum the union of time intervals for a set of events, so nested same-category
 * events (e.g. EvaluateScript inside RunTask) are counted once instead of twice.
 */
function unionDurationMs(events: TraceEvent[]): number {
  const intervals = events
    .map((event) => [event.ts ?? 0, (event.ts ?? 0) + (event.dur ?? 0)] as const)
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);

  let totalUs = 0;
  let currentStart = Number.NEGATIVE_INFINITY;
  let currentEnd = Number.NEGATIVE_INFINITY;

  for (const [start, end] of intervals) {
    if (start > currentEnd) {
      if (currentEnd > currentStart) totalUs += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else if (end > currentEnd) {
      currentEnd = end;
    }
  }
  if (currentEnd > currentStart) totalUs += currentEnd - currentStart;

  return toMs(totalUs);
}

function stackSummary(event: TraceEvent): string[] {
  return (event.args?.data?.stackTrace ?? [])
    .map((frame) => {
      const functionName = frame.functionName || '(anonymous)';
      const url = frame.url || 'unknown';
      const lineNumber = typeof frame.lineNumber === 'number' ? `:${frame.lineNumber}` : '';
      return `${functionName} @ ${url}${lineNumber}`;
    })
    .slice(0, 5);
}

export function parseTrace(rawTrace: unknown, tracePath: string): PerformanceTraceEvidence {
  const traceEvents = isTracePayload(rawTrace) ? rawTrace.traceEvents ?? [] : [];
  const completeEvents = traceEvents.filter(
    (event) => event.ph === 'X' && typeof event.ts === 'number' && typeof event.dur === 'number',
  );
  const { firstTs, lastTs } = computeTimeBounds(traceEvents);
  const totalDurationMs =
    Number.isFinite(firstTs) && Number.isFinite(lastTs) && lastTs >= firstTs ? toMs(lastTs - firstTs) : 0;

  const longTasks: LongTaskEvidence[] = selectTopLevelEvents(completeEvents)
    .filter((event) => eventDurationMs(event) > LONG_TASK_THRESHOLD_MS)
    .map((event) => ({
      start: eventStartMs(event),
      duration: eventDurationMs(event),
      topLevelEvent: event.name ?? 'unknown',
      stackSummary: stackSummary(event),
    }))
    .sort((left, right) => right.duration - left.duration)
    .slice(0, 5);

  const eventsByCategory = {
    scripting: [] as TraceEvent[],
    rendering: [] as TraceEvent[],
    painting: [] as TraceEvent[],
    loading: [] as TraceEvent[],
  };
  const layoutEvents: TraceEventEvidence[] = [];
  const styleEvents: TraceEventEvidence[] = [];
  const paintEvents: TraceEventEvidence[] = [];
  const layoutShifts: LayoutShiftEvidence[] = [];

  for (const event of completeEvents) {
    const name = event.name ?? '';
    if (SCRIPTING_EVENTS.has(name)) eventsByCategory.scripting.push(event);
    if (RENDERING_EVENTS.has(name)) eventsByCategory.rendering.push(event);
    if (PAINTING_EVENTS.has(name)) eventsByCategory.painting.push(event);
    if (LOADING_EVENTS.has(name)) eventsByCategory.loading.push(event);

    if (name === 'Layout') layoutEvents.push(toTraceEventEvidence(event));
    if (name === 'RecalculateStyles' || name === 'UpdateLayoutTree') styleEvents.push(toTraceEventEvidence(event));
    if (name === 'Paint') paintEvents.push(toTraceEventEvidence(event));
  }

  const categoryDurations = {
    scripting: unionDurationMs(eventsByCategory.scripting),
    rendering: unionDurationMs(eventsByCategory.rendering),
    painting: unionDurationMs(eventsByCategory.painting),
    loading: unionDurationMs(eventsByCategory.loading),
  };

  for (const event of traceEvents) {
    if (event.name !== 'LayoutShift' || typeof event.ts !== 'number') continue;

    layoutShifts.push({
      start: eventStartMs(event),
      score: event.args?.data?.score ?? 0,
      impactedNodes: (event.args?.data?.impacted_nodes ?? [])
        .map((node) => node.node_name)
        .filter((nodeName): nodeName is string => Boolean(nodeName)),
    });
  }

  return {
    tracePath,
    totalDurationMs,
    longTasks,
    categoryDurations,
    layoutEvents,
    styleEvents,
    paintEvents,
    layoutShifts,
  };
}
