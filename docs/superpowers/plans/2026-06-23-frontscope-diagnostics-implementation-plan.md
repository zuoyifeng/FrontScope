# FrontScope Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build FrontScope from a basic local evidence collector into a frontend AI diagnostics tool covering webpage performance diagnostics, loading/network diagnostics, runtime exceptions, memory-risk evidence, and local frontend code review evidence.

**Architecture:** Keep scanners independent and evidence-first. Each scanner writes structured evidence and module errors into `ScanResult`; report generation consumes evidence only; AI diagnosis consumes compact evidence with explicit evidence ids. New modules should degrade independently so one failed scanner does not prevent a partial report.

**Tech Stack:** React, Ant Design, TypeScript, Hono, Playwright, Lighthouse, Chrome DevTools Protocol, Zod, Vitest, optional CLI integrations for ESLint, TypeScript, pnpm audit, Knip, and Madge.

---

## Current Baseline

Current implemented modules:

- Runtime scanner: Playwright page open, console errors, page errors, failed requests, HTTP errors, screenshot.
- Lighthouse scanner: scores, core metrics, failed audits.
- Performance Trace scanner: Chrome trace file, long tasks, layout/style/paint/loading summary, layout shifts.
- Network scanner: CDP request events, transfer size, cache flags, slow requests, large resources, failed requests.
- Package scanner: package manager, scripts, dependencies, framework hints, config files.
- AI analyzer: evidence compaction, mock provider, schema validation, evidence id guardrail, Markdown AI section.
- Report writer: `scan.json`, `report.md`.
- Failure model: scanner module errors are recorded without aborting the whole scan.

Current key gaps:

- Network still lacks interactive waterfall UI, render-blocking hints, and deeper blocking-chain analysis.
- Performance Trace still lacks interactive flame chart, full call tree, and user interaction trace flows.
- Local code quality and frontend logic/interaction review are not implemented.
- Memory diagnosis is not implemented.
- API and UI tests are still thin.

## Version Roadmap

| Version | Theme | Acceptance |
| --- | --- | --- |
| V0.2 | AI Evidence Report | Existing scan evidence produces structured AI diagnosis and Markdown report |
| V0.3 | Network Diagnosis | Report includes waterfall-style network summary, cache, slow requests, large resources |
| V0.4 | Performance Trace | Report includes trace file, long tasks, rendering/layout/paint summary |
| V0.5 | Project Quality And Local Code Review | Report includes typecheck/lint/audit/unused dependency/circular dependency evidence and local code review hints |
| V0.6 | Memory Diagnosis | Report includes heap snapshot artifact and operation-before/after memory comparison |

---

## V0.2 AI Evidence Report

### Files

- Create: `scanner/ai/types.ts`
- Create: `scanner/ai/evidenceCompactor.ts`
- Create: `scanner/ai/aiProvider.ts`
- Create: `scanner/ai/aiAnalyzer.ts`
- Create: `scanner/ai/aiAnalyzer.test.ts`
- Create: `scanner/ai/evidenceCompactor.test.ts`
- Modify: `scanner/types.ts`
- Modify: `scanner/scan/runScan.ts`
- Modify: `scanner/report/writeReport.ts`
- Modify: `server/api.ts`
- Modify: `src/App.tsx`
- Modify: `README.md`

### Task 1: Define AI Diagnosis Schema

- [ ] Add `AiDiagnosis`, `AiIssue`, `EvidenceReference`, `AiProviderConfig` types.
- [ ] Add Zod schema that accepts only:
  - `healthLevel`: `good | warning | critical`
  - `topIssues[].severity`: `high | medium | low`
  - `topIssues[].category`: `runtime | performance | network | dependency | code-quality | project`
- [ ] Test invalid category, invalid severity, missing evidence reference.
- [ ] Verify: `pnpm exec vitest run scanner/ai/aiAnalyzer.test.ts`

### Task 2: Build Evidence Compactor

- [ ] Convert `ScanResult` into compact evidence items with stable ids:
  - `runtime.console.0`
  - `runtime.pageError.0`
  - `runtime.http.0`
  - `lighthouse.metric.lcp`
  - `lighthouse.audit.<auditId>`
  - `package.dependency.<name>`
