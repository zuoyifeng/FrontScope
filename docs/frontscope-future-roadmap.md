# FrontScope Future Roadmap

This document turns current product gaps into contribution-sized workstreams. It is intentionally written as a roadmap, not as a claim that these capabilities already exist.

The execution plan for these workstreams lives in `docs/frontscope-roadmap-implementation-plan.md`.

## Goals

FrontScope should become useful for real frontend projects in three situations:

1. The important page is behind login or route guards.
2. The codebase is not React + TypeScript.
3. The user only has a local project folder and does not want to manually start the app or type every route.

## Workstream 1: Authenticated Route Coverage

### Problem

Many internal business systems redirect unauthenticated users to login pages. If FrontScope opens the requested URL without valid auth state, it measures the login page instead of the target route.

### Current Baseline

- Users can save and reuse Playwright `storageState`.
- Online scans can receive `authStatePath`.
- Runtime evidence records requested URL, final URL, and target mismatch reason.

### Planned Phases

#### Phase 1: Auth Profile Hardening

- Store profile metadata next to the storage state: profile name, created time, last verified time, login URL, target origin, and optional notes.
- Add a profile verification action that opens a known target page and records whether it lands on the expected route.
- Mark stale profiles in the UI instead of silently using them.
- Keep `.frontscope/auth/` ignored by git.

#### Phase 2: Protected Route Discovery

- For static sources, read framework route files and config:
  - React Router route objects.
  - Next.js `app/` and `pages/`.
  - Nuxt `pages/`.
  - Vue Router config.
  - Angular router config.
- For runtime sources, crawl same-origin links after login using the saved auth profile.
- Exclude logout, destructive, external, download, and mutation-like URLs by default.

#### Phase 3: Route Monitoring Sets

- Let users save a named set of routes.
- Reuse the set in future scans.
- Report per-route health and aggregate health.
- Compare each route against its previous scan.

### Acceptance Signals

- A protected route scan reports whether it actually hit the intended page.
- A user can verify or refresh a saved auth profile.
- A user can discover candidate protected routes after login and select which ones to monitor.

## Workstream 2: Framework-Neutral Project Quality

### Problem

FrontScope runtime evidence is mostly framework-agnostic, but local code quality checks are currently strongest for React + TypeScript. Real frontend teams use Vue, Angular, Next.js, Nuxt, Solid, plain JavaScript, and mixed workspaces.

### Architecture Direction

Use adapter-based project analysis:

```text
project detector
-> framework adapter
-> route extractor
-> static parser
-> framework-specific rules
-> normalized project evidence
```

Each adapter should produce the same normalized evidence shape so report and AI logic do not become framework-specific.

### Planned Adapters

#### React / Next.js

- JSX list-key and unsafe HTML rules.
- Next.js route extraction from `app/` and `pages/`.
- Client/server component hints.
- Hydration and dynamic import hints.

#### Vue / Nuxt

- Parse `.vue` single-file components.
- Extract template, script, and style blocks.
- Detect missing `:key`, unsafe `v-html`, oversized components, and route-level lazy loading gaps.
- Extract routes from Nuxt `pages/` and Vue Router config.

#### Angular

- Detect Angular workspace and project roots.
- Parse routing modules and standalone route config.
- Inspect templates for common performance and maintainability risks.
- Surface heavy module and lazy-loading opportunities.

#### Solid

- Parse Solid JSX.
- Adapt list/rendering checks to Solid control-flow primitives.
- Detect accidental React-only assumptions.

#### JavaScript-Only Projects

- Add a Babel/Acorn parser path when TypeScript AST is unavailable.
- Keep rules conservative when type information is missing.
- Report lower confidence instead of pretending JS-only analysis is equivalent to typed analysis.

### Acceptance Signals

- Project detection reports detected frameworks and confidence.
- Non-React projects receive relevant static findings instead of React-specific noise.
- AI diagnosis can cite framework-specific evidence ids.

## Workstream 3: Zero-Config Local Project Mode

### Problem

Local mode currently asks for both a folder path and a running URL. That is fine for advanced users, but open-source contributors and new users expect to provide a folder and let the tool guide the rest.

### Target Workflow

```text
select or drag project folder
-> inspect package manager and scripts
-> detect framework and route candidates
-> ask before installing dependencies or running scripts
-> start the app in an isolated process
-> discover routes
-> ask which routes to monitor
-> run scans and write a multi-route report
```

### Planned Phases

#### Phase 1: Project Intake

- Add folder selection/drop support in the UI.
- Detect package manager from lockfiles.
- Read `package.json` scripts.
- Identify likely dev scripts: `dev`, `start`, `serve`, `preview`.
- Show an intake summary before running anything.

#### Phase 2: Safe Sandbox Runner

- Start the app in a child process with timeout and log capture.
- Prefer existing dependencies; ask before installing.
- Allocate an available local port.
- Stop processes after scan completion or cancellation.
- Store run logs with the scan artifacts.

#### Phase 3: Route Discovery

- Extract static routes from framework adapters.
- Crawl runtime links from the running app.
- Group routes by confidence and risk.
- Ask the user to pick routes before scanning.

#### Phase 4: Multi-Route Scan Report

- Run the selected routes as a scan set.
- Produce per-route reports and a summary report.
- Compare route-level metrics across scan history.

### Safety Rules

- Do not modify source files.
- Do not run install scripts without explicit user approval.
- Do not load `.env` files silently when they may contain secrets.
- Do not crawl external origins by default.
- Do not click destructive actions.

## Contributor-Friendly Issues

Good first slices:

- Add framework detector tests for Vue, Angular, Next.js, Nuxt, Solid, and plain JS fixtures.
- Add route extraction fixtures for one framework at a time.
- Add auth profile metadata read/write without changing the browser flow.
- Add route selection data model without implementing the full UI.
- Add README examples for framework-specific scans.

Larger slices:

- Implement Vue SFC static evidence adapter.
- Implement Next.js route extraction and route evidence.
- Implement sandbox runner process lifecycle.
- Implement authenticated route crawler.

## Non-Goals For Now

- Cloud account management.
- Hosted monitoring service.
- Automatic code modification.
- Password capture or credential vaulting.
- Full browser session replay.
