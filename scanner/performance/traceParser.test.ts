// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTrace } from './traceParser.js';

describe('parseTrace', () => {
  it('extracts long tasks, rendering events, layout shifts, and category durations from a Chrome trace', () => {
    const trace = JSON.parse(readFileSync(join(__dirname, 'fixtures/basic-trace.json'), 'utf8'));

    const evidence = parseTrace(trace, '/tmp/frontscope/basic-trace.json');

    expect(evidence.tracePath).toBe('/tmp/frontscope/basic-trace.json');
    expect(evidence.totalDurationMs).toBe(100);
    expect(evidence.longTasks).toEqual([
      {
        start: 1000,
        duration: 82,
        topLevelEvent: 'RunTask',
        stackSummary: ['renderDashboard @ src/App.tsx:42', 'commitRoot @ react-dom.js:100'],
      },
    ]);
    expect(evidence.categoryDurations).toEqual({
      scripting: 82,
      rendering: 20,
      painting: 5,
      loading: 6,
    });
    expect(evidence.layoutEvents).toEqual([{ name: 'Layout', start: 1050, duration: 12 }]);
    expect(evidence.styleEvents).toEqual([{ name: 'RecalculateStyles', start: 1065, duration: 8 }]);
    expect(evidence.paintEvents).toEqual([{ name: 'Paint', start: 1080, duration: 5 }]);
    expect(evidence.layoutShifts).toEqual([
      {
        start: 1100,
        score: 0.12,
        impactedNodes: ['div.hero', 'img.banner'],
      },
    ]);
  });

  it('does not double count a nested long task inside its parent task', () => {
    const trace = {
      traceEvents: [
        // Parent top-level task (80ms) with a nested child task (60ms) inside it.
        { name: 'RunTask', cat: 'devtools.timeline', ph: 'X', ts: 0, dur: 80000, args: {} },
        { name: 'FunctionCall', cat: 'devtools.timeline', ph: 'X', ts: 10000, dur: 60000, args: {} },
      ],
    };

    const evidence = parseTrace(trace, '/tmp/nested.json');

    expect(evidence.longTasks).toHaveLength(1);
    expect(evidence.longTasks[0].topLevelEvent).toBe('RunTask');
    expect(evidence.longTasks[0].duration).toBe(80);
    // Union of [0,80] and [10,70] is just [0,80] = 80ms, not 140ms.
    expect(evidence.categoryDurations.scripting).toBe(80);
  });

  it('handles a large trace without overflowing the call stack', () => {
    const traceEvents = Array.from({ length: 200_000 }, (_, index) => ({
      name: 'Paint',
      cat: 'devtools.timeline',
      ph: 'X',
      ts: index * 10,
      dur: 1,
      args: {},
    }));

    expect(() => parseTrace({ traceEvents }, '/tmp/large.json')).not.toThrow();
  });
});
