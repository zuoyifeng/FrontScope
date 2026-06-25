import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface CommandOptions {
  cwd: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

export type CommandRunner = (command: string, args: string[], options: CommandOptions) => Promise<CommandResult>;

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Run a command without a shell so user-controlled paths can never be
 * interpolated into a shell. Arguments are always passed as an array.
 * The command is read-only by contract; callers must never run mutating tools.
 */
export const runCommand: CommandRunner = (command, args, options) =>
  new Promise((resolve) => {
    const start = Date.now();
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(command, args, { cwd: options.cwd, shell: false, windowsHide: true });

    const timer =
      typeof options.timeoutMs === 'number'
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, options.timeoutMs)
        : undefined;

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < maxBuffer) stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < maxBuffer) stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({
        command,
        args,
        exitCode: null,
        stdout,
        stderr: stderr || (error instanceof Error ? error.message : String(error)),
        durationMs: Date.now() - start,
        timedOut,
      });
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ command, args, exitCode: code, stdout, stderr, durationMs: Date.now() - start, timedOut });
    });
  });

/**
 * Resolve a tool's binary from the target project's `node_modules/.bin`.
 * Returns undefined when the tool is not installed locally, which lets callers
 * skip gracefully and suggest installation (hybrid strategy).
 */
export function resolveLocalBin(
  projectPath: string,
  tool: string,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  const candidates = [
    join(projectPath, 'node_modules', '.bin', tool),
    join(projectPath, 'node_modules', '.bin', `${tool}.cmd`),
  ];
  return candidates.find((candidate) => exists(candidate));
}
