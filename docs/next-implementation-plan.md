# Next Implementation Plan

> **For Cursor:** This plan continues the current FrontScope roadmap. Do not restart completed work. Keep changes surgical, use TDD, and run the verification commands listed for each task.

**Goal:** Finish the remaining roadmap after authenticated route support: framework-neutral project evidence, framework route evidence in reports and AI, zero-config local project intake, sandboxed local run, and multi-route scan sets.

**Architecture:** Keep scanner runtime evidence framework-agnostic. Add framework adapters that produce normalized project, route, and code-review evidence. Add local-project intake and sandbox runner as a consent-gated layer before scan execution. Keep reports and AI compaction consuming stable evidence ids instead of framework-specific internals.

**Tech Stack:** TypeScript, React, Ant Design, Hono, Playwright, Vitest, TypeScript compiler API, existing scanner/report/AI modules.

---

## Current Completed Baseline

These pieces are already implemented in the current working tree. Do not duplicate them.

- Auth profile metadata:
  - `scanner/auth/authProfile.ts`
  - `scanner/auth/authProfile.test.ts`
- Auth profile verification:
  - `scanner/auth/verifyAuthProfile.ts`
  - `scanner/auth/verifyAuthProfile.test.ts`
  - `POST /api/auth-profiles/:profileName/verify`
  - UI button in `src/features/scans/ScanWorkspace.tsx`
- Protected route discovery foundation:
  - `scanner/routes/types.ts`
  - `scanner/routes/discoverRoutes.ts`
  - `scanner/routes/runtimeCrawler.ts`
  - tests under `scanner/routes/*.test.ts`
- Existing verification that passed before this handoff:
  - `rtk pnpm exec vitest run --config vitest.node.config.ts scanner/routes scanner/auth/verifyAuthProfile.test.ts`
  - `rtk pnpm build`

## Execution Rules

- Use `rtk` prefix for shell commands.
- Write tests first, confirm they fail for the expected reason, then implement.
- Do not commit secrets, `.frontscope/auth/`*, or local auth state.
- Do not modify business logic outside the files named by each task unless a test proves the dependency.
- After each task, run the task verification command and record the result.
- If `src/App.test.tsx` prints React `act(...)` warnings but tests pass, note it as existing noise unless the task changes async UI behavior.

## Task 1: Framework Detector

**Goal:** Detect the frontend framework and confidence before choosing static-analysis and route rules.

**Files:**

- Create: `scanner/frameworks/types.ts`
- Create: `scanner/frameworks/detectFramework.ts`
- Create: `scanner/frameworks/detectFramework.test.ts`
- Modify: `scanner/types.ts`
- Modify: `scanner/projectQuality/projectQualityScanner.ts`
- Test: `scanner/projectQuality/projectQualityScanner.test.ts`

### Step 1: Write failing detector tests

Create `scanner/frameworks/detectFramework.test.ts`:

```ts
// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFrameworks } from './detectFramework.js';

function createProject(dependencies: Record<string, string>, files: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'frontscope-framework-'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ dependencies, devDependencies: {} }),
    'utf8',
  );
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), '', 'utf8');
  }
  return root;
}

describe('detectFrameworks', () => {
  it.each([
    ['react', { react: '^19.0.0' }, ['vite.config.ts']],
    ['vue', { vue: '^3.0.0' }, ['vite.config.ts']],
    ['angular', { '@angular/core': '^18.0.0' }, ['angular.json']],
    ['next', { next: '^15.0.0', react: '^19.0.0' }, ['next.config.js']],
    ['nuxt', { nuxt: '^3.0.0', vue: '^3.0.0' }, ['nuxt.config.ts']],
    ['solid', { 'solid-js': '^1.8.0' }, ['vite.config.ts']],
  ] as const)('detects %s projects', (framework, dependencies, files) => {
    const root = createProject(dependencies, files);
    expect(detectFrameworks(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ framework, confidence: 'high' }),
      ]),
    );
  });

  it('reports javascript when no framework dependency is found', () => {
    const root = createProject({}, ['src/main.js']);
    expect(detectFrameworks(root)).toEqual([
      expect.objectContaining({ framework: 'javascript', confidence: 'low' }),
    ]);
  });
});
```