- [ ] Include only actionable fields, not full raw JSON.
- [ ] Test compacted output for a sample scan.
- [ ] Verify evidence ids are deterministic.

### Task 3: Implement AI Provider Interface

- [ ] Add provider interface:
  - `generateDiagnosis(input): Promise<string>`
- [ ] Add `mock` provider for tests.
- [ ] Add environment-based provider selection but keep unsupported providers as clear errors.
- [ ] Do not call external AI by default in tests.

### Task 4: Implement Evidence Guardrail

- [ ] Reject AI issues whose `evidenceIds` do not exist in compacted evidence.
- [ ] Reject issues with empty `evidenceIds`.
- [ ] Preserve AI provider errors as module errors.
- [ ] Test all failure branches.

### Task 5: Upgrade Markdown Report

- [ ] Add AI summary section.
- [ ] Add health level.
- [ ] Add top issues table.
- [ ] For each issue include:
  - evidence ids
  - possible cause
  - suggestion
  - verify method
- [ ] If AI is unavailable, show “AI 诊断未生成” and keep raw evidence sections.
- [ ] Test Markdown content with string assertions.

### Task 6: API and UI Integration

- [ ] Add API option `enableAi: boolean`.
- [ ] Add UI toggle “生成 AI 诊断”.
- [ ] Show AI summary and top issue count after scan.
- [ ] Add UI failure state when AI fails but scan succeeds.
- [ ] Test App form submit with mocked fetch.

### V0.2 Acceptance

- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] CLI scan without AI still works.
- [ ] CLI scan with mock AI writes AI diagnosis into `scan.json` and `report.md`.
- [ ] AI output without evidence ids is rejected.

---

## V0.3 Network Diagnosis

### Files

- Create: `scanner/scanners/networkScanner.ts`
- Create: `scanner/scanners/networkScanner.test.ts`
- Create: `scanner/network/networkSummary.ts`
- Create: `scanner/network/networkSummary.test.ts`
- Modify: `scanner/types.ts`
- Modify: `scanner/scanners/runtimeScanner.ts`
- Modify: `scanner/scan/runScan.ts`
- Modify: `scanner/report/writeReport.ts`
- Modify: `src/App.tsx`
- Modify: `docs/devtools-capability-roadmap.md`

### Task 1: Define Network Evidence Types

- [ ] Add `NetworkRequestEvidence`:
  - url
  - method
  - resourceType
  - status
  - statusText
  - mimeType
  - priority
  - initiatorType
  - fromDiskCache
  - fromMemoryCache
  - transferSize
  - encodedBodySize
  - decodedBodySize
  - timing
- [ ] Add `NetworkSummaryEvidence`:
  - totalRequests
  - failedRequests
  - totalTransferSize
  - cacheHitRatio
  - slowRequests
  - largeResources

### Task 2: Capture CDP Network Events

- [ ] Use Playwright `context.newCDPSession(page)` or page-compatible abstraction.
- [ ] Listen to:
  - `Network.requestWillBeSent`
  - `Network.responseReceived`
  - `Network.loadingFinished`
  - `Network.loadingFailed`
- [ ] Join events by `requestId`.
- [ ] Keep existing runtime request failure collection.
- [ ] Test with fixture events instead of live browser.

### Task 3: Build Network Summary

- [ ] Mark slow request when total duration exceeds 1000ms.
- [ ] Mark large resource when transfer size exceeds 500KB.
- [ ] Calculate cache hit ratio from disk/memory cache flags.
- [ ] Sort top lists descending by duration or size.
- [ ] Test edge cases: missing timing, failed request, cached request.

### Task 4: Report Network Evidence

- [ ] Add Markdown section “Network 资源诊断”.
- [ ] Include total requests, failed requests, total transfer size, cache hit ratio.
- [ ] Include top 5 slow requests.
- [ ] Include top 5 large resources.
- [ ] Include failed requests table.

### Task 5: UI Network Summary

- [ ] Add card for total requests.
- [ ] Add card for cache hit ratio.
- [ ] Add card for slow request count.
- [ ] Add card for failed request count.

### V0.3 Acceptance

