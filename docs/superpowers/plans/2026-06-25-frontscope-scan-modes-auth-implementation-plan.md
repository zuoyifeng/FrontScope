# FrontScope Scan Modes And Auth Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split FrontScope scanning into local developer mode and online monitoring mode, simplify the scan entry, move AI credentials to project configuration, remove viewport selection from user-facing flows, and support authenticated online pages through reusable Playwright auth profiles.

**Architecture:** Add `scanMode` as a first-class scan input and keep scanner modules evidence-first. Local mode runs page evidence plus local project evidence. Online mode runs page evidence only and can attach an auth profile. UI becomes a mode-based form. Auth profiles are created by a dedicated API that saves Playwright `storageState` under `.frontscope/auth`. Reports explicitly show mode, auth profile usage, final URL, and target-match status.

**Tech Stack:** React, Ant Design, TypeScript, Hono, Playwright, Lighthouse, Chrome DevTools Protocol, Zod, Vitest, Testing Library, existing FrontScope AI config loader.

---

## Current Baseline

Relevant current files:

- `scanner/types.ts`
- `scanner/scan/validateInput.ts`
- `scanner/scan/runScan.ts`
- `scanner/report/writeReport.ts`
- `scanner/history/scanHistory.ts`
- `scanner/history/scanComparison.ts`
- `scanner/auth/saveAuthState.ts`
- `scanner/ai/config.ts`
- `server/api.ts`
- `src/App.tsx`
- `src/features/scans/ScanResultView.tsx`
- `README.md`
- `docs/frontscope-product-spec.md`
- `docs/devtools-capability-roadmap.md`

Current behavior:

- `viewport` exists in `ScanInput` and UI.
- `projectPath` is optional, but project evidence only runs when it exists.
- AI config is resolved via layered `resolveLayeredAiConfig()` (FrontScope install dir + optional `{projectPath}/frontscope.config.json` overlay + env); scan form does not accept credentials.
- `pnpm dev` starts the web UI and API together via `concurrently`.
- Async scan progress is exposed at `GET /api/scan/progress/:id`; the UI polls every 500ms.
- Right-side panels reflect real evidence-module and readiness state (not static placeholders).
- `saveAuthState` already saves Playwright storage state, but no API/UI flow exposes reusable auth profiles.
- Runtime evidence already records target URL matching signals.
- History comparison exists and currently matches primarily by URL and viewport.

## Implementation Tasks

### Task 1: Add Scan Mode To Core Types And Validation

#### Files

- Modify: `scanner/types.ts`
- Modify: `scanner/scan/validateInput.ts`
- Modify: `scanner/scan/validateInput.test.ts`

#### Steps

- [ ] Add a `ScanMode` type and `scanMode` field.
- [ ] Default missing `scanMode` conservatively:
  - `local` when `projectPath` exists.
  - `online` when `projectPath` is absent.
- [ ] Keep `viewport` accepted for compatibility, but default it to `desktop` whenever omitted.
- [ ] Enforce local-mode project path requirement.
- [ ] Allow online mode without project path.
- [ ] Reject invalid scan mode values.

#### Implementation Sketch

```ts
export type ScanMode = "local" | "online";

export interface ScanInput {
  scanMode?: ScanMode;
  projectPath?: string;
  url: string;
  viewport?: ViewportPreset;
  pageName?: string;
  outputDir?: string;
  authStatePath?: string;
  enableAi?: boolean;
  enableMemory?: boolean;
  memoryReloadRounds?: number;
  ai?: Partial<AiProviderConfig>;
}
```

Validation should return a normalized object:

```ts
const normalizedMode = input.scanMode ?? (input.projectPath ? "local" : "online");
const normalizedViewport = input.viewport ?? "desktop";

if (normalizedMode === "local" && !input.projectPath) {
  throw new Error("local mode requires projectPath");
}
```

#### Tests

