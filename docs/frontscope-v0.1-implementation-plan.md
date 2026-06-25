# FrontScope V0.1 Evidence CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local CLI that scans a frontend page URL and project path, collects runtime evidence, Lighthouse metrics, package metadata, and writes a JSON report plus screenshot.

**Architecture:** V0.1 is a single TypeScript Node package. The CLI parses input, validates it, then calls focused scanner modules. Each scanner returns structured evidence; the report writer persists the final scan result under `reports/<scan-id>/`.

**Tech Stack:** Node.js, TypeScript, pnpm, commander, zod, Playwright, Lighthouse, Chrome Launcher, Vitest.

---

## Scope

V0.1 intentionally excludes:

- AI analysis.
- Web UI.
- Design-token or style-drift diagnosis.
- Auto-starting target projects.
- Database.
- Authentication.
- Automatic source-code modification.

The user must start the target frontend project manually and pass a reachable URL.

## File Structure

Create this repository structure:

```text
frontscope/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    cli.ts
    index.ts
    types.ts
    scan/
      runScan.ts
      validateInput.ts
    scanners/
      runtimeScanner.ts
      lighthouseScanner.ts
      packageScanner.ts
    report/
      createScanId.ts
      writeReport.ts
  tests/
    validateInput.test.ts
    packageScanner.test.ts
    createScanId.test.ts
```

Responsibilities:

- `src/cli.ts`: command-line entry.
- `src/index.ts`: exported API for future UI/server usage.
- `src/types.ts`: shared scan result types.
- `src/scan/validateInput.ts`: validate project path, URL, and viewport.
- `src/scan/runScan.ts`: orchestrate scanners and report writer.
- `src/scanners/runtimeScanner.ts`: collect Playwright evidence.
- `src/scanners/lighthouseScanner.ts`: collect Lighthouse evidence.
- `src/scanners/packageScanner.ts`: read package metadata.
- `src/report/createScanId.ts`: generate stable scan IDs.
- `src/report/writeReport.ts`: write `scan.json`.