- [ ] Network tests pass.
- [ ] Existing runtime tests pass.
- [ ] Real CLI scan includes network section in `scan.json` and `report.md`.
- [ ] No response body is stored.

---

## V0.4 Performance Trace Diagnosis

### Files

- Create: `scanner/scanners/performanceTraceScanner.ts`
- Create: `scanner/scanners/performanceTraceScanner.test.ts`
- Create: `scanner/performance/traceParser.ts`
- Create: `scanner/performance/traceParser.test.ts`
- Create: `scanner/performance/fixtures/basic-trace.json`
- Modify: `scanner/types.ts`
- Modify: `scanner/scan/runScan.ts`
- Modify: `scanner/report/writeReport.ts`
- Modify: `src/App.tsx`

### Task 1: Define Trace Evidence Types

- [ ] Add `PerformanceTraceEvidence`:
  - tracePath
  - totalDurationMs
  - longTasks
  - categoryDurations
  - layoutEvents
  - styleEvents
  - paintEvents
  - layoutShifts
- [ ] Add `LongTaskEvidence` with start, duration, topLevelEvent, stackSummary.
- [ ] Add `LayoutShiftEvidence` with start, score, impactedNodes if available.

### Task 2: Record Chrome Trace

- [ ] Use Playwright/CDP tracing for categories:
  - `devtools.timeline`
  - `disabled-by-default-devtools.timeline`
  - `loading`
  - `blink.user_timing`
  - `v8`
- [ ] Save raw trace to report directory.
- [ ] Keep trace recording optional through scan input.
- [ ] Default enabled in CLI after V0.4 only if overhead is acceptable.

### Task 3: Parse Trace Fixtures

- [ ] Detect long tasks by main-thread task duration over 50ms.
- [ ] Aggregate scripting/rendering/painting/loading.
- [ ] Extract `Layout`, `RecalculateStyles`, `Paint`, `CompositeLayers`.
- [ ] Extract `LayoutShift` events.
- [ ] Test parser with fixture.

### Task 4: Report Performance Trace

- [ ] Add Markdown section “Performance Trace 诊断”.
- [ ] Include trace file path.
- [ ] Include long task count and top 5 long tasks.
- [ ] Include rendering/layout/paint summary.
- [ ] Include layout shift summary.

### V0.4 Acceptance

- [ ] Trace parser fixture tests pass.
- [ ] Real scan can save trace file.
- [ ] Markdown links trace path.
- [ ] If trace fails, other modules still write reports.

---

## V0.5 Project Quality And Local Code Review

### Files

- Create: `scanner/projectQuality/commandRunner.ts`
- Create: `scanner/projectQuality/eslintScanner.ts`
- Create: `scanner/projectQuality/typecheckScanner.ts`
- Create: `scanner/projectQuality/auditScanner.ts`
- Create: `scanner/projectQuality/knipScanner.ts`
- Create: `scanner/projectQuality/circularDependencyScanner.ts`
- Create: `scanner/projectQuality/projectQualityScanner.test.ts`
- Modify: `scanner/types.ts`
- Modify: `scanner/scan/runScan.ts`
- Modify: `scanner/report/writeReport.ts`
- Modify: `README.md`

### Task 1: Command Runner

- [ ] Create safe command runner with timeout.
- [ ] Capture exit code, stdout, stderr, duration.
- [ ] Never shell interpolate user input.
- [ ] Test success, failure, timeout.

### Task 2: TypeScript Check

- [ ] Detect `tsconfig.json`.
- [ ] Run project package manager command if available:
  - prefer script containing `typecheck`
  - fallback `pnpm exec tsc --noEmit`
- [ ] Parse output minimally into raw evidence.

### Task 3: ESLint Check

- [ ] Detect eslint config.
- [ ] Run `pnpm exec eslint . --format json`.
- [ ] Parse severity counts and top files.
- [ ] If no eslint config, record skipped reason.

### Task 4: Dependency Risk

- [ ] Run `pnpm audit --json` for pnpm projects.
- [ ] Parse vulnerability severity counts.
- [ ] Add outdated dependency check later, not in first V0.5 task.

### Task 5: Unused and Circular Dependencies

- [ ] Integrate Knip if installed; otherwise record install suggestion.
- [ ] Integrate Madge if installed; otherwise record install suggestion.
- [ ] Do not install tools automatically without explicit user action.