Run:

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/frameworks/detectFramework.test.ts
```

Expected: fail because `scanner/frameworks/detectFramework.ts` does not exist.

### Step 2: Implement framework types

Create `scanner/frameworks/types.ts`:

```ts
export type FrontendFramework =
  | 'react'
  | 'vue'
  | 'angular'
  | 'next'
  | 'nuxt'
  | 'solid'
  | 'javascript';

export interface FrameworkDetection {
  framework: FrontendFramework;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}
```

### Step 3: Implement detector

Create `scanner/frameworks/detectFramework.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FrameworkDetection, FrontendFramework } from './types.js';

function readPackageJson(projectPath: string): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8'));
    return { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
  } catch {
    return {};
  }
}

function hasFile(projectPath: string, file: string): boolean {
  return existsSync(join(projectPath, file));
}

function pushDetection(
  detections: FrameworkDetection[],
  framework: FrontendFramework,
  signals: string[],
  confidence: FrameworkDetection['confidence'] = 'high',
) {
  if (signals.length > 0) detections.push({ framework, confidence, signals });
}

export function detectFrameworks(projectPath: string): FrameworkDetection[] {
  const deps = readPackageJson(projectPath);
  const detections: FrameworkDetection[] = [];

  pushDetection(detections, 'next', [
    deps.next ? 'dependency:next' : '',
    hasFile(projectPath, 'next.config.js') || hasFile(projectPath, 'next.config.mjs') ? 'config:next' : '',
  ].filter(Boolean));
  pushDetection(detections, 'nuxt', [
    deps.nuxt ? 'dependency:nuxt' : '',
    hasFile(projectPath, 'nuxt.config.ts') || hasFile(projectPath, 'nuxt.config.js') ? 'config:nuxt' : '',
  ].filter(Boolean));
  pushDetection(detections, 'angular', [
    deps['@angular/core'] ? 'dependency:@angular/core' : '',
    hasFile(projectPath, 'angular.json') ? 'config:angular.json' : '',
  ].filter(Boolean));
  pushDetection(detections, 'solid', [deps['solid-js'] ? 'dependency:solid-js' : ''].filter(Boolean));
  pushDetection(detections, 'vue', [deps.vue ? 'dependency:vue' : ''].filter(Boolean));
  pushDetection(detections, 'react', [deps.react ? 'dependency:react' : ''].filter(Boolean));

  if (detections.length === 0) {
    return [{ framework: 'javascript', confidence: 'low', signals: ['fallback:javascript'] }];
  }

  return detections;
}
```

### Step 4: Add detection to package evidence

Modify `scanner/types.ts`:

```ts
import type { FrameworkDetection } from './frameworks/types.js';

export interface PackageEvidence {
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'unknown';
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  frameworkHints: string[];
  frameworkDetections?: FrameworkDetection[];
  configFiles: string[];
}
```

Modify package scanning code in `scanner/scan/runScan.ts` or the package-evidence creator if package evidence is built there. Search for the object that sets `frameworkHints`, then add:

```ts
frameworkDetections: detectFrameworks(projectPath),
```

Import:

```ts
import { detectFrameworks } from '../frameworks/detectFramework.js';
```

### Step 5: Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/frameworks/detectFramework.test.ts scanner/scan/runScan.test.ts scanner/projectQuality/projectQualityScanner.test.ts
rtk pnpm build
```

Expected: all commands exit 0. Vite chunk-size warning is acceptable.

## Task 2: Static Review Adapters

**Goal:** Stop reporting React-specific checks as universal frontend checks, and add first Vue/JS adapter path.

**Files:**

- Create: `scanner/frameworks/adapters/reactAdapter.ts`
- Create: `scanner/frameworks/adapters/vueAdapter.ts`
- Create: `scanner/frameworks/adapters/javascriptAdapter.ts`
- Create: `scanner/frameworks/adapters/frameworkAdapters.test.ts`
- Modify: `scanner/projectQuality/codeReview.ts`
- Test: `scanner/projectQuality/codeReview.test.ts`