- [ ] `local` without `projectPath` fails.
- [ ] `online` without `projectPath` passes.
- [ ] missing `scanMode` plus `projectPath` becomes local.
- [ ] missing `scanMode` without `projectPath` becomes online.
- [ ] missing `viewport` becomes desktop.

#### Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/scan/validateInput.test.ts
```

Expected: validation tests pass.

### Task 2: Gate Project Evidence By Local Mode

#### Files

- Modify: `scanner/scan/runScan.ts`
- Modify: `scanner/report/writeReport.ts`
- Modify: `scanner/scan/runScan.test.ts`
- Modify: `scanner/types.ts`

#### Steps

- [ ] Use normalized `scanMode` throughout `runScan`.
- [ ] Run package/project-quality evidence only when `scanMode === "local"` and `projectPath` exists.
- [ ] In online mode, record module status as skipped with reason:

```text
online mode cannot read local project files
```

- [ ] Add `scanMode` and `projectEvidenceEnabled` into `ScanResult`.
- [ ] Ensure AI compaction does not generate code-quality evidence from skipped local modules.

#### Implementation Sketch

```ts
const shouldScanProject = input.scanMode === "local" && Boolean(input.projectPath);

if (shouldScanProject) {
  result.package = await scanPackage(input.projectPath);
} else {
  result.modules.push({
    name: "project",
    status: "skipped",
    reason: "online mode cannot read local project files",
  });
}
```

#### Tests

- [ ] Local mode calls package scanner.
- [ ] Online mode does not call package scanner.
- [ ] Online result still includes runtime, network, trace, report, and history output.
- [ ] Report includes skipped project evidence explanation.

#### Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/scan/runScan.test.ts
```

Expected: run-scan tests pass.

### Task 3: Update History Matching For Mode-Based Results

#### Files

- Modify: `scanner/history/scanHistory.ts`
- Modify: `scanner/history/scanComparison.ts`
- Modify: `scanner/history/scanHistory.test.ts`
- Modify: `scanner/history/scanComparison.test.ts`

#### Steps

- [ ] Store `scanMode` in history entries.
- [ ] Match previous scans by `scanMode`, normalized URL, and `pageName`.
- [ ] Stop using user-facing viewport as a required match dimension.
- [ ] Keep reading old entries without `scanMode` by treating them as compatible only when the current mode is inferred from the old input.

#### Implementation Sketch

```ts
function getHistoryKey(input: ScanInput) {
  return {
    scanMode: input.scanMode ?? (input.projectPath ? "local" : "online"),
    url: normalizeUrl(input.url),
    pageName: input.pageName ?? "",
  };
}
```

#### Tests

- [ ] Local and online scans for the same URL do not compare against each other.
- [ ] Same mode and same URL compare even when viewport is omitted.
- [ ] Old history entries without `scanMode` remain readable.

#### Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/history/scanHistory.test.ts scanner/history/scanComparison.test.ts
```

Expected: history tests pass.

### Task 4: Move AI Inputs Out Of The Scan Form

#### Files

- Modify: `src/App.tsx`
- Delete if unused: `src/features/scans/aiFormPrefs.ts`
- Modify: `src/App.test.tsx`
- Modify: `server/api.ts`
- Modify: `scanner/scan/validateInput.ts`

#### Steps

- [ ] UI fetches `/api/ai/status` on load.
- [ ] If AI config is ready, default `enableAi` to true.
- [ ] If AI config is not ready, default `enableAi` to false and show configuration status.
- [ ] Remove AI base URL, API key, model, and auth header fields from the scan form.
- [ ] Stop persisting AI credentials in local storage.
- [ ] Keep server-side API support for `ai` in request body only for compatibility and tests.
- [ ] Prefer `resolveEffectiveAiConfig` from `scanner/ai/config.ts` during scan execution.

#### Implementation Sketch

```tsx
const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