## Task 1: Initialize TypeScript CLI Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "frontscope",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "frontscope": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "tsx src/cli.ts"
  },
  "dependencies": {
    "chrome-launcher": "^1.1.2",
    "commander": "^12.1.0",
    "lighthouse": "^12.2.1",
    "playwright": "^1.49.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `src/index.ts`**

```ts
export { runScan } from './scan/runScan.js';
export type { ScanInput, ScanResult } from './types.js';
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
pnpm install
```

Expected:

```text
Dependencies installed and pnpm-lock.yaml created.
```

- [ ] **Step 6: Verify the initial project builds fail only because missing modules are referenced later**

Run:

```bash
pnpm build
```

Expected:

```text
Build fails because ./scan/runScan.js and ./types.js do not exist yet.
```

## Task 2: Define Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
export type ViewportMode = 'desktop' | 'mobile';

export interface ScanInput {
  projectPath: string;
  url: string;
  viewport: ViewportMode;
  pageName?: string;
  outputDir?: string;
}

export interface ConsoleMessageEvidence {
  type: string;
  text: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

export interface PageErrorEvidence {
  message: string;
  stack?: string;
}

export interface RequestFailureEvidence {
  url: string;
  method: string;
  resourceType: string;
  failureText?: string;
}

export interface HttpErrorEvidence {
  url: string;
  status: number;
  statusText: string;
  method: string;
}

export interface RuntimeEvidence {
  finalUrl: string;
  title: string;
  screenshotPath: string;
  consoleErrors: ConsoleMessageEvidence[];
  pageErrors: PageErrorEvidence[];
  requestFailures: RequestFailureEvidence[];
  httpErrors: HttpErrorEvidence[];
}

export interface LighthouseAuditEvidence {
  id: string;
  title: string;
  score: number | null;
  displayValue?: string;
  description?: string;
}

export interface LighthouseEvidence {
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  metrics: {
    largestContentfulPaint?: string;
    cumulativeLayoutShift?: string;
    totalBlockingTime?: string;
    speedIndex?: string;
  };
  audits: LighthouseAuditEvidence[];
}

export interface PackageEvidence {
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'unknown';
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  frameworkHints: string[];
  configFiles: string[];
}

export interface ScanResult {
  id: string;
  createdAt: string;
  input: ScanInput;
  runtime: RuntimeEvidence;
  lighthouse: LighthouseEvidence;
  package: PackageEvidence;
}
```

- [ ] **Step 2: Run TypeScript build**

Run:

```bash
pnpm build
```

Expected:

```text
Build still fails because runScan is not created yet.
```

## Task 3: Validate Scan Input

**Files:**
- Create: `src/scan/validateInput.ts`
- Create: `tests/validateInput.test.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { validateInput } from '../src/scan/validateInput.js';

describe('validateInput', () => {
  it('normalizes valid input', () => {
    const result = validateInput({
      projectPath: process.cwd(),
      url: 'http://localhost:5173',
      viewport: 'desktop',
      pageName: 'Home',
    });

    expect(result.projectPath).toBe(process.cwd());
    expect(result.url).toBe('http://localhost:5173');
    expect(result.viewport).toBe('desktop');
    expect(result.pageName).toBe('Home');
  });

  it('defaults viewport to desktop', () => {
    const result = validateInput({
      projectPath: process.cwd(),
      url: 'http://localhost:5173',
    });

    expect(result.viewport).toBe('desktop');
  });

  it('rejects non-http URLs', () => {
    expect(() =>
      validateInput({
        projectPath: process.cwd(),
        url: 'file:///tmp/index.html',
      }),
    ).toThrow('URL must start with http:// or https://');
  });

  it('rejects missing project path', () => {
    expect(() =>
      validateInput({
        projectPath: '/path/that/does/not/exist',
        url: 'http://localhost:5173',
      }),
    ).toThrow('Project path does not exist');
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm test tests/validateInput.test.ts
```

Expected:

```text
FAIL because src/scan/validateInput.ts does not exist.
```

- [ ] **Step 3: Implement `validateInput`**

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { ScanInput } from '../types.js';

const rawInputSchema = z.object({
  projectPath: z.string().min(1),
  url: z.string().min(1),
  viewport: z.enum(['desktop', 'mobile']).default('desktop'),
  pageName: z.string().optional(),
  outputDir: z.string().optional(),
});

export function validateInput(rawInput: unknown): ScanInput {
  const input = rawInputSchema.parse(rawInput);
  const projectPath = resolve(input.projectPath);

  if (!existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  if (!input.url.startsWith('http://') && !input.url.startsWith('https://')) {
    throw new Error('URL must start with http:// or https://');
  }

  return {
    ...input,
    projectPath,
  };
}
```

- [ ] **Step 4: Run validation tests**

Run:

```bash
pnpm test tests/validateInput.test.ts
```

Expected:

```text
PASS tests/validateInput.test.ts
```

## Task 4: Generate Scan IDs

**Files:**
- Create: `src/report/createScanId.ts`
- Create: `tests/createScanId.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { createScanId } from '../src/report/createScanId.js';

describe('createScanId', () => {
  it('creates a filesystem-safe scan id', () => {
    const id = createScanId(new Date('2026-06-23T10:30:45.000Z'), 'Home Page');
    expect(id).toBe('2026-06-23T10-30-45-000Z-home-page');
  });

  it('uses scan when page name is omitted', () => {
    const id = createScanId(new Date('2026-06-23T10:30:45.000Z'));
    expect(id).toBe('2026-06-23T10-30-45-000Z-scan');
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm test tests/createScanId.test.ts
```

Expected:

```text
FAIL because src/report/createScanId.ts does not exist.
```

- [ ] **Step 3: Implement `createScanId`**

```ts
function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'scan';
}

export function createScanId(date = new Date(), pageName?: string): string {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${slugify(pageName ?? 'scan')}`;
}
```

- [ ] **Step 4: Run scan ID tests**

Run:

```bash
pnpm test tests/createScanId.test.ts
```

Expected:

```text
PASS tests/createScanId.test.ts
```

## Task 5: Scan Package Metadata

**Files:**
- Create: `src/scanners/packageScanner.ts`
- Create: `tests/packageScanner.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanPackage } from '../src/scanners/packageScanner.js';

describe('scanPackage', () => {
  it('reads package metadata and detects framework hints', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-'));
    writeFileSync(
      join(projectPath, 'package.json'),
      JSON.stringify({
        scripts: {
          dev: 'vite',
          build: 'vite build',
        },
        dependencies: {
          vue: '^3.5.0',
        },
        devDependencies: {
          vite: '^6.0.0',
          typescript: '^5.7.0',
        },
      }),
    );
    writeFileSync(join(projectPath, 'pnpm-lock.yaml'), '');
    writeFileSync(join(projectPath, 'vite.config.ts'), 'export default {};');

    const result = scanPackage(projectPath);

    expect(result.packageManager).toBe('pnpm');
    expect(result.scripts.dev).toBe('vite');
    expect(result.frameworkHints).toContain('vue');
    expect(result.frameworkHints).toContain('vite');
    expect(result.configFiles).toContain('vite.config.ts');
  });

  it('returns empty metadata when package.json is missing', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-'));

    const result = scanPackage(projectPath);

    expect(result.packageManager).toBe('unknown');
    expect(result.scripts).toEqual({});
    expect(result.frameworkHints).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm test tests/packageScanner.test.ts
```

Expected:

```text
FAIL because src/scanners/packageScanner.ts does not exist.
```

- [ ] **Step 3: Implement package scanner**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageEvidence } from '../types.js';

const knownConfigFiles = [
  'vite.config.ts',
  'vite.config.js',
  'webpack.config.js',
  'webpack.config.ts',
  'nuxt.config.ts',
  'next.config.js',
  'tailwind.config.js',
  'tailwind.config.ts',
];

const knownFrameworkPackages = [
  'vue',
  'react',
  'vite',
  'webpack',
  'nuxt',
  'next',
  'svelte',
  'angular',
  'tailwindcss',
];

function detectPackageManager(projectPath: string): PackageEvidence['packageManager'] {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectPath, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

export function scanPackage(projectPath: string): PackageEvidence {
  const packageJsonPath = join(projectPath, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return {
      packageManager: detectPackageManager(projectPath),
      scripts: {},
      dependencies: {},
      devDependencies: {},
      frameworkHints: [],
      configFiles: [],
    };
  }

  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const dependencies = parsed.dependencies ?? {};
  const devDependencies = parsed.devDependencies ?? {};
  const allPackages = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)]);

  return {
    packageManager: detectPackageManager(projectPath),
    scripts: parsed.scripts ?? {},
    dependencies,
    devDependencies,
    frameworkHints: knownFrameworkPackages.filter((name) => allPackages.has(name)),
    configFiles: knownConfigFiles.filter((file) => existsSync(join(projectPath, file))),
  };
}
```

- [ ] **Step 4: Run package scanner tests**

Run:

```bash
pnpm test tests/packageScanner.test.ts
```

Expected:

```text
PASS tests/packageScanner.test.ts
```

## Task 6: Write Reports

**Files:**
- Create: `src/report/writeReport.ts`

- [ ] **Step 1: Implement report writer**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScanResult } from '../types.js';

export interface WriteReportResult {
  scanDir: string;
  scanJsonPath: string;
}

export function writeReport(result: ScanResult, outputDir: string): WriteReportResult {
  const scanDir = join(outputDir, result.id);
  mkdirSync(scanDir, { recursive: true });

  const scanJsonPath = join(scanDir, 'scan.json');
  writeFileSync(scanJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  return {
    scanDir,
    scanJsonPath,
  };
}
```

- [ ] **Step 2: Run build**

Run:

```bash
pnpm build
```

Expected:

```text
Build still fails because runtimeScanner, lighthouseScanner, and runScan are missing.
```

## Task 7: Collect Runtime Evidence With Playwright

**Files:**
- Create: `src/scanners/runtimeScanner.ts`

- [ ] **Step 1: Implement runtime scanner**

```ts
import { chromium, devices } from 'playwright';
import type {
  ConsoleMessageEvidence,
  HttpErrorEvidence,
  PageErrorEvidence,
  RequestFailureEvidence,
  RuntimeEvidence,
  ViewportMode,
} from '../types.js';

export interface RuntimeScanOptions {
  url: string;
  viewport: ViewportMode;
  screenshotPath: string;
}

export async function scanRuntime(options: RuntimeScanOptions): Promise<RuntimeEvidence> {
  const consoleErrors: ConsoleMessageEvidence[] = [];
  const pageErrors: PageErrorEvidence[] = [];
  const requestFailures: RequestFailureEvidence[] = [];
  const httpErrors: HttpErrorEvidence[] = [];

  const browser = await chromium.launch();
  const context =
    options.viewport === 'mobile'
      ? await browser.newContext(devices['iPhone 13'])
      : await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const page = await context.newPage();

  page.on('console', (message) => {
    if (message.type() !== 'error') return;

    consoleErrors.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });

  page.on('pageerror', (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack,
    });
  });

  page.on('requestfailed', (request) => {
    requestFailures.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failureText: request.failure()?.errorText,
    });
  });

  page.on('response', (response) => {
    if (response.status() < 400) return;

    httpErrors.push({
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      method: response.request().method(),
    });
  });

  await page.goto(options.url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.screenshot({ path: options.screenshotPath, fullPage: true });

  const title = await page.title();
  const finalUrl = page.url();

  await browser.close();

  return {
    finalUrl,
    title,
    screenshotPath: options.screenshotPath,
    consoleErrors,
    pageErrors,
    requestFailures,
    httpErrors,
  };
}
```

- [ ] **Step 2: Run build**

Run:

```bash
pnpm build
```

Expected:

```text
Build still fails because lighthouseScanner and runScan are missing.
```

## Task 8: Collect Lighthouse Evidence

**Files:**
- Create: `src/scanners/lighthouseScanner.ts`

- [ ] **Step 1: Implement Lighthouse scanner**

```ts
import chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import type { LighthouseAuditEvidence, LighthouseEvidence, ViewportMode } from '../types.js';

export interface LighthouseScanOptions {
  url: string;
  viewport: ViewportMode;
}

function scoreToPercent(score: number | null | undefined): number | null {
  return typeof score === 'number' ? Math.round(score * 100) : null;
}

function readDisplayValue(audits: Record<string, { displayValue?: string }>, id: string): string | undefined {
  return audits[id]?.displayValue;
}

export async function scanLighthouse(options: LighthouseScanOptions): Promise<LighthouseEvidence> {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });

  try {
    const runnerResult = await lighthouse(options.url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      formFactor: options.viewport,
      screenEmulation:
        options.viewport === 'mobile'
          ? undefined
          : {
              mobile: false,
              width: 1440,
              height: 900,
              deviceScaleFactor: 1,
              disabled: false,
            },
    });

    if (!runnerResult?.lhr) {
      throw new Error('Lighthouse did not return a report');
    }

    const lhr = runnerResult.lhr;
    const audits = lhr.audits;

    const auditEvidence: LighthouseAuditEvidence[] = Object.values(audits)
      .filter((audit) => audit.score !== null && typeof audit.score === 'number' && audit.score < 0.9)
      .slice(0, 15)
      .map((audit) => ({
        id: audit.id,
        title: audit.title,
        score: audit.score,
        displayValue: audit.displayValue,
        description: audit.description,
      }));

    return {
      scores: {
        performance: scoreToPercent(lhr.categories.performance?.score),
        accessibility: scoreToPercent(lhr.categories.accessibility?.score),
        bestPractices: scoreToPercent(lhr.categories['best-practices']?.score),
        seo: scoreToPercent(lhr.categories.seo?.score),
      },
      metrics: {
        largestContentfulPaint: readDisplayValue(audits, 'largest-contentful-paint'),
        cumulativeLayoutShift: readDisplayValue(audits, 'cumulative-layout-shift'),
        totalBlockingTime: readDisplayValue(audits, 'total-blocking-time'),
        speedIndex: readDisplayValue(audits, 'speed-index'),
      },
      audits: auditEvidence,
    };
  } finally {
    await chrome.kill();
  }
}
```

- [ ] **Step 2: Run build**

Run:

```bash
pnpm build
```

Expected:

```text
Build still fails because runScan is missing.
```

## Task 9: Orchestrate The Scan

**Files:**
- Create: `src/scan/runScan.ts`

- [ ] **Step 1: Implement scan orchestration**

```ts
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createScanId } from '../report/createScanId.js';
import { writeReport } from '../report/writeReport.js';
import { scanLighthouse } from '../scanners/lighthouseScanner.js';
import { scanPackage } from '../scanners/packageScanner.js';
import { scanRuntime } from '../scanners/runtimeScanner.js';
import type { ScanInput, ScanResult } from '../types.js';
import { validateInput } from './validateInput.js';