### Step 1: Write failing adapter tests

Create `scanner/frameworks/adapters/frameworkAdapters.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { reviewReactSource } from './reactAdapter.js';
import { reviewVueSource } from './vueAdapter.js';
import { reviewJavaScriptSource } from './javascriptAdapter.js';

describe('framework review adapters', () => {
  it('keeps React list-key findings under react rule ids', () => {
    const findings = reviewReactSource(
      'List.tsx',
      `export const List = ({ items }) => <>{items.map((item) => <div>{item.name}</div>)}</>;`,
    );
    expect(findings.map((finding) => finding.ruleId)).toContain('react/missing-key');
  });

  it('finds Vue v-for blocks without a key', () => {
    const findings = reviewVueSource(
      'List.vue',
      `<template><div v-for="item in items">{{ item.name }}</div></template>`,
    );
    expect(findings.map((finding) => finding.ruleId)).toContain('vue/missing-key');
  });

  it('finds Vue unsafe html rendering', () => {
    const findings = reviewVueSource(
      'Article.vue',
      `<template><article v-html="html"></article></template>`,
    );
    expect(findings.map((finding) => finding.ruleId)).toContain('vue/dangerous-html');
  });

  it('uses a conservative JavaScript adapter for JSX files', () => {
    const findings = reviewJavaScriptSource(
      'List.jsx',
      `export const List = ({ items }) => <>{items.map((item) => <div>{item.name}</div>)}</>;`,
    );
    expect(findings.map((finding) => finding.ruleId)).toContain('react/missing-key');
  });
});
```

Run:

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/frameworks/adapters/frameworkAdapters.test.ts
```

Expected: fail because adapter files do not exist.

### Step 2: Move React logic

Move the existing `reviewSource()` implementation from `scanner/projectQuality/codeReview.ts` into `scanner/frameworks/adapters/reactAdapter.ts` as:

```ts
export function reviewReactSource(fileName: string, text: string): CodeReviewFinding[] {
  // Existing TypeScript AST JSX rules from codeReview.ts.
}
```

Keep `scanner/projectQuality/codeReview.ts` exporting `reviewSource()` as a wrapper:

```ts
import { reviewReactSource } from '../frameworks/adapters/reactAdapter.js';

export function reviewSource(fileName: string, text: string): CodeReviewFinding[] {
  if (fileName.endsWith('.vue')) return reviewVueSource(fileName, text);
  return reviewReactSource(fileName, text);
}
```

### Step 3: Add Vue adapter

Create `scanner/frameworks/adapters/vueAdapter.ts`:

```ts
import type { CodeReviewFinding } from '../../types.js';

export function reviewVueSource(fileName: string, text: string): CodeReviewFinding[] {
  const findings: CodeReviewFinding[] = [];
  const template = text.match(/<template[^>]*>([\s\S]*?)<\/template>/i)?.[1] ?? text;

  if (/v-html\s*=/.test(template)) {
    findings.push({
      ruleId: 'vue/dangerous-html',
      severity: 'high',
      file: fileName,
      line: 1,
      message: '使用 v-html 存在 XSS 风险，需确认内容已严格转义或来自可信来源。',
    });
  }

  const vForPattern = /<([a-zA-Z][^\s/>]*)(?=[^>]*\sv-for\s*=)(?![^>]*(?:\s:key\s*=|\skey\s*=))[^>]*>/g;
  if (vForPattern.test(template)) {
    findings.push({
      ruleId: 'vue/missing-key',
      severity: 'medium',
      file: fileName,
      line: 1,
      message: 'v-for 列表渲染缺少稳定的 :key，可能导致渲染错乱和不必要的重渲染。',
    });
  }

  return findings;
}
```

### Step 4: Add JavaScript adapter

Create `scanner/frameworks/adapters/javascriptAdapter.ts`:

```ts
import type { CodeReviewFinding } from '../../types.js';
import { reviewReactSource } from './reactAdapter.js';

