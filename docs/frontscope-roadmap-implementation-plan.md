# FrontScope Roadmap Implementation Plan

This plan breaks the next product gaps into contributor-sized slices. It is ordered by user risk: first avoid scanning the wrong protected page, then expand framework coverage, then simplify local project onboarding.

## Priority 1: Authenticated Route Coverage

### 1. Auth Profile Metadata

**Goal:** make saved login states visible, verifiable, and safe to reuse.

**Files:**

- `scanner/auth/authProfile.ts`
- `scanner/auth/authProfile.test.ts`
- `server/api.ts`
- `server/api.authProfiles.test.ts`
- `src/App.tsx`

**Steps:**

1. Add metadata next to each `.frontscope/auth/<profile>.json` file, using `.frontscope/auth/<profile>.meta.json`.
2. Store profile name, auth state path, login URL, target origin, created time, last verified time, and verification status.
3. Extend `listAuthProfiles()` to return metadata when present and remain compatible with older profiles.
4. Add tests that confirm no absolute local paths are leaked to the frontend.

**Verification:**

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/auth/authProfile.test.ts server/api.authProfiles.test.ts
```

### 2. Auth Profile Verification

**Goal:** detect whether a saved profile reaches the intended protected route or falls back to login.

**Files:**

- `scanner/auth/verifyAuthProfile.ts`
- `scanner/auth/verifyAuthProfile.test.ts`
- `server/api.ts`
- `server/api.authProfiles.test.ts`
- `src/App.tsx`

**Steps:**

1. Create an injectable Playwright verifier that opens a target URL with `storageState`.
2. Return `valid`, `login-redirect`, `unauthorized`, or `error` with final URL and message.
3. Add `POST /api/auth-profiles/:profileName/verify`.
4. Update metadata after each verification.
5. Show verification state in the scan form.

**Verification:**

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/auth/verifyAuthProfile.test.ts server/api.authProfiles.test.ts
rtk pnpm exec vitest run src/App.test.tsx
```

### 3. Protected Route Discovery

**Goal:** help users find candidate protected pages instead of manually typing every route.

**Files:**

- `scanner/routes/types.ts`
- `scanner/routes/discoverRoutes.ts`
- `scanner/routes/discoverRoutes.test.ts`
- `scanner/routes/runtimeCrawler.ts`
- `scanner/routes/runtimeCrawler.test.ts`

**Steps:**

1. Add a normalized `RouteCandidate` type with `path`, `source`, `confidence`, `file`, `reason`, and `requiresAuth`.
2. Extract file-based routes from Next `app/`, Next `pages/`, and Nuxt `pages/`.
3. Add later adapters for React Router, Vue Router, Angular Router, and Solid Router config.
4. Add an authenticated same-origin crawler that runs after profile verification.
5. Exclude logout, destructive, external, download, and mutation-like URLs by default.

**Verification:**

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/routes
```

## Priority 2: Framework-Neutral Project Evidence

### 4. Framework Detector

**Goal:** detect common frontend stacks before choosing static-analysis rules.

**Files:**

- `scanner/frameworks/types.ts`
- `scanner/frameworks/detectFramework.ts`
- `scanner/frameworks/detectFramework.test.ts`
- `scanner/projectQuality/projectQualityScanner.ts`
- `scanner/types.ts`

**Steps:**

1. Detect React, Vue, Angular, Next.js, Nuxt, Solid, Vite, Webpack, and JavaScript-only projects from `package.json`, lockfiles, and config files.
2. Return framework, confidence, and signals.
3. Keep existing `frameworkHints` for compatibility and add richer `frameworkDetections`.
4. Add fixture tests for each supported framework family.

**Verification:**

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/frameworks/detectFramework.test.ts scanner/projectQuality/projectQualityScanner.test.ts
```

### 5. Static Review Adapters

**Goal:** prevent React-specific rules from being reported as universal frontend advice.

**Files:**

- `scanner/frameworks/adapters/reactAdapter.ts`
- `scanner/frameworks/adapters/vueAdapter.ts`
- `scanner/frameworks/adapters/javascriptAdapter.ts`
- `scanner/frameworks/adapters/frameworkAdapters.test.ts`
- `scanner/projectQuality/codeReview.ts`