### Task 6: Project Quality Report

- [ ] Add Markdown section “项目质量诊断”.
- [ ] Include typecheck, lint, audit, unused dependency, circular dependency summaries.
- [ ] Feed findings into AI evidence compactor.

### Task 7: Local Frontend Code Review

- [ ] Review only local project files; do not send source code externally by default.
- [ ] Detect risky frontend patterns:
  - heavy synchronous work in components
  - unstable React keys
  - avoidable re-render patterns
  - duplicated request/loading/error state handling
  - missing empty/loading/error interaction states
- [ ] Start with AST/rule-based evidence and let AI explain only evidence-backed issues.
- [ ] Keep findings as review hints, not automatic code changes.

### V0.5 Acceptance

- [ ] Project quality scanner works when tools are present.
- [ ] Missing tools are skipped with clear reasons.
- [ ] No command mutates target project.
- [ ] Code review findings include file path, line or symbol, reason, and verification method.

---

## V0.6 Memory Diagnosis

### Files

- Create: `scanner/memory/heapSnapshotScanner.ts`
- Create: `scanner/memory/heapSnapshotScanner.test.ts`
- Create: `scanner/memory/memorySummary.ts`
- Create: `scanner/memory/memorySummary.test.ts`
- Modify: `scanner/types.ts`
- Modify: `scanner/scan/runScan.ts`
- Modify: `scanner/report/writeReport.ts`
- Modify: `src/App.tsx`

### Task 1: Capture Heap Snapshot Artifact

- [ ] Use Chrome DevTools Protocol `HeapProfiler.takeHeapSnapshot`.
- [ ] Save `.heapsnapshot` file into output directory.
- [ ] Record file path and snapshot size.
- [ ] Keep memory capture optional because it is slower than normal scan.

### Task 2: Operation Before/After Comparison

- [ ] Support a simple scripted interaction hook in later versions.
- [ ] Capture snapshot before and after the operation.
- [ ] Compare object count and retained-size signals when data is available.
- [ ] Avoid claiming memory leaks from a single page open.

### Task 3: Memory Summary

- [ ] Report heap artifact path.
- [ ] Report total nodes/edges if parsable.
- [ ] Report obvious retained-size growth only when before/after evidence exists.
- [ ] Feed memory evidence into AI compactor with explicit confidence wording.

### Task 4: Report Memory Evidence

- [ ] Add Markdown section “Memory 内存诊断”.
- [ ] Include heap snapshot artifact path.
- [ ] Include before/after comparison if available.
- [ ] Include limitations and manual verification method.

### V0.6 Acceptance

- [ ] Heap snapshot can be generated for Chromium pages.
- [ ] Memory report avoids unsupported leak conclusions.
- [ ] If memory capture fails, other modules still write reports.

---

## Cross-Cutting Tasks

### Testing Upgrade

- [ ] Add API tests for `/api/scan`.
- [ ] Add UI submit tests with mocked fetch.
- [ ] Add Markdown report tests.
- [ ] Add one CLI smoke test script for local page scan.

### Configuration

- [ ] Add `frontscope.config.ts` later only when defaults become insufficient.
- [ ] Keep CLI flags as the primary control surface until V0.4.

### Documentation

- [ ] Keep README focused on quick start.
- [ ] Keep detailed feature scope under `docs/`.
- [ ] Update `docs/devtools-capability-roadmap.md` after each version lands.

### Release Criteria Per Version

Each version must pass:

```bash
pnpm test
pnpm build
pnpm scan --project /path/to/project --url http://127.0.0.1:5173 --name 首页 --output /tmp/frontscope-verify
```

Each version must produce:

```text
scan.json
report.md
screenshot.png
```

Each version must document:

- What evidence was added.
- What is intentionally not implemented.
- How to verify manually.

## Recommended Execution

Execute V0.2 first. Do not start V0.3 until:

- AI report schema is stable.
- Evidence ids are stable.
- Markdown report can render AI and non-AI reports.
- Tests cover provider failure and evidence guardrail failure.

After V0.2, V0.3 and V0.4 can be implemented independently because Network and Performance Trace are separate evidence modules.