export function reviewJavaScriptSource(fileName: string, text: string): CodeReviewFinding[] {
  return reviewReactSource(fileName, text).map((finding) => ({
    ...finding,
    message: `${finding.message}（JS 项目缺少类型信息，置信度较低。）`,
  }));
}
```

### Step 5: Update source collection

Modify `scanner/projectQuality/codeReview.ts` so `SOURCE_EXTENSIONS` includes `.vue`:

```ts
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue']);
```

Route `.vue` to `reviewVueSource()`, `.js/.jsx` to `reviewJavaScriptSource()`, and `.ts/.tsx` to `reviewReactSource()`.

### Step 6: Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/projectQuality/codeReview.test.ts scanner/frameworks/adapters/frameworkAdapters.test.ts
rtk pnpm build
```

Expected: all commands exit 0.

## Task 3: Route Evidence In Reports And AI

**Goal:** Make discovered route candidates visible in JSON/report output and available as compact AI evidence.

**Files:**

- Create: `scanner/routes/frameworkRoutes.ts`
- Create: `scanner/routes/frameworkRoutes.test.ts`
- Modify: `scanner/types.ts`
- Modify: `scanner/scan/runScan.ts`
- Modify: `scanner/ai/evidenceCompactor.ts`
- Modify: `scanner/ai/evidenceCompactor.test.ts`
- Modify: `scanner/report/writeReport.ts`
- Modify: `scanner/report/writeReport.test.ts`

### Step 1: Add route evidence type

Modify `scanner/types.ts`:

```ts
import type { RouteCandidate } from './routes/types.js';

export interface RouteDiscoveryEvidence {
  status: ProjectQualityStatus;
  candidates: RouteCandidate[];
  skippedReason?: string;
}

export interface ScanResult {
  // existing fields...
  routeDiscovery?: RouteDiscoveryEvidence;
}
```

Use the actual `ScanResult` interface location in `scanner/types.ts`; do not create a duplicate.

### Step 2: Write failing route evidence test

Create `scanner/routes/frameworkRoutes.test.ts`:

```ts
// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectRouteDiscoveryEvidence } from './frameworkRoutes.js';

describe('collectRouteDiscoveryEvidence', () => {
  it('returns route candidates for local projects', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-route-evidence-'));
    mkdirSync(join(root, 'app', 'dashboard'), { recursive: true });
    writeFileSync(join(root, 'app', 'dashboard', 'page.tsx'), 'export default function Page() {}');

    const evidence = collectRouteDiscoveryEvidence(root);

    expect(evidence.status).toBe('ok');
    expect(evidence.candidates).toEqual([
      expect.objectContaining({ path: '/dashboard', source: 'next-app' }),
    ]);
  });

  it('reports skipped when no routes are found', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-route-empty-'));
    const evidence = collectRouteDiscoveryEvidence(root);
    expect(evidence.status).toBe('skipped');
    expect(evidence.skippedReason).toContain('未发现');
  });
});
```

### Step 3: Implement route evidence collector

Create `scanner/routes/frameworkRoutes.ts`:

```ts
import type { RouteDiscoveryEvidence } from '../types.js';
import { discoverStaticRoutes } from './discoverRoutes.js';

export function collectRouteDiscoveryEvidence(projectPath: string): RouteDiscoveryEvidence {
  const candidates = discoverStaticRoutes(projectPath);
  if (candidates.length === 0) {
    return {
      status: 'skipped',
      candidates: [],
      skippedReason: '未发现可识别的前端路由文件。',
    };
  }

  return { status: 'ok', candidates };
}
```

### Step 4: Wire into runScan

In `scanner/scan/runScan.ts`, when `scanMode === 'local'` and `projectPath` exists, call:

```ts
routeDiscovery = collectRouteDiscoveryEvidence(input.projectPath);
```

In online mode, set:

```ts
routeDiscovery = {
  status: 'skipped',
  candidates: [],
  skippedReason: 'online mode cannot read local route files',
};
```

Add or update `scanner/scan/runScan.test.ts` so local mode includes route candidates and online mode skips route discovery.

### Step 5: Add AI compaction

In `scanner/ai/evidenceCompactor.ts`, add compact evidence items:

