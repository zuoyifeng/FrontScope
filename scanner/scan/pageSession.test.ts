// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { collectPageEvidence, type PageSessionDriver } from './pageSession.js';

const TRACE_PAYLOAD = JSON.stringify({
  traceEvents: [{ name: 'RunTask', cat: 'devtools.timeline', ph: 'X', ts: 1_000_000, dur: 62_000, args: {} }],
});

interface DriverOptions {
  failTracing?: boolean;
  gotoCounter?: { count: number };
  sentMethods?: string[];
  receivedAuthStatePath?: { value?: string };
  finalUrl?: string;
}

function createPageSessionDriver(options: DriverOptions = {}): PageSessionDriver {
  return {
    async createSession(_viewport, sessionOptions) {
      options.receivedAuthStatePath = options.receivedAuthStatePath ?? {};
      options.receivedAuthStatePath.value = sessionOptions?.authStatePath;
      const cdpHandlers: Record<string, Array<(params: unknown) => void>> = {};
      const pageHandlers: Record<string, Array<(payload: unknown) => void>> = {};

      const emit = (method: string, params: unknown): void => {
        cdpHandlers[method]?.forEach((handler) => handler(params));
      };

      return {
        page: {
          on(eventName, handler) {
            pageHandlers[eventName] = [...(pageHandlers[eventName] ?? []), handler];
          },
          async goto() {
            if (options.gotoCounter) options.gotoCounter.count += 1;
            // Simulate a console error and a failed HTTP response.
            pageHandlers['console']?.forEach((handler) =>
              handler({
                type: () => 'error',
                text: () => 'Boom https://alice:secret@example.com/api?token=abc#access_token=secret',
                location: () => ({ url: 'https://example.com/app.js?token=abc' }),
              }),
            );
            pageHandlers['pageerror']?.forEach((handler) =>
              handler(new Error('Crash at https://example.com/app.js?token=abc#access_token=secret')),
            );
            pageHandlers['response']?.forEach((handler) =>
              handler({
                url: () => 'http://localhost:5173/api/x',
                status: () => 500,
                statusText: () => 'Internal Server Error',
                request: () => ({ method: () => 'GET' }),
              }),
            );
            // Simulate CDP network events.
            emit('Network.requestWillBeSent', {
              requestId: '1',
              timestamp: 1,
              type: 'Script',
              request: { url: 'http://localhost:5173/app.js', method: 'GET', initialPriority: 'High' },
            });
            emit('Network.responseReceived', {
              requestId: '1',
              timestamp: 1.2,
              type: 'Script',
              response: {
                url: 'http://localhost:5173/app.js',
                status: 200,
                statusText: 'OK',
                mimeType: 'application/javascript',
                encodedDataLength: 1024,
                timing: { requestTime: 1, sendStart: 1, sendEnd: 2, receiveHeadersEnd: 120 },
              },
            });
            emit('Network.loadingFinished', { requestId: '1', timestamp: 2.2, encodedDataLength: 716_800 });
          },
          async screenshot() {},
          async title() {
            return '首页';
          },
          url() {
            return options.finalUrl ?? 'http://localhost:5173/';
          },
        },
        cdp: {
          async send(method, params) {
            options.sentMethods?.push(method);
            if (method === 'Tracing.start' && options.failTracing) {
              throw new Error('Tracing is unavailable');
            }
            if (method === 'Tracing.end') {
              queueMicrotask(() => emit('Tracing.tracingComplete', { stream: 'trace-stream' }));
            }
            if (method === 'IO.read') {
              expect(params).toEqual({ handle: 'trace-stream' });
              return { data: TRACE_PAYLOAD, eof: true };
            }
            return {};
          },
          on(method, handler) {
            cdpHandlers[method] = [...(cdpHandlers[method] ?? []), handler];
          },
          off(method, handler) {
            cdpHandlers[method] = (cdpHandlers[method] ?? []).filter((existing) => existing !== handler);
          },
        },
        close: async () => {},
      };
    },
  };
}