**Steps:**

1. Move current JSX list-key and unsafe HTML rules into a React adapter.
2. Add a Vue SFC adapter for missing `:key` on `v-for` and unsafe `v-html`.
3. Add a JavaScript adapter path for `.js` and `.jsx` projects without TypeScript type information.
4. Add adapter-level confidence so reports do not overstate JS-only or regex-backed findings.
5. Add Angular, Nuxt, Next.js, and Solid adapters one framework at a time.

**Verification:**

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/projectQuality/codeReview.test.ts scanner/frameworks/adapters/frameworkAdapters.test.ts
```

### 6. Framework-Specific Route Evidence

**Goal:** feed route candidates and framework context into reports and AI diagnosis.

**Files:**

- `scanner/routes/frameworkRoutes.ts`
- `scanner/routes/frameworkRoutes.test.ts`
- `scanner/ai/evidenceCompactor.ts`
- `scanner/report/writeReport.ts`

**Steps:**

1. Normalize static route extraction output into evidence ids.
2. Include source framework and confidence in every route finding.
3. Teach report generation to show discovered route candidates separately from scanned routes.
4. Compact route evidence for AI without exposing local absolute paths.

**Verification:**

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/routes scanner/ai/evidenceCompactor.test.ts scanner/report/writeReport.test.ts
```

## Priority 3: Zero-Config Local Project Mode

### 7. Local Project Intake

**Goal:** let users provide a project folder first, then review what FrontScope detected before anything runs.

**Files:**

- `scanner/localProject/projectIntake.ts`
- `scanner/localProject/projectIntake.test.ts`
- `server/api.ts`
- `src/App.tsx`

**Steps:**

1. Add `POST /api/local-projects/inspect` with body `{ "projectPath": "/absolute/path" }`.
2. Detect package manager from lockfiles.
3. Read `package.json` scripts and identify likely `dev`, `start`, `serve`, or `preview` scripts.
4. Return detected frameworks and route candidates.
5. Show an intake summary in the UI before running scripts.

**Verification:**

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/localProject/projectIntake.test.ts server/api.test.ts
rtk pnpm exec vitest run src/App.test.tsx
```

### 8. Safe Sandbox Runner

**Goal:** run local projects with explicit user consent and reliable cleanup.

**Files:**

- `scanner/localProject/portAllocator.ts`
- `scanner/localProject/sandboxRunner.ts`
- `scanner/localProject/sandboxRunner.test.ts`
- `scanner/scan/runScan.ts`

**Steps:**

1. Find an available local port.
2. Start only an approved package script.
3. Capture stdout and stderr into scan artifacts.
4. Apply startup timeout and cancellation cleanup.
5. Prefer existing dependencies and ask before installing anything.

**Verification:**

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/localProject/sandboxRunner.test.ts scanner/scan/runScan.test.ts
```

### 9. Route Selection And Scan Sets

**Goal:** scan multiple chosen routes and produce route-level reports.

**Files:**

- `scanner/scan/scanSet.ts`
- `scanner/scan/scanSet.test.ts`
- `scanner/report/writeReport.ts`
- `src/features/scans/ScanResultView.tsx`

**Steps:**

1. Let users select route candidates before scanning.
2. Run selected routes sequentially at first to keep resource usage predictable.
3. Store per-route result files plus one summary report.
4. Compare each route against its previous scan history.
5. Show route-level target-hit status, runtime health, Lighthouse score, and major failures.

**Verification:**

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/scan/scanSet.test.ts scanner/report/writeReport.test.ts src/features/scans/ScanResultView.test.tsx
```

## Release Checklist

- README separates shipped features from planned capabilities.
- Roadmap uses planned language for auth discovery, cross-framework static analysis, and zero-config local mode.
- Sensitive auth state stays under `.frontscope/auth/` and remains gitignored.
- Online mode never claims local code-quality results.
- Local sandbox runner never modifies the target project without consent.
- New evidence types include stable ids so AI diagnosis can cite them.

## Full Verification

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/auth scanner/routes scanner/frameworks scanner/localProject scanner/scan
rtk pnpm exec vitest run src/App.test.tsx src/features/scans
rtk pnpm build
```