export interface RunScanResult {
  result: ScanResult;
  scanJsonPath: string;
}

export async function runScan(rawInput: unknown): Promise<RunScanResult> {
  const input: ScanInput = validateInput(rawInput);
  const createdAt = new Date();
  const id = createScanId(createdAt, input.pageName);
  const outputDir = resolve(input.outputDir ?? join(input.projectPath, 'frontscope-reports'));
  const scanDir = join(outputDir, id);
  mkdirSync(scanDir, { recursive: true });

  const screenshotPath = join(scanDir, 'screenshot.png');

  const runtime = await scanRuntime({
    url: input.url,
    viewport: input.viewport,
    screenshotPath,
  });

  const lighthouse = await scanLighthouse({
    url: input.url,
    viewport: input.viewport,
  });

  const packageEvidence = scanPackage(input.projectPath);

  const result: ScanResult = {
    id,
    createdAt: createdAt.toISOString(),
    input,
    runtime,
    lighthouse,
    package: packageEvidence,
  };

  const written = writeReport(result, outputDir);

  return {
    result,
    scanJsonPath: written.scanJsonPath,
  };
}
```

- [ ] **Step 2: Run build**

Run:

```bash
pnpm build
```

Expected:

```text
Build fails because cli.ts is not created yet or passes if src/index.ts now resolves.
```

## Task 10: Add CLI Entry

**Files:**
- Create: `src/cli.ts`

- [ ] **Step 1: Implement CLI**

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { runScan } from './scan/runScan.js';

const program = new Command();

program
  .name('frontscope')
  .description('Local-first AI-ready health check tool for frontend projects')
  .requiredOption('-p, --project <path>', 'absolute or relative frontend project path')
  .requiredOption('-u, --url <url>', 'reachable local page URL, for example http://localhost:5173')
  .option('-v, --viewport <mode>', 'desktop or mobile', 'desktop')
  .option('-n, --name <name>', 'human-readable page name')
  .option('-o, --output <dir>', 'report output directory')
  .action(async (options) => {
    try {
      const { scanJsonPath, result } = await runScan({
        projectPath: options.project,
        url: options.url,
        viewport: options.viewport,
        pageName: options.name,
        outputDir: options.output,
      });

      console.log(`FrontScope scan complete: ${result.id}`);
      console.log(`Report JSON: ${scanJsonPath}`);
      console.log(`Runtime errors: ${result.runtime.consoleErrors.length + result.runtime.pageErrors.length}`);
      console.log(`Failed requests: ${result.runtime.requestFailures.length + result.runtime.httpErrors.length}`);
      console.log(`Performance score: ${result.lighthouse.scores.performance ?? 'n/a'}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program.parse();