describe('collectPageEvidence', () => {
  it('collects runtime, network, and trace evidence from a single page load', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-page-'));
    const tracePath = join(outputDir, 'trace.json');
    const gotoCounter = { count: 0 };
    const sentMethods: string[] = [];

    const evidence = await collectPageEvidence(
      {
        url: 'http://localhost:5173',
        viewport: 'desktop',
        screenshotPath: join(outputDir, 'screenshot.png'),
        tracePath,
      },
      createPageSessionDriver({ gotoCounter, sentMethods }),
    );

    expect(gotoCounter.count).toBe(1); // single page load
    expect(evidence.errors).toEqual([]);
    expect(evidence.runtime?.title).toBe('首页');
    expect(evidence.runtime?.consoleErrors[0].text).toBe(
      'Boom https://<credentials>@example.com/api?token=<redacted>#<redacted>',
    );
    expect(evidence.runtime?.consoleErrors[0].location?.url).toBe('https://example.com/app.js?token=<redacted>');
    expect(evidence.runtime?.pageErrors[0].message).toBe('Crash at https://example.com/app.js?token=<redacted>#<redacted>');
    expect(evidence.runtime?.httpErrors[0].status).toBe(500);
    expect(evidence.network?.summary.totalRequests).toBe(1);
    expect(evidence.network?.summary.totalTransferSize).toBe(716_800);
    expect(evidence.performanceTrace?.longTasks[0].duration).toBe(62);
    expect(sentMethods).toContain('Tracing.start');
    expect(sentMethods).toContain('IO.close');
    expect(JSON.parse(readFileSync(tracePath, 'utf8')).traceEvents).toHaveLength(1);
  });

  it('passes auth state into the browser session and reports target page mismatch', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-page-auth-'));
    const receivedAuthStatePath = { value: undefined as string | undefined };

    const evidence = await collectPageEvidence(
      {
        url: 'http://localhost:5173/admin/users',
        viewport: 'desktop',
        screenshotPath: join(outputDir, 'screenshot.png'),
        tracePath: join(outputDir, 'trace.json'),
        authStatePath: '/tmp/admin-state.json',
      },
      createPageSessionDriver({
        receivedAuthStatePath,
        finalUrl: 'http://localhost:5173/login',
      }),
    );

    expect(receivedAuthStatePath.value).toBe('/tmp/admin-state.json');
    expect(evidence.runtime?.requestedUrl).toBe('http://localhost:5173/admin/users');
    expect(evidence.runtime?.targetUrlMatched).toBe(false);
    expect(evidence.runtime?.targetMismatchReason).toBe('redirected-to-login');
  });

  it('detects hash route redirects as target page mismatches', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-page-hash-auth-'));

    const evidence = await collectPageEvidence(
      {
        url: 'http://localhost:5173/#/admin/users',
        viewport: 'desktop',
        screenshotPath: join(outputDir, 'screenshot.png'),
        tracePath: join(outputDir, 'trace.json'),
        authStatePath: '/tmp/admin-state.json',
      },
      createPageSessionDriver({
        finalUrl: 'http://localhost:5173/#/login',
      }),
    );

    expect(evidence.runtime?.targetUrlMatched).toBe(false);
    expect(evidence.runtime?.targetMismatchReason).toBe('redirected-to-login');
  });

  it('keeps runtime and network evidence when tracing fails', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-page-trace-'));

    const evidence = await collectPageEvidence(
      {
        url: 'http://localhost:5173',
        viewport: 'desktop',
        screenshotPath: join(outputDir, 'screenshot.png'),
        tracePath: join(outputDir, 'trace.json'),
      },
      createPageSessionDriver({ failTracing: true }),
    );

    expect(evidence.performanceTrace).toBeUndefined();
    expect(evidence.errors).toEqual([
      expect.objectContaining({ module: 'performance-trace', message: 'Tracing is unavailable' }),
    ]);
    expect(evidence.runtime?.title).toBe('首页');
    expect(evidence.network?.summary.totalRequests).toBe(1);
  });

  it('records errors for all page modules when the session cannot be created', async () => {
    const failingDriver: PageSessionDriver = {
      async createSession() {
        throw new Error('browser launch failed');
      },
    };

    const evidence = await collectPageEvidence(
      {
        url: 'http://localhost:5173',
        viewport: 'desktop',
        screenshotPath: '/tmp/x.png',
        tracePath: '/tmp/x.json',
      },
      failingDriver,
    );

    expect(evidence.runtime).toBeUndefined();
    expect(evidence.errors.map((error) => error.module).sort()).toEqual([
      'network',
      'performance-trace',
      'runtime',
    ]);
  });
});