```ts
{
  id: `route.discovery.${index}`,
  category: 'project',
  summary: `Discovered route ${candidate.path} from ${candidate.source}`,
  detail: candidate.file,
}
```

Update `scanner/ai/evidenceCompactor.test.ts` to assert a stable `route.discovery.0` id.

### Step 6: Add report output

In `scanner/report/writeReport.ts`, add a section:

```md
## Route Discovery

- Status: ok
- Candidates:
  - /dashboard (next-app, app/dashboard/page.tsx)
```

Update `scanner/report/writeReport.test.ts` to assert the route section appears.

### Step 7: Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/routes scanner/scan/runScan.test.ts scanner/ai/evidenceCompactor.test.ts scanner/report/writeReport.test.ts
rtk pnpm build
```

Expected: all commands exit 0.

## Task 4: Local Project Intake

**Goal:** Let users provide only a project folder first and review detected scripts/routes/frameworks before anything runs.

**Files:**

- Create: `scanner/localProject/projectIntake.ts`
- Create: `scanner/localProject/projectIntake.test.ts`
- Modify: `server/api.ts`
- Modify: `server/api.test.ts`
- Modify: `src/features/scans/ScanWorkspace.tsx`
- Modify: `src/App.test.tsx`

### Step 1: Write failing intake tests

Create `scanner/localProject/projectIntake.test.ts`:

```ts
// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectLocalProject } from './projectIntake.js';

describe('inspectLocalProject', () => {
  it('detects package manager, dev scripts, frameworks, and routes', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-intake-'));
    writeFileSync(join(root, 'pnpm-lock.yaml'), '');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'vite --host 127.0.0.1', build: 'vite build' },
        dependencies: { next: '^15.0.0', react: '^19.0.0' },
      }),
      'utf8',
    );
    mkdirSync(join(root, 'app', 'dashboard'), { recursive: true });
    writeFileSync(join(root, 'app', 'dashboard', 'page.tsx'), 'export default function Page() {}');

    const intake = inspectLocalProject(root);

    expect(intake.packageManager).toBe('pnpm');
    expect(intake.devScripts).toEqual([{ name: 'dev', command: 'vite --host 127.0.0.1' }]);
    expect(intake.frameworkDetections.map((item) => item.framework)).toContain('next');
    expect(intake.routeCandidates).toEqual([
      expect.objectContaining({ path: '/dashboard', source: 'next-app' }),
    ]);
    expect(intake.needsUserApproval).toContain('run-script');
  });
});
```

### Step 2: Implement project intake

Create `scanner/localProject/projectIntake.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FrameworkDetection } from '../frameworks/types.js';
import { detectFrameworks } from '../frameworks/detectFramework.js';
import type { RouteCandidate } from '../routes/types.js';
import { discoverStaticRoutes } from '../routes/discoverRoutes.js';

export interface LocalProjectIntake {
  projectPath: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
  scripts: Record<string, string>;
  devScripts: Array<{ name: string; command: string }>;
  frameworkDetections: FrameworkDetection[];
  routeCandidates: RouteCandidate[];
  needsUserApproval: Array<'install' | 'run-script' | 'env-file' | 'external-origin'>;
}

function readPackage(projectPath: string): { scripts?: Record<string, string> } {
  try {
    return JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function detectPackageManager(projectPath: string): LocalProjectIntake['packageManager'] {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'package-lock.json'))) return 'npm';
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectPath, 'bun.lockb'))) return 'bun';
  return 'unknown';
}

