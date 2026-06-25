# FrontScope Product Spec

## 1. Product Positioning

FrontScope is a local-first AI health-check tool for frontend projects.

It helps a frontend engineer turn scattered tool outputs into a clear project diagnosis:

```text
project path + local page URL
-> collect runtime, performance, network, memory, and project evidence
-> ask AI to analyze evidence
-> generate a prioritized frontend health report
-> rerun later to compare whether the project improved
```

The first product goal is not to replace Lighthouse, Playwright, ESLint, Chrome DevTools, or Sentry. The goal is to orchestrate proven tools, attach evidence, and make the next repair steps obvious.

## 2. Target User

Primary user:

- Senior frontend engineer maintaining Vue, React, Vite, or Webpack business projects.
- Wants to diagnose project quality quickly without setting up a heavy monitoring platform.
- Has AI model quota and wants to turn it into practical productivity and a portfolio product.

Secondary user:

- Frontend team lead who wants a quick project quality report before refactoring, takeover, release, or performance work.
- Individual developer who wants an AI assistant that can explain Lighthouse and runtime errors in project context.

## 3. Core Problem

Frontend diagnosis is fragmented:

- Lighthouse gives performance signals but not project-specific repair order.
- Console errors and network failures are easy to miss during manual testing.
- Bundle and dependency problems are often found late.
- Performance regressions and project-quality risks are hard to prioritize without a shared evidence trail.
- AI can explain issues, but raw prompts without evidence are unreliable.

FrontScope should solve this by making diagnosis evidence-first:

```text
No evidence -> no AI conclusion.
Every AI suggestion -> linked to collected facts.
Every repair suggestion -> includes a verification method.
```

## 4. Product Scope

### Scan Modes

FrontScope supports two scan modes with a shared evidence-first workflow:

**Local mode** — for developers auditing a frontend project on their machine:

- Requires `projectPath` and `url`.
- Collects runtime evidence (Playwright, Lighthouse, Network, Trace) **and** local project evidence (dependencies, typecheck, lint, unused deps, circular deps, AST code review).
- AI diagnosis may cite both page and project evidence.

**Online mode** — for monitoring deployed pages:

- Requires `url` only; `projectPath` is optional and **not used** for local code scanning.
- Collects runtime evidence only; project-quality modules are skipped with an explicit report note.
- Supports auth profiles (`.frontscope/auth/*.json`) to scan permission-gated pages.
- AI diagnosis is limited to runtime evidence; no code-quality conclusions.

`viewport` is no longer a primary scan input. The UI omits viewport selection; internally it defaults to `desktop`. CLI `--viewport` remains for backward compatibility.

AI credentials belong in `frontscope.config.json` or environment variables — not in the scan form.

### MVP Scope

The MVP is a local tool with three diagnosis modules:

1. Runtime diagnosis
   - Open target URL with Playwright.
   - Capture console errors, page errors, failed requests, HTTP 4xx/5xx, and screenshot.

2. Performance diagnosis
   - Run Lighthouse against the target URL.
   - Capture scores, key metrics, and main audits.

3. Project quality diagnosis
   - Read package metadata and framework hints.
   - Run local typecheck/lint/audit/unused/circular checks when available.
   - Surface local code-review risks from deterministic AST rules.

AI then produces:

- Overall health summary.
- Top 3-5 prioritized issues.
- Evidence for each issue.
- Likely cause.
- Repair suggestion.
- **Optimization strategy** (goals, approach, expected benefit, caveats).
- **Implementation steps** (2–8 actionable items, preferably file/config/command specific).
- **Code or config hints** (optional pseudo-code, snippets, or refactor examples).
- Verification method.

AI diagnosis must go beyond restating the report: each issue should include concrete code-level or optimization guidance grounded in collected evidence.

### Explicit Non-Goals For V0.x

- No cloud account system.
- No team workspace.
- No billing.
- No online monitoring SDK.
- No automatic code modification.
- No full design-system generator.
- No multi-agent autonomous repair loop.
- No production database requirement.

## 5. Product Workflow

### Scan Flow

```text
1. User selects scan mode (local or online) and enters target URL.
2. Local mode: user also provides projectPath. Online mode: optional auth profile.
3. FrontScope validates input and resolves AI config from frontscope.config.json / env.
4. FrontScope opens the page in Chromium through Playwright.
5. It collects runtime errors and a screenshot.
6. It runs Lighthouse for performance and page quality metrics.
7. Local mode only: it scans project files for package and project-quality signals.
8. It normalizes all findings into a scan JSON file.
9. It sends a compact evidence payload to the AI analyzer (when enabled).
10. It validates the AI structured output.
11. It generates JSON and Markdown reports.
```

### Report Flow

The report should answer five questions:

1. Is this page healthy enough to ship?
2. What are the top issues?
3. What evidence supports each issue?
4. What should be fixed first?
5. How should the fix be verified?

