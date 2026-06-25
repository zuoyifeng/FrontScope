// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { saveAuthState, type AuthStateDriver } from './saveAuthState.js';

describe('saveAuthState', () => {
  it('creates the output directory and delegates storageState capture', async () => {
    const outputDir = join(mkdtempSync(join(tmpdir(), 'frontscope-auth-')), 'nested');
    const outputPath = join(outputDir, 'admin.json');
    const calls: unknown[] = [];
    const driver: AuthStateDriver = {
      async save(options) {
        calls.push(options);
        writeFileSync(options.outputPath, '{"cookies":[],"origins":[]}', 'utf8');
      },
    };

    await saveAuthState(
      {
        loginUrl: 'http://localhost:5173/login',
        targetUrl: 'http://localhost:5173/#/admin/users',
        outputPath,
      },
      driver,
    );

    expect(calls).toEqual([
      {
        loginUrl: 'http://localhost:5173/login',
        targetUrl: 'http://localhost:5173/#/admin/users',
        outputPath,
      },
    ]);
    expect(existsSync(outputDir)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual({ cookies: [], origins: [] });
  });
});
