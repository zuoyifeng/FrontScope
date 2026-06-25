// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCommand, resolveLocalBin } from './commandRunner.js';

describe('runCommand', () => {
  it('captures stdout and a zero exit code without using a shell', async () => {
    const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("hello")'], {
      cwd: process.cwd(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
    expect(result.timedOut).toBe(false);
  });

  it('marks a command as timed out when it exceeds the timeout', async () => {
    const result = await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {
      cwd: process.cwd(),
      timeoutMs: 50,
    });

    expect(result.timedOut).toBe(true);
  });
});

describe('resolveLocalBin', () => {
  it('finds a tool in the project node_modules/.bin', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-bin-'));
    mkdirSync(join(projectPath, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(projectPath, 'node_modules', '.bin', 'eslint'), '');

    expect(resolveLocalBin(projectPath, 'eslint')).toBe(join(projectPath, 'node_modules', '.bin', 'eslint'));
  });

  it('returns undefined when the tool is not installed', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-bin-missing-'));

    expect(resolveLocalBin(projectPath, 'knip')).toBeUndefined();
  });
});