export function inspectLocalProject(projectPath: string): LocalProjectIntake {
  const pkg = readPackage(projectPath);
  const scripts = pkg.scripts ?? {};
  const devScripts = ['dev', 'start', 'serve', 'preview']
    .filter((name) => scripts[name])
    .map((name) => ({ name, command: scripts[name] }));

  return {
    projectPath,
    packageManager: detectPackageManager(projectPath),
    scripts,
    devScripts,
    frameworkDetections: detectFrameworks(projectPath),
    routeCandidates: discoverStaticRoutes(projectPath),
    needsUserApproval: devScripts.length > 0 ? ['run-script'] : [],
  };
}
```

### Step 3: Add API

Add `POST /api/local-projects/inspect` in `server/api.ts`. Reuse existing security middleware and path restrictions if present. Body:

```json
{ "projectPath": "/absolute/path/to/project" }
```

Response:

```json
{ "success": true, "data": { "...": "LocalProjectIntake" } }
```

Add `server/api.test.ts` coverage that mocks/uses a temp project and asserts package manager/dev scripts are returned.

### Step 4: Add minimal UI intake

In `src/features/scans/ScanWorkspace.tsx`, local mode should show:

- project path input
- button: `检查本地项目`
- summary with package manager, dev script candidates, framework detections, route count

Do not run scripts in this task.

### Step 5: Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/localProject/projectIntake.test.ts server/api.test.ts
rtk pnpm exec vitest run src/App.test.tsx
rtk pnpm build
```

Expected: all commands exit 0.

## Task 5: Safe Sandbox Runner

**Goal:** Start a local project dev server only after user approval, capture logs, and always clean up.

**Files:**

- Create: `scanner/localProject/portAllocator.ts`
- Create: `scanner/localProject/sandboxRunner.ts`
- Create: `scanner/localProject/sandboxRunner.test.ts`
- Modify: `scanner/scan/runScan.ts`
- Modify: `scanner/types.ts`

### Step 1: Write failing runner tests

Create `scanner/localProject/sandboxRunner.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { startSandboxedProject } from './sandboxRunner.js';

describe('startSandboxedProject', () => {
  it('rejects unapproved runs', async () => {
    await expect(
      startSandboxedProject({
        projectPath: '/tmp/demo',
        packageManager: 'pnpm',
        scriptName: 'dev',
        port: 4317,
        approved: false,
      }),
    ).rejects.toThrow('User approval is required');
  });

  it('starts an approved dev script and exposes cleanup', async () => {
    const calls: string[] = [];
    const session = await startSandboxedProject(
      {
        projectPath: '/tmp/demo',
        packageManager: 'pnpm',
        scriptName: 'dev',
        port: 4317,
        approved: true,
      },
      {
        spawn(command, args) {
          calls.push([command, ...args].join(' '));
          return { pid: 123, stop: async () => calls.push('stop') };
        },
      },
    );

    expect(calls[0]).toBe('pnpm run dev -- --port 4317');
    await session.stop();
    expect(calls).toContain('stop');
  });
});
```

### Step 2: Implement runner

Create `scanner/localProject/sandboxRunner.ts`:

```ts
export interface SandboxRunInput {
  projectPath: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun';
  scriptName: string;
  port: number;
  approved: boolean;
}

export interface SandboxProcess {
  pid: number;
  stop(): Promise<void>;
}

export interface SandboxRunnerDriver {
  spawn(command: string, args: string[], options: { cwd: string }): SandboxProcess;
}

export interface SandboxSession {
  pid: number;
  url: string;
  stop(): Promise<void>;
}

function commandForPackageManager(packageManager: SandboxRunInput['packageManager']): string {
  return packageManager;
}

export async function startSandboxedProject(
  input: SandboxRunInput,
  driver: SandboxRunnerDriver,
): Promise<SandboxSession> {
  if (!input.approved) throw new Error('User approval is required before running project scripts.');

  const process = driver.spawn(
    commandForPackageManager(input.packageManager),
    ['run', input.scriptName, '--', '--port', String(input.port)],
    { cwd: input.projectPath },
  );

  return {
    pid: process.pid,
    url: `http://127.0.0.1:${input.port}`,
    stop: () => process.stop(),
  };
}
```

Then replace test-only driver requirement with a real Node `child_process.spawn` default driver. Capture stdout/stderr to a log buffer or scan artifact path in a follow-up patch.

### Step 3: Add port allocator

Create `scanner/localProject/portAllocator.ts` with:

```ts
export async function findAvailablePort(preferred = 5173): Promise<number> {
  // Use node:net server listen(0) or preferred probe.
}
```

Add a test that occupies a port and asserts another port is returned.

### Step 4: Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/localProject/sandboxRunner.test.ts
rtk pnpm build
```