## 6. MVP Requirements

### R1. Scan Input

The user can provide:

```json
{
  "scanMode": "local",
  "projectPath": "/absolute/path/to/project",
  "url": "http://localhost:5173",
  "pageName": "optional human name",
  "authStatePath": ".frontscope/auth/admin.json",
  "enableAi": true
}
```

Validation:

- `scanMode` is `local` or `online`. Defaults to `local` when `projectPath` is present, otherwise `online`.
- `local` mode requires `projectPath`.
- `online` mode does not require `projectPath`; if provided, it is ignored for project-quality scanning.
- `url` must be reachable.
- `viewport` is optional and defaults to `desktop` (internal compatibility only; not exposed in the main UI).
- `authStatePath` is optional; used mainly in online mode for permission-gated pages.
- AI credentials are read from `frontscope.config.json` or environment variables — never from the scan form.
- For V0.1 CLI, `pageName` may be omitted.

### R1b. Auth Profiles

Sensitive login state is stored locally:

```text
.frontscope/auth/<profileName>.json
```

These Playwright `storageState` files contain cookies and localStorage. They must not be committed (`.frontscope/auth/` is gitignored).

### R1c. AI Configuration

Preferred source: `frontscope.config.json` in the **FrontScope install directory** (the cwd when running `pnpm dev` / `pnpm scan`), or an explicit path from `FRONTSCOPE_CONFIG`.

When scanning in **local mode**, an optional overlay at `{projectPath}/frontscope.config.json` may override non-secret AI fields (model, base URL, etc.). Secrets should remain in environment variables.

Example:

```json
{
  "ai": {
    "provider": "openai",
    "baseURL": "https://api.example.com/v1",
    "model": "gpt-4.1-mini"
  }
}
```

Set `FRONTSCOPE_AI_API_KEY` in the environment, or reference it in the config via `${FRONTSCOPE_AI_API_KEY}` interpolation.

The scan UI exposes AI config **status** and a **connectivity test** (`POST /api/ai/test`) that sends a minimal Chat Completions `ping` against the resolved provider — not just whether a config file exists.

### R2. Runtime Evidence

FrontScope must collect:

- `console.error` messages.
- Browser `pageerror` exceptions.
- Failed network requests.
- HTTP responses with status >= 400.
- Page title and final URL.
- Screenshot file path.

### R3. Lighthouse Evidence

FrontScope must collect:

- Performance score.
- Accessibility score.
- Best practices score.
- SEO score.
- LCP.
- CLS.
- TBT.
- Speed Index.
- Top failed or warning audits with title, score, and description.

### R4. Project Evidence

FrontScope must collect (local mode only; skipped in online mode with an explicit report note):

- Package manager inference: pnpm, npm, yarn, or unknown.
- Main scripts from `package.json`.
- Dependencies and devDependencies.
- Framework hints: Vue, React, Vite, Webpack, Nuxt, Next, etc.
- Build config files found.

### R5. Project Quality Evidence

FrontScope should collect local project-health evidence when `scanMode` is `local` and `projectPath` is provided (online mode skips this module):

- TypeScript typecheck status and top errors.
- ESLint status and top files when config exists.
- Dependency audit severity counts.
- Unused files/dependencies/exports when Knip is installed.
- Circular dependency count when Madge is installed.
- Built-in local code-review findings for high-signal frontend risks.

### R6. AI Diagnosis

The AI analyzer must only use collected evidence.

Output schema:

```json
{
  "summary": "string",
  "healthLevel": "good | warning | critical",
  "topIssues": [
    {
      "title": "string",
      "severity": "high | medium | low",
      "category": "runtime | performance | network | memory | dependency | code-quality | project",
      "evidenceIds": ["string"],
      "possibleCause": "string",
      "suggestion": "string",
      "optimizationDirection": "string",
      "implementationSteps": ["string"],
      "codeHints": "string (optional)",
      "verifyMethod": "string"
    }
  ],
  "nextActions": ["string"]
}
```

Guardrail:

- Every issue must reference at least one collected `evidenceId`; unknown ids are rejected.
- If the AI mentions a file, metric, dependency, or error, it must appear in evidence.
- `optimizationDirection` and `implementationSteps` must be actionable — not a restatement of the evidence summary.
- If evidence is insufficient, the AI should say what extra evidence is needed.

### R7. Report Output

Each scan creates:

```text
reports/<scan-id>/scan.json
reports/<scan-id>/report.md
reports/<scan-id>/screenshot.png
```

`<scan-id>` uses local time `YYYY-MM-DD_HH-mm-ss` plus an optional page-name slug, for example `2026-06-23_18-30-45-shou-ye`.

The Markdown report includes:

