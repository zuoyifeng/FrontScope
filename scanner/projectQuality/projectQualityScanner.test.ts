// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { scanProjectQuality } from './projectQualityScanner.js';
import type { CommandRunner, CommandResult } from './commandRunner.js';

function makeResult(overrides: Partial<CommandResult>): CommandResult {
  return {
    command: 'tool',
    args: [],
    exitCode: 0,
    stdout: '',
    stderr: '',
    durationMs: 1,
    timedOut: false,
    ...overrides,
  };
}

describe('scanProjectQuality', () => {
  it('skips external tools that are not installed and still runs code review', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-pq-'));
    mkdirSync(join(projectPath, 'src'));
    writeFileSync(
      join(projectPath, 'src', 'List.tsx'),
      `export const List = ({ items }) => <ul>{items.map((item) => <li>{item.name}</li>)}</ul>;`,
    );

    const runner = vi.fn<CommandRunner>();

    const evidence = await scanProjectQuality(projectPath, { runner });

    expect(runner).not.toHaveBeenCalled();
    expect(evidence.typecheck.status).toBe('skipped');
    expect(evidence.eslint.status).toBe('skipped');
    expect(evidence.audit.status).toBe('skipped');
    expect(evidence.unused.skippedReason).toContain('knip');
    expect(evidence.circular.skippedReason).toContain('madge');
    expect(evidence.codeReview.status).toBe('issues');
    expect(evidence.codeReview.findings[0].ruleId).toBe('react/missing-key');
  });

  it('parses tsc and eslint output when the tools are installed', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-pq-tools-'));
    mkdirSync(join(projectPath, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(projectPath, 'tsconfig.json'), '{}');
    writeFileSync(join(projectPath, 'eslint.config.js'), 'export default [];');
    writeFileSync(join(projectPath, 'node_modules', '.bin', 'tsc'), '');
    writeFileSync(join(projectPath, 'node_modules', '.bin', 'eslint'), '');

    const runner: CommandRunner = async (command) => {
      if (command.endsWith('tsc')) {
        return makeResult({
          exitCode: 2,
          stdout: "src/App.tsx(10,5): error TS2304: Cannot find name 'foo'.\n",
        });
      }
      if (command.endsWith('eslint')) {
        return makeResult({
          exitCode: 1,
          stdout: JSON.stringify([
            { filePath: join(projectPath, 'src/App.tsx'), errorCount: 2, warningCount: 1 },
          ]),
        });
      }
      return makeResult({});
    };

    const evidence = await scanProjectQuality(projectPath, { runner });

    expect(evidence.typecheck.status).toBe('issues');
    expect(evidence.typecheck.errorCount).toBe(1);
    expect(evidence.eslint.status).toBe('issues');
    expect(evidence.eslint.errorCount).toBe(2);
    expect(evidence.eslint.warningCount).toBe(1);
    expect(evidence.eslint.topFiles[0].file).toBe('src/App.tsx');
  });

  it('parses pnpm audit vulnerabilities', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-pq-audit-'));
    writeFileSync(join(projectPath, 'pnpm-lock.yaml'), '');

    const runner: CommandRunner = async (command) => {
      if (command === 'pnpm') {
        return makeResult({
          stdout: JSON.stringify({
            metadata: { vulnerabilities: { critical: 1, high: 2, moderate: 0, low: 3, info: 0 } },
          }),
        });
      }
      return makeResult({});
    };

    const evidence = await scanProjectQuality(projectPath, { runner });

    expect(evidence.audit.status).toBe('issues');
    expect(evidence.audit.total).toBe(6);
    expect(evidence.audit.vulnerabilities.critical).toBe(1);
  });
});
