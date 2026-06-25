// @vitest-environment node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertPathWithinRoots, assertUrlAllowed } from './guards.js';

describe('assertUrlAllowed', () => {
  it('allows local dev URLs by default', () => {
    expect(() => assertUrlAllowed('http://localhost:5173')).not.toThrow();
    expect(() => assertUrlAllowed('http://127.0.0.1:5173')).not.toThrow();
    expect(() => assertUrlAllowed('https://example.com')).not.toThrow();
  });

  it('always blocks cloud metadata endpoints', () => {
    expect(() => assertUrlAllowed('http://169.254.169.254/latest/meta-data')).toThrow('云元数据');
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => assertUrlAllowed('file:///etc/passwd')).toThrow('http');
  });

  it('blocks internal networks when private access is disabled', () => {
    expect(() => assertUrlAllowed('http://localhost:5173', { allowPrivateNetwork: false })).toThrow('内网');
    expect(() => assertUrlAllowed('http://10.0.0.5', { allowPrivateNetwork: false })).toThrow('内网');
    expect(() => assertUrlAllowed('http://192.168.1.10', { allowPrivateNetwork: false })).toThrow('内网');
    expect(() => assertUrlAllowed('http://172.16.0.1', { allowPrivateNetwork: false })).toThrow('内网');
  });

  it('still allows public hosts when private access is disabled', () => {
    expect(() => assertUrlAllowed('https://example.com', { allowPrivateNetwork: false })).not.toThrow();
  });

  it('enforces a host allowlist when provided', () => {
    expect(() => assertUrlAllowed('https://evil.com', { allowedHosts: ['example.com'] })).toThrow('允许列表');
    expect(() => assertUrlAllowed('https://example.com', { allowedHosts: ['example.com'] })).not.toThrow();
  });
});

describe('assertPathWithinRoots', () => {
  it('allows any path in trusted mode (no roots configured)', () => {
    expect(() => assertPathWithinRoots('/any/where', [], '项目路径')).not.toThrow();
    expect(() => assertPathWithinRoots('/any/where', undefined, '项目路径')).not.toThrow();
  });

  it('allows paths inside an allowed root', () => {
    const root = tmpdir();
    expect(() => assertPathWithinRoots(join(root, 'project'), [root], '项目路径')).not.toThrow();
  });

  it('rejects paths outside the allowed roots', () => {
    expect(() => assertPathWithinRoots('/etc/passwd', ['/home/me/projects'], '输出目录')).toThrow(
      '不在允许的目录范围内',
    );
  });

  it('rejects path traversal escaping the allowed root', () => {
    expect(() => assertPathWithinRoots('/home/me/projects/../../etc', ['/home/me/projects'], '项目路径')).toThrow(
      '不在允许的目录范围内',
    );
  });
});
