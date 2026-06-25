// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG_FILENAME } from './config.js';
import { runAiConnectionTest } from './testAiConnection.js';
import type { FetchImpl } from './openaiProvider.js';

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('runAiConnectionTest', () => {
  it('fails fast for mock provider without calling the network', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'frontscope-mock-'));
    writeFileSync(join(cwd, DEFAULT_CONFIG_FILENAME), JSON.stringify({ ai: { provider: 'mock' } }), 'utf8');

    const result = await runAiConnectionTest({ configPath: join(cwd, DEFAULT_CONFIG_FILENAME) });

    expect(result.success).toBe(false);
    expect(result.error).toContain('mock');
  });

  it('reports a successful connectivity probe', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'frontscope-openai-'));
    writeFileSync(
      join(cwd, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({
        ai: {
          provider: 'openai',
          baseURL: 'https://api.example.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-4o-mini',
        },
      }),
      'utf8',
    );

    const fetchImpl = vi.fn<FetchImpl>().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }),
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as typeof fetch;

    try {
      const result = await runAiConnectionTest({ configPath: join(cwd, DEFAULT_CONFIG_FILENAME) });

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.responsePreview).toContain('ok');
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://api.example.com/v1/chat/completions');
      const body = JSON.parse(String(init?.body));
      expect(body.messages[1].content).toBe('ping');
      expect(body.max_tokens).toBe(16);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns provider error details when the endpoint rejects the request', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'frontscope-openai-fail-'));
    writeFileSync(
      join(cwd, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({
        ai: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
      }),
      'utf8',
    );

    const fetchImpl = vi
      .fn<FetchImpl>()
      .mockResolvedValue(jsonResponse({ error: 'invalid key' }, { status: 401, statusText: 'Unauthorized' }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as typeof fetch;

    try {
      const result = await runAiConnectionTest({ configPath: join(cwd, DEFAULT_CONFIG_FILENAME) });

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
