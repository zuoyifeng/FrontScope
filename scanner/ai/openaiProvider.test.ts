// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createOpenAiProvider, testOpenAiConnection, type FetchImpl } from './openaiProvider.js';
import { createAiProvider } from './aiProvider.js';
import type { CompactEvidenceItem } from './types.js';

const evidence: CompactEvidenceItem[] = [
  { id: 'lighthouse.metric.lcp', category: 'performance', summary: 'LCP: 3.2 s' },
];

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createOpenAiProvider', () => {
  it('sends an OpenAI-compatible chat completion request and returns the content', async () => {
    const diagnosis = JSON.stringify({ summary: 'ok', healthLevel: 'good', topIssues: [], nextActions: [] });
    const fetchImpl = vi.fn<FetchImpl>().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: diagnosis } }] }),
    );

    const provider = createOpenAiProvider({
      baseURL: 'https://api.example.com/v1/',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      fetchImpl,
    });

    const result = await provider.generateDiagnosis({ evidence });

    expect(result).toBe(diagnosis);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('lighthouse.metric.lcp');
  });

  it('throws a descriptive error when the provider returns a non-2xx status', async () => {
    const fetchImpl = vi
      .fn<FetchImpl>()
      .mockResolvedValue(jsonResponse({ error: 'nope' }, { status: 401, statusText: 'Unauthorized' }));

    const provider = createOpenAiProvider({ apiKey: 'sk-test', model: 'gpt-4o-mini', fetchImpl });

    await expect(provider.generateDiagnosis({ evidence })).rejects.toThrow('401');
  });

  it('throws when the provider returns empty content', async () => {
    const fetchImpl = vi.fn<FetchImpl>().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] }));

    const provider = createOpenAiProvider({ apiKey: 'sk-test', model: 'gpt-4o-mini', fetchImpl });

    await expect(provider.generateDiagnosis({ evidence })).rejects.toThrow('返回内容为空');
  });

  it('uses api-key header and max_completion_tokens for Xiaomi Mimo-style endpoints', async () => {
    const diagnosis = JSON.stringify({ summary: 'ok', healthLevel: 'good', topIssues: [], nextActions: [] });
    const fetchImpl = vi.fn<FetchImpl>().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: diagnosis } }] }),
    );

    const provider = createOpenAiProvider({
      baseURL: 'https://api.xiaomimimo.com/v1',
      apiKey: 'sk-mimo',
      authHeader: 'api-key',
      model: 'mimo-v2.5-pro',
      fetchImpl,
    });

    await provider.generateDiagnosis({ evidence });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe('sk-mimo');
    expect(headers.Authorization).toBeUndefined();

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('mimo-v2.5-pro');
    expect(body.max_completion_tokens).toBe(8192);
    expect(body.max_tokens).toBeUndefined();
    expect(body.thinking).toEqual({ type: 'disabled' });
  });
});

describe('createAiProvider', () => {
  it('returns the mock provider for the mock kind', async () => {
    const provider = createAiProvider({ provider: 'mock' });
    const output = await provider.generateDiagnosis({ evidence });

    expect(JSON.parse(output).healthLevel).toBeDefined();
  });

  it('rejects the openai provider without an apiKey', () => {
    expect(() => createAiProvider({ provider: 'openai', model: 'gpt-4o-mini' })).toThrow('apiKey');
  });

  it('points missing apiKey errors to project config instead of the scan form', () => {
    expect(() => createAiProvider({ provider: 'openai', model: 'gpt-4o-mini' })).toThrow(
      'frontscope.config.json',
    );
    expect(() => createAiProvider({ provider: 'openai', model: 'gpt-4o-mini' })).not.toThrow(
      '扫描表单',
    );
  });

  it('rejects the openai provider without a model', () => {
    expect(() => createAiProvider({ provider: 'openai', apiKey: 'sk-test' })).toThrow('model');
  });
});

describe('testOpenAiConnection', () => {
  it('uses api-key header and a minimal completion payload for connectivity probes', async () => {
    const fetchImpl = vi.fn<FetchImpl>().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }),
    );

    const result = await testOpenAiConnection({
      baseURL: 'https://api.xiaomimimo.com/v1',
      apiKey: 'sk-mimo',
      authHeader: 'api-key',
      model: 'mimo-v2.5-pro',
      fetchImpl,
    });

    expect(result.content).toContain('ok');
    const [, init] = fetchImpl.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe('sk-mimo');

    const body = JSON.parse(init.body as string);
    expect(body.messages[1].content).toBe('ping');
    expect(body.max_completion_tokens).toBe(16);
    expect(body.max_tokens).toBeUndefined();
  });
});
