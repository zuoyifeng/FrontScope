// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateInput } from './validateInput.js';

describe('validateInput', () => {
  it('normalizes valid scan input and defaults viewport', () => {
    const result = validateInput({
      projectPath: process.cwd(),
      url: 'http://localhost:5173',
      pageName: '首页',
    });

    expect(result.projectPath).toBe(process.cwd());
    expect(result.url).toBe('http://localhost:5173');
    expect(result.viewport).toBe('desktop');
    expect(result.scanMode).toBe('local');
    expect(result.pageName).toBe('首页');
  });

  it('rejects local mode without projectPath', () => {
    expect(() =>
      validateInput({
        scanMode: 'local',
        url: 'http://localhost:5173',
      }),
    ).toThrow('local mode requires projectPath');
  });

  it('allows online mode without projectPath', () => {
    const result = validateInput({
      scanMode: 'online',
      url: 'http://localhost:5173',
    });

    expect(result.scanMode).toBe('online');
    expect(result.projectPath).toBeUndefined();
    expect(result.viewport).toBe('desktop');
  });

  it('defaults missing scanMode to local when projectPath is provided', () => {
    const result = validateInput({
      projectPath: process.cwd(),
      url: 'http://localhost:5173',
    });

    expect(result.scanMode).toBe('local');
  });

  it('defaults missing scanMode to online when projectPath is absent', () => {
    const result = validateInput({
      url: 'http://localhost:5173',
    });

    expect(result.scanMode).toBe('online');
    expect(result.projectPath).toBeUndefined();
  });

  it('defaults missing viewport to desktop', () => {
    const result = validateInput({
      scanMode: 'online',
      url: 'http://localhost:5173',
    });

    expect(result.viewport).toBe('desktop');
  });

  it('rejects invalid scan mode values', () => {
    expect(() =>
      validateInput({
        scanMode: 'remote',
        url: 'http://localhost:5173',
      }),
    ).toThrow();
  });

  it('rejects non-http URLs', () => {
    expect(() =>
      validateInput({
        projectPath: process.cwd(),
        url: 'file:///tmp/index.html',
      }),
    ).toThrow('URL 必须以 http:// 或 https:// 开头');
  });

  it('rejects missing project paths', () => {
    expect(() =>
      validateInput({
        projectPath: '/path/that/does/not/exist',
        url: 'http://localhost:5173',
      }),
    ).toThrow('项目路径不存在');
  });

  it('accepts and resolves an existing Playwright storage state file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontscope-auth-'));
    const authStatePath = join(dir, 'admin.json');
    writeFileSync(authStatePath, JSON.stringify({ cookies: [], origins: [] }));

    const result = validateInput({
      url: 'http://localhost:5173/admin',
      authStatePath,
    });

    expect(result.authStatePath).toBe(authStatePath);
  });

  it('rejects missing auth state files', () => {
    expect(() =>
      validateInput({
        url: 'http://localhost:5173/admin',
        authStatePath: '/path/that/does/not/exist.json',
      }),
    ).toThrow('登录态文件不存在');
  });

  it('requires complete inline ai config when ai object is provided', () => {
    expect(() =>
      validateInput({
        url: 'http://localhost:5173',
        ai: { baseURL: 'https://api.example.com/v1', model: 'gpt-4o-mini' },
      }),
    ).toThrow('API Key');

    expect(() =>
      validateInput({
        url: 'http://localhost:5173',
        ai: { baseURL: 'https://api.example.com/v1', apiKey: 'sk-test' },
      }),
    ).toThrow('模型');
  });

  it('allows enableAi without inline ai for CLI/file-config flows', () => {
    const result = validateInput({
      url: 'http://localhost:5173',
      enableAi: true,
    });

    expect(result.enableAi).toBe(true);
    expect(result.ai).toBeUndefined();
  });

  it('accepts inline ai config when enableAi is true', () => {
    const result = validateInput({
      url: 'http://localhost:5173',
      enableAi: true,
      ai: {
        baseURL: 'https://api.xiaomimimo.com/v1',
        apiKey: 'sk-test',
        model: 'mimo-v2.5-pro',
        authHeader: 'api-key',
      },
    });

    expect(result.ai?.apiKey).toBe('sk-test');
    expect(result.ai?.authHeader).toBe('api-key');
  });
});
