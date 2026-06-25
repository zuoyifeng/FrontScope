# Repository Guidelines

## Project Structure & Module Organization

FrontScope is a local-first React, Vite, and TypeScript app with a Node API and scanner runtime. Frontend code lives in `src/`, with feature views under `src/features/` and global styling in `src/styles.css`. Scanner logic lives in `scanner/`: CLI entry in `scanner/cli.ts`, orchestration in `scanner/scan/`, collectors in `scanner/scanners/`, AI support in `scanner/ai/`, and reports in `scanner/report/`. The API server is in `server/`; product notes are in `docs/`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies.
- `pnpm dev`: start the Vite frontend on `http://localhost:5173`.
- `pnpm dev:api`: start the Hono API on `http://localhost:3001`.
- `pnpm scan --url http://localhost:5173`: run the scanner CLI; add `--project /path/to/project`, `--ai`, `--mock-ai`, or `--memory` as needed.
- `pnpm test`: run Vitest once.
- `pnpm test:watch`: run Vitest in watch mode.
- `pnpm build`: run scanner TypeScript checks, project type checks, and the production Vite build.
- `pnpm preview`: serve the built frontend locally.

## Coding Style & Naming Conventions

Use TypeScript modules and 2-space indentation. Prefer named exports for reusable scanner/server utilities and PascalCase for React components such as `ScanResultView.tsx`. Keep tests beside the code they cover as `*.test.ts` or `*.test.tsx`. Use explicit types for public scan data, API payloads, and AI/provider contracts.

## Testing Guidelines

Vitest is configured with `jsdom`, globals, and `src/setupTests.ts`. Test files are included from `src/**/*.test.{ts,tsx}`, `scanner/**/*.test.ts`, and `server/**/*.test.ts`. Add focused tests for scanner behavior, API validation, report output, and UI rendering. Run `pnpm test` before submitting changes; run `pnpm build` for TypeScript config, scanner compilation, Vite output, or shared type changes.

## Commit & Pull Request Guidelines

This checkout does not include local Git history, so no project-specific convention can be inferred. Use short imperative subjects, for example `Add memory scan summary tests` or `Fix AI config validation`. Pull requests should include a summary, verification commands, linked issue or context, and screenshots for UI changes.

## Security & Configuration Tips

Do not commit real API keys or local auth state. Use `frontscope.config.example.json` as the template and keep secrets in environment variables such as `OPENAI_API_KEY` or `FRONTSCOPE_API_TOKEN`. When enabling remote or shared use, review `security.allowedOrigins`, `allowedProjectRoots`, `allowedOutputRoots`, and `allowedUrlHosts`.

## Agent-Specific Instructions

This workspace has `.codegraph/`; use CodeGraph before broad text search when locating or understanding code. Shell commands should be prefixed with `rtk` per `/Users/zuogz/.codex/RTK.md`.