- Scan metadata.
- Health summary.
- Key metrics.
- Runtime errors.
- Top AI issues (summary, cause, suggestion, optimization strategy, implementation steps, optional code hints, verification).
- Raw evidence appendix.

## 7. Product Iterations

### V0.1 Evidence CLI

Goal:

Build the evidence collection layer.

Features:

- CLI input for project path and URL.
- Playwright runtime collection.
- Lighthouse collection.
- Basic package scan.
- JSON report generation.

No AI and no Web UI.

Success criteria:

- A local Vue/Vite project can be scanned.
- The output JSON includes runtime evidence, Lighthouse metrics, package metadata, and screenshot path.

### V0.2 AI Markdown Report

Goal:

Turn evidence into a useful diagnosis.

Features:

- AI structured output.
- Markdown report generation.
- Schema validation.
- Evidence guardrail.

Success criteria:

- Report includes top issues with evidence, cause, suggestion, optimization strategy, implementation steps, optional code hints, and verification method.
- AI output can be parsed reliably.

### V0.3 Web UI

Goal:

Make the tool usable without command-line knowledge.

Features:

- Scan form.
- Single `pnpm dev` command starts the web UI (`:5173`) and API (`:3001`) together; `pnpm dev:web` / `pnpm dev:api` remain for isolated debugging.
- Scan progress with step-level status polled from `/api/scan/progress/:id` (page session, Lighthouse, project quality, memory, AI, report).
- Report detail page.
- Screenshot preview.
- Markdown export.
- Right-side workspace panels that reflect real scan state:
  - Evidence modules show pending / scanning / collected / skipped / failed based on scan mode, form options, and `scan.json` module results.
  - Readiness panel runs pre-scan checks (URL, API, project path, AI config) and post-scan evidence completion stats.
- AI connectivity test button sends a minimal Chat Completions `ping` request against the resolved config.

Success criteria:

- A user can start a scan and read a report from the browser UI.
- The user can tell before scanning whether prerequisites are satisfied, and after scanning which evidence modules succeeded or failed.

### V0.4 Performance Trace Diagnosis

Goal:

Add report-style Chrome Performance Trace evidence.

Features:

- Save Chrome trace artifacts.
- Summarize long tasks, layout shifts, and main-thread category durations.
- Feed trace summaries into Markdown and AI diagnosis.

Success criteria:

- The report can identify main-thread and layout-shift risks with trace evidence.

### V0.5 Rerun And Compare

Goal:

Make FrontScope useful after a fix.

Features:

- Compare two scans.
- Show changed metrics and issue counts.
- Generate "before vs after" report.

Success criteria:

- The user can prove whether a fix improved or worsened the project.

## 8. Recommended Tech Stack

Frontend UI:

- Vue 3 + TypeScript + Vite.
- Element Plus or Naive UI if a component library is desired.

Local backend:

- Node.js + TypeScript.
- Hono or Fastify.

CLI:

- Node.js executable with `commander`.

Scanning:

- Playwright.
- Lighthouse.
- Chrome DevTools Protocol for Network, Performance Trace, and Memory evidence.

Validation:

- Zod.

AI:

- OpenAI-compatible provider configured via `frontscope.config.json` and environment variables.
- No credentials in the scan form or persisted scan input.

Storage:

- V0.x: local JSON files and `history.json`.
- Later: optional SQLite only if history filtering and larger scan archives outgrow JSON.

## 9. Learning Roadmap

Learn only what the product needs:

1. Node CLI and filesystem operations.
2. Playwright page automation and event collection.
3. Lighthouse Node integration.
4. JSON schema validation with Zod.
5. AI structured output and prompt design.
6. Local HTTP API and task progress.
7. Chrome DevTools Protocol trace/network/memory evidence.
8. Local scan history and comparison reports.

## 10. Main Risks

### Risk 1: Product becomes too broad

Mitigation:

- Keep V0.1 limited to evidence collection.
- Do not build monitoring, account, cloud, billing, or auto-fix.

### Risk 2: AI produces generic advice

Mitigation:

- Use structured evidence.
- Require every issue to cite evidence ids.
- Require optimization strategy, implementation steps, and optional code hints — not generic restatements.
- Add schema validation (Zod).
- Prefer top 3-5 issues instead of a long generic list.

### Risk 3: Lighthouse results are noisy

Mitigation:

- Show collected metrics as evidence, not absolute truth.
- Later support repeated runs and median values.

### Risk 4: Local project environments differ

Mitigation:

- V0.1 assumes the user starts the target dev server manually.
- FrontScope only checks a reachable URL.
- Starting project scripts automatically can be added later.

## 11. First Build Decision

The first build should be V0.1 Evidence CLI.

Reason:

- It proves the core technical chain.
- It avoids UI and AI complexity.
- It produces concrete data for later AI diagnosis.
- It matches the product principle: evidence first.
