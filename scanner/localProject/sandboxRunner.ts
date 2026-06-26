import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';

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

function createDefaultDriver(): SandboxRunnerDriver {
  return {
    spawn(command, args, options) {
      const child = nodeSpawn(command, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      }) as ChildProcess;

      if (!child.pid) {
        throw new Error(`Failed to start ${command} ${args.join(' ')}`);
      }

      return {
        pid: child.pid,
        stop: async () => {
          await new Promise<void>((resolve, reject) => {
            child.once('exit', () => resolve());
            child.once('error', reject);
            child.kill('SIGTERM');
            setTimeout(() => {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
            }, 5_000);
          });
        },
      };
    },
  };
}

export async function startSandboxedProject(
  input: SandboxRunInput,
  driver: SandboxRunnerDriver = createDefaultDriver(),
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
