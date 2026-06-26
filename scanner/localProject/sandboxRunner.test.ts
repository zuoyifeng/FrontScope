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
          return {
            pid: 123,
            stop: async () => {
              calls.push('stop');
            },
          };
        },
      },
    );

    expect(calls[0]).toBe('pnpm run dev -- --port 4317');
    await session.stop();
    expect(calls).toContain('stop');
  });
});