useEffect(() => {
  fetch("/api/ai/status")
    .then((res) => res.json())
    .then((status) => {
      setAiStatus(status);
      setEnableAi(Boolean(status.ready));
    });
}, []);
```

Payload should only include:

```ts
{
  scanMode,
  url,
  projectPath,
  outputDir,
  pageName,
  authStatePath,
  enableAi,
}
```

#### Tests

- [ ] App does not render AI credential inputs.
- [ ] App submits `enableAi: true` when `/api/ai/status` reports ready.
- [ ] App submits no `ai` object from the UI.
- [ ] App shows config-not-ready state.

#### Verify

```bash
rtk pnpm exec vitest run src/App.test.tsx
```

Expected: App tests pass. If the local jsdom config hits the known parent-package sandbox issue, verify with the project-specific workaround already used in this repo and document the exact command output.

### Task 5: Simplify The Scan Entry UI Around Modes

#### Files

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/features/scans/ScanResultView.tsx`
- Modify: `src/features/scans/ScanResultView.test.tsx`

#### Steps

- [ ] Add a segmented control or radio group for `local` and `online`.
- [ ] In local mode, show target URL and project path.
- [ ] In online mode, show target URL and auth profile selector.
- [ ] Move page name and output directory into an advanced section.
- [ ] Remove viewport selection from UI.
- [ ] Submit no `viewport` field from UI.
- [ ] Display scan mode in result summary.
- [ ] Display skipped local evidence clearly in online results.

#### Implementation Sketch

```tsx
<Segmented
  value={scanMode}
  onChange={(value) => setScanMode(value as ScanMode)}
  options={[
    { label: "本地模式", value: "local" },
    { label: "线上模式", value: "online" },
  ]}
/>
```

Conditional fields:

```tsx
{scanMode === "local" ? (
  <Input value={projectPath} onChange={(event) => setProjectPath(event.target.value)} />
) : (
  <Select value={authStatePath} onChange={setAuthStatePath} options={authProfileOptions} />
)}
```

#### Tests

- [ ] Local mode renders project path input.
- [ ] Online mode renders auth profile selector.
- [ ] Viewport controls are absent.
- [ ] Submitted payload includes `scanMode`.
- [ ] Submitted payload omits `viewport`.

#### Verify

```bash
rtk pnpm exec vitest run src/App.test.tsx src/features/scans/ScanResultView.test.tsx
```

Expected: UI tests pass under the applicable Vitest config.

### Task 6: Add Auth Profile Storage Utilities

#### Files

- Create: `scanner/auth/authProfile.ts`
- Create: `scanner/auth/authProfile.test.ts`
- Modify: `scanner/auth/saveAuthState.ts`

#### Steps

- [ ] Add profile-name validation: allow letters, numbers, dash, underscore, and dot.
- [ ] Reject path traversal and empty names.
- [ ] Resolve auth profile path to `.frontscope/auth/<profileName>.json`.
- [ ] Ensure the auth directory exists before saving.
- [ ] Return only safe display metadata to callers.

#### Implementation Sketch

```ts
export function assertSafeProfileName(profileName: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(profileName)) {
    throw new Error("auth profile name may only contain letters, numbers, dot, dash, and underscore");
  }
}

export function resolveAuthProfilePath(profileName: string, baseDir = process.cwd()) {
  assertSafeProfileName(profileName);
  return path.join(baseDir, ".frontscope", "auth", `${profileName}.json`);
}
```

#### Tests

- [ ] Valid names resolve under `.frontscope/auth`.
- [ ] `../secret` is rejected.
- [ ] empty profile name is rejected.
- [ ] returned display metadata does not expose unrelated absolute paths.

#### Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/auth/authProfile.test.ts
```

Expected: auth-profile utility tests pass.

### Task 7: Add Auth Profile API Routes

#### Files

- Modify: `server/api.ts`
- Create: `server/api.authProfiles.test.ts`
- Modify: `scanner/auth/saveAuthState.ts`

#### Steps

- [ ] Add `GET /api/auth-profiles`.
- [ ] Add `POST /api/auth-profiles`.
- [ ] `GET` lists `.frontscope/auth/*.json` as profile names and safe paths.
- [ ] `POST` accepts `profileName`, `loginUrl`, and optional `targetUrl`.
- [ ] `POST` calls `saveAuthState` with resolved output path.
- [ ] Return structured errors for invalid profile names and invalid URLs.
- [ ] Keep the interactive Playwright flow explicit in response state and UI copy.

#### Implementation Sketch

```ts
app.get("/api/auth-profiles", async (c) => {
  const profiles = await listAuthProfiles();
  return c.json({ profiles });
});

app.post("/api/auth-profiles", async (c) => {
  const body = await c.req.json();
  const authStatePath = resolveAuthProfilePath(body.profileName);
  await saveAuthState({
    loginUrl: body.loginUrl,
    targetUrl: body.targetUrl,
    outputPath: authStatePath,
  });
  return c.json({ profileName: body.profileName, authStatePath });
});
```

Testing should inject a fake auth-state driver or mocked `saveAuthState` so tests do not open a browser.

#### Tests

- [ ] Listing profiles returns existing JSON files.
- [ ] Posting invalid profile name returns 400.
- [ ] Posting valid body calls auth saver with resolved path.
- [ ] Auth route test does not launch real Chromium.

#### Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts server/api.authProfiles.test.ts
```

Expected: API auth-profile tests pass without launching a browser.

### Task 8: Add Auth Profile UI Flow

#### Files

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

#### Steps

- [ ] Fetch profile list from `GET /api/auth-profiles`.
- [ ] Show profile selector in online mode.
- [ ] Add a compact create-profile panel:
  - profile name
  - login URL
  - target URL
  - generate button
- [ ] When generating, call `POST /api/auth-profiles` and show “浏览器登录中” state.
- [ ] After success, refresh profile list and select the new profile.
- [ ] When online scan has no profile selected, allow scan but keep the selector empty.

#### Implementation Sketch

```tsx
async function createAuthProfile() {
  setAuthProfileStatus("running");
  const response = await fetch("/api/auth-profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profileName, loginUrl, targetUrl: url }),
  });
  const nextProfile = await response.json();
  await loadAuthProfiles();
  setAuthStatePath(nextProfile.authStatePath);
  setAuthProfileStatus("ready");
}
```

#### Tests

- [ ] Online mode loads profile list.
- [ ] Create profile calls POST with profile name, login URL, and target URL.
- [ ] Successful create selects returned auth path.
- [ ] Failed create shows error state.

#### Verify

```bash
rtk pnpm exec vitest run src/App.test.tsx
```

Expected: App auth-profile tests pass under the applicable UI test command.

### Task 9: Strengthen Target URL Match Reporting

#### Files

- Modify: `scanner/scanners/runtimeScanner.ts`
- Modify: `scanner/report/writeReport.ts`
- Modify: `scanner/types.ts`
- Modify: `src/features/scans/ScanResultView.tsx`
- Modify: related runtime/report/UI tests

#### Steps

- [ ] Ensure runtime evidence includes requested URL, final URL, and `targetUrlMatched`.
- [ ] Add a reason field when not matched:
  - `redirected-to-login`
  - `different-origin`
  - `different-path`
  - `unknown`
- [ ] In report, add a warning block when target is not matched.
- [ ] In UI, show a top-level warning before performance scores when target is not matched.
- [ ] In AI compaction, include the target-mismatch evidence id.

#### Implementation Sketch

```ts
export interface TargetUrlEvidence {
  requestedUrl: string;
  finalUrl: string;
  matched: boolean;
  mismatchReason?: "redirected-to-login" | "different-origin" | "different-path" | "unknown";
}
```

Simple login detection should be conservative:

```ts
const loginPattern = /login|signin|sso|auth/i;
```

#### Tests

- [ ] Same origin and same path matches.
- [ ] Redirect to `/login` produces `redirected-to-login`.
- [ ] Different origin produces `different-origin`.
- [ ] UI renders warning when `targetUrlMatched=false`.
- [ ] Report renders requested and final URLs.

#### Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/scanners/runtimeScanner.test.ts scanner/report/writeReport.test.ts
rtk pnpm exec vitest run src/features/scans/ScanResultView.test.tsx
```

Expected: runtime/report/UI target-match tests pass.

### Task 10: Update Docs And Configuration Guidance

#### Files

- Modify: `README.md`
- Modify: `docs/frontscope-product-spec.md`
- Modify: `docs/devtools-capability-roadmap.md`
- Modify: `docs/frontscope-v0.1-implementation-plan.md`
- Create or modify: `.gitignore`

#### Steps

- [ ] Document local mode and online mode separately.
- [ ] Remove instructions that tell users to enter AI credentials in the scan form.
- [ ] Document `frontscope.config.json` as the preferred AI config source (FrontScope install dir; local scans may overlay `{projectPath}/frontscope.config.json`).
- [ ] Document `pnpm dev` as the single command to start web UI and API together.
- [ ] Document AI diagnosis fields: `optimizationDirection`, `implementationSteps`, optional `codeHints`.
- [ ] Document async scan progress (`POST /api/scan` + `GET /api/scan/progress/:id`) and AI connectivity test (`POST /api/ai/test`).
- [ ] Document `.frontscope/auth/*.json` as local sensitive auth state.
- [ ] Add `.frontscope/auth/` to `.gitignore` if the repo has a `.gitignore`.
- [ ] Document that viewport selection is no longer a main scan input.
- [ ] Document that online mode cannot scan local code.

#### Example Config

```json
{
  "ai": {
    "provider": "openai-compatible",
    "baseURL": "https://api.example.com/v1",
    "model": "gpt-4.1-mini",
    "apiKeyEnv": "FRONTSCOPE_AI_API_KEY"
  }
}
```

#### Verify

```bash
rtk rg -n "视口|移动端|桌面端|apiKey|authHeader" README.md docs
```

Expected: no stale user-facing scan-entry instructions remain. Mentions in historical context are acceptable only when explicitly marked as deprecated or internal compatibility.

### Task 11: Full Verification

#### Steps

- [ ] Run node-focused tests.
- [ ] Run UI-focused tests.
- [ ] Build the app.
- [ ] If a known sandbox issue affects default UI tests, record the exact failure and the successful targeted alternative.

#### Commands

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts
rtk pnpm exec vitest run src/App.test.tsx src/features/scans/ScanResultView.test.tsx
rtk pnpm build
```

Expected:

- Node tests pass.
- Targeted UI tests pass or the known sandbox limitation is documented with exact output.
- Build passes. Existing Vite chunk-size warning is acceptable unless this task introduces a new warning.

## Acceptance Criteria

- [ ] Scan input supports `scanMode: "local" | "online"`.
- [ ] Local mode requires `projectPath` and runs local project evidence.
- [ ] Online mode works without `projectPath` and skips local project evidence with a clear reason.
- [ ] UI scan entry is mode-based and no longer shows viewport selection.
- [ ] UI does not expose AI credential fields.
- [ ] AI default state comes from `/api/ai/status`.
- [ ] Auth profiles can be listed and generated.
- [ ] Online scans can use saved auth profile storage state.
- [ ] Reports show scan mode, auth profile usage, requested URL, final URL, and target-match status.
- [ ] History comparison does not mix local and online scans.
- [ ] Documentation matches the new product model.

## Notes For Implementers

- Use CodeGraph before broad file search because this repository has `.codegraph/`.
- Keep existing API compatibility where low-cost, especially `viewport` and scan-body `ai`, but remove them from the primary UI.
- Do not print full `authStatePath` or cookie contents in reports.
- Treat `.frontscope/auth/*.json` as sensitive local state.
- This workspace may not be a Git repository; commit steps are intentionally omitted from this plan.