Expected: all commands exit 0.

## Task 6: Route Selection And Scan Sets

**Goal:** Let users scan several selected routes and produce a route-level summary.

**Files:**

- Create: `scanner/scan/scanSet.ts`
- Create: `scanner/scan/scanSet.test.ts`
- Modify: `scanner/types.ts`
- Modify: `scanner/report/writeReport.ts`
- Modify: `scanner/report/writeReport.test.ts`
- Modify: `src/features/scans/ScanResultView.tsx`
- Modify: `src/features/scans/ScanResultView.test.tsx`

### Step 1: Write failing scan-set test

Create `scanner/scan/scanSet.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runScanSet } from './scanSet.js';

describe('runScanSet', () => {
  it('runs selected routes and preserves per-route results', async () => {
    const runOne = vi.fn(async (input) => ({
      id: `scan-${input.url}`,
      input,
      scanMode: input.scanMode,
      projectEvidenceEnabled: input.scanMode === 'local',
      errors: [],
      runtime: { finalUrl: input.url, title: 'ok', screenshotPath: '', consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] },
    }));

    const result = await runScanSet(
      {
        baseUrl: 'http://localhost:5173',
        routes: ['/dashboard', '/settings'],
        scanMode: 'local',
        projectPath: '/tmp/project',
      },
      runOne,
    );

    expect(runOne).toHaveBeenCalledTimes(2);
    expect(result.routes.map((route) => route.url)).toEqual([
      'http://localhost:5173/dashboard',
      'http://localhost:5173/settings',
    ]);
  });
});
```

### Step 2: Implement `runScanSet`

Create `scanner/scan/scanSet.ts`:

```ts
import type { ScanInput, ScanResult } from '../types.js';

export interface ScanSetInput {
  baseUrl: string;
  routes: string[];
  scanMode: 'local' | 'online';
  projectPath?: string;
  authStatePath?: string;
}

export interface ScanSetRouteResult {
  url: string;
  result: ScanResult;
}

export interface ScanSetResult {
  routes: ScanSetRouteResult[];
  summary: {
    routeCount: number;
    failedRoutes: number;
  };
}

function routeUrl(baseUrl: string, route: string): string {
  return new URL(route, baseUrl).toString();
}

export async function runScanSet(
  input: ScanSetInput,
  runOne: (input: ScanInput) => Promise<ScanResult>,
): Promise<ScanSetResult> {
  const routes: ScanSetRouteResult[] = [];
  for (const route of input.routes) {
    const url = routeUrl(input.baseUrl, route);
    const result = await runOne({
      scanMode: input.scanMode,
      url,
      projectPath: input.projectPath,
      authStatePath: input.authStatePath,
    });
    routes.push({ url, result });
  }

  return {
    routes,
    summary: {
      routeCount: routes.length,
      failedRoutes: routes.filter((route) => route.result.errors.length > 0).length,
    },
  };
}
```

### Step 3: Add report and UI rendering

Add a scan-set table in Markdown and UI:

- URL
- final URL
- target matched
- runtime errors
- failed requests
- Lighthouse performance score if available

Use existing `ScanResultView` patterns and tests.

### Step 4: Verify

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/scan/scanSet.test.ts scanner/report/writeReport.test.ts
rtk pnpm exec vitest run src/features/scans/ScanResultView.test.tsx
rtk pnpm build
```

Expected: all commands exit 0.

## Final Full Verification For Cursor

After finishing all tasks above, run:

```bash
rtk pnpm exec vitest run --config vitest.node.config.ts scanner/auth scanner/routes scanner/frameworks scanner/localProject scanner/scan scanner/ai scanner/report server
rtk pnpm exec vitest run src/App.test.tsx src/features/scans
rtk pnpm build
rtk find .frontscope -maxdepth 3 -type f
```

Expected:

- All Vitest commands exit 0.
- `rtk pnpm build` exits 0.
- `.frontscope` contains no test-created auth/profile files.
- Existing Vite large chunk warning may remain.
- Existing React `act(...)` warnings in `src/App.test.tsx` may remain unless Cursor explicitly fixes test async wrapping.