```

- [ ] **Step 2: Run build**

Run:

```bash
pnpm build
```

Expected:

```text
PASS TypeScript compilation.
```

## Task 11: Manual End-To-End Verification

**Files:**
- No source changes unless verification exposes a bug.

- [ ] **Step 0: Start FrontScope (web UI + API)**

Run from the FrontScope repository:

```bash
pnpm dev
```

Expected:

```text
Web UI at http://localhost:5173
API at http://localhost:3001
```

- [ ] **Step 1: Start a target frontend project manually**

Run in any Vue/Vite or React/Vite project:

```bash
pnpm dev
```

Expected:

```text
Target app is reachable at http://localhost:5173 or another local URL.
```

- [ ] **Step 2: Run FrontScope against the target app**

Run from the FrontScope repository (CLI) or use the web UI at http://localhost:5173:

```bash
pnpm scan -- --project /absolute/path/to/target-project --url http://localhost:5173 --name home
```

Expected:

```text
FrontScope scan complete: <scan-id>
Report JSON: /absolute/path/to/target-project/frontscope-reports/<scan-id>/scan.json
Runtime errors: <number>
Failed requests: <number>
Performance score: <number or n/a>
```

- [ ] **Step 3: Inspect generated artifacts**

Open:

```text
/absolute/path/to/target-project/frontscope-reports/<scan-id>/scan.json
/absolute/path/to/target-project/frontscope-reports/<scan-id>/screenshot.png
```

Expected:

```text
scan.json contains input, runtime, lighthouse, and package sections.
screenshot.png exists and shows the scanned page.
```

- [ ] **Step 4: Run automated verification**

Run:

```bash
pnpm test
pnpm build
```

Expected:

```text
All tests pass.
TypeScript build passes.
```

## Task 12: V0.1 Completion Checklist

- [ ] CLI accepts project path, URL, viewport, page name, and output directory.
- [ ] Invalid project paths fail with a clear error.
- [ ] Non-http URLs fail with a clear error.
- [ ] Playwright collects console errors, page errors, failed requests, HTTP errors, and screenshot.
- [ ] Lighthouse collects scores, metrics, and failed audits.
- [ ] Package scanner reads package metadata and framework hints.
- [ ] `scan.json` is written under `frontscope-reports/<scan-id>/`.
- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] Manual scan works against at least one real local frontend project.

## V0.2 Preview

After V0.1 is complete, V0.2 should add:

- `src/analyzer/aiAnalyzer.ts`.
- Zod schema for AI diagnosis.
- Provider configuration through environment variables.
- Markdown report generation.
- Evidence guardrail that rejects AI issues without evidence strings.

Do not start V0.2 until V0.1 produces reliable scan evidence.

---

## Post-V0.1: Scan Modes And Configuration (Current)

After V0.1–V0.5, FrontScope added **local mode** and **online mode**:

| | Local mode | Online mode |
| --- | --- | --- |
| `projectPath` | Required | Not used for code scanning |
| Project quality / package scan | Yes | Skipped (`online mode cannot read local project files`) |
| Runtime / Lighthouse / Network / Trace | Yes | Yes |
| Auth profile (`.frontscope/auth/*.json`) | Optional | Supported for gated pages |
| AI config source | `frontscope.config.json` + env vars | Same |

**Input simplification (current UI):**

- Viewport is no longer a main scan input; internal default is `desktop`. CLI `--viewport` remains for backward compatibility only.
- AI credentials are **not** entered in the scan form. Configure `frontscope.config.json` (preferred) or `FRONTSCOPE_AI_*` environment variables.
- Sensitive auth state lives in `.frontscope/auth/` (gitignored).

**Example AI config** (set `FRONTSCOPE_AI_API_KEY` in the environment):

```json
{
  "ai": {
    "provider": "openai",
    "baseURL": "https://api.example.com/v1",
    "model": "gpt-4.1-mini"
  }
}
```

See [README.md](../README.md) and [frontscope-product-spec.md](./frontscope-product-spec.md) for full guidance.
