import { writeFileSync } from 'node:fs';
import { parseTrace } from '../performance/traceParser.js';
import { createNetworkEvidenceFromCdpEvents, type CdpNetworkEvent } from '../scanners/networkScanner.js';
import { evaluateTargetUrlMatch } from '../scanners/runtimeScanner.js';
import { redactText } from '../security/redactText.js';
import { redactUrl } from '../security/redactUrl.js';
import type {
  ConsoleMessageEvidence,
  HttpErrorEvidence,
  NetworkEvidence,
  PageErrorEvidence,
  PerformanceTraceEvidence,
  RequestFailureEvidence,
  RuntimeEvidence,
  ScanModuleError,
  ScanModuleKey,
  ViewportMode,
} from '../types.js';

export interface PageSessionPage {
  on(eventName: string, handler: (payload: unknown) => void): void;
  goto(url: string, options: { waitUntil: 'domcontentloaded' | 'networkidle'; timeout: number }): Promise<unknown>;
  screenshot(options: { path: string; fullPage: boolean }): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
}

export interface PageSessionCdp {
  send(method: string, params?: unknown): Promise<unknown>;
  on(method: string, handler: (params: unknown) => void): void;
  off?(method: string, handler: (params: unknown) => void): void;
}

export interface PageSession {
  page: PageSessionPage;
  cdp: PageSessionCdp;
  close(): Promise<void>;
}

export interface PageSessionDriver {
  createSession(viewport: ViewportMode, options?: { authStatePath?: string }): Promise<PageSession>;
}

export interface CollectPageEvidenceOptions {
  url: string;
  viewport: ViewportMode;
  screenshotPath: string;
  tracePath: string;
  authStatePath?: string;
}

export interface CollectedPageEvidence {
  runtime?: RuntimeEvidence;
  network?: NetworkEvidence;
  performanceTrace?: PerformanceTraceEvidence;
  errors: ScanModuleError[];
}

const NAVIGATION_TIMEOUT_MS = 60_000;
const TRACE_TIMEOUT_MS = 30_000;
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'loading',
  'blink.user_timing',
  'v8',
];
const NETWORK_EVENT_NAMES = [
  'Network.requestWillBeSent',
  'Network.requestServedFromCache',
  'Network.responseReceived',
  'Network.loadingFinished',
  'Network.loadingFailed',
];

interface ConsolePayload {
  type(): string;
  text(): string;
  location(): ConsoleMessageEvidence['location'];
}

interface RequestPayload {
  url(): string;
  method(): string;
  resourceType(): string;
  failure(): { errorText?: string } | null;
}

interface ResponsePayload {
  url(): string;
  status(): number;
  statusText(): string;
  request(): { method(): string };
}

function isConsolePayload(payload: unknown): payload is ConsolePayload {
  return (
    typeof payload === 'object' && payload !== null && 'type' in payload && 'text' in payload && 'location' in payload
  );
}

function isRequestPayload(payload: unknown): payload is RequestPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'url' in payload &&
    'method' in payload &&
    'resourceType' in payload &&
    'failure' in payload
  );
}

function isResponsePayload(payload: unknown): payload is ResponsePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'url' in payload &&
    'status' in payload &&
    'statusText' in payload &&
    'request' in payload
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function redactLocation(location: ConsoleMessageEvidence['location']): ConsoleMessageEvidence['location'] {
  if (!location?.url) return location;
  try {
    return { ...location, url: redactUrl(location.url) };
  } catch {
    return location;
  }
}

function toModuleError(module: ScanModuleKey, error: unknown): ScanModuleError {
  if (error instanceof Error) {
    return { module, message: error.message, stack: error.stack };
  }
  return { module, message: String(error) };
}

function waitForTracingCompleteEvent(cdp: PageSessionCdp): Promise<string> {
  return new Promise((resolve, reject) => {
    const handler = (params: unknown) => {
      cdp.off?.('Tracing.tracingComplete', handler);
      if (!isRecord(params) || typeof params.stream !== 'string') {
        reject(new Error('Tracing completed without stream handle'));
        return;
      }
      resolve(params.stream);
    };

    cdp.on('Tracing.tracingComplete', handler);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function readTraceStream(cdp: PageSessionCdp, streamHandle: string): Promise<string> {
  let trace = '';
  let eof = false;

  while (!eof) {
    const response = await cdp.send('IO.read', { handle: streamHandle });
    if (!isRecord(response)) {
      throw new Error('Invalid IO.read response');
    }
    trace += typeof response.data === 'string' ? response.data : '';
    eof = response.eof === true;
  }

  await cdp.send('IO.close', { handle: streamHandle });
  return trace;
}

function createPlaywrightPageSessionDriver(): PageSessionDriver {
  return {
    async createSession(viewport, options) {
      const { chromium, devices } = await import('playwright');
      const browser = await chromium.launch();
      const context =
        viewport === 'mobile'
          ? await browser.newContext({ ...devices['iPhone 13'], storageState: options?.authStatePath })
          : await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: options?.authStatePath });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);

      return {
        page,
        cdp,
        close: async () => {
          await browser.close();
        },
      };
    },
  };
}

/**
 * Collect runtime, network, and performance-trace evidence in a single browser
 * session with one page load (instead of launching three separate browsers and
 * loading the page three times). Each evidence module degrades independently:
 * a failure in one finalization step is recorded as a module error without
 * dropping the others. A navigation timeout no longer discards collected
 * evidence — the page may still have loaded enough to be useful.
 */
export async function collectPageEvidence(
  options: CollectPageEvidenceOptions,
  driver: PageSessionDriver = createPlaywrightPageSessionDriver(),
): Promise<CollectedPageEvidence> {
  const result: CollectedPageEvidence = { errors: [] };

  let session: PageSession;
  try {
    session = await driver.createSession(options.viewport, { authStatePath: options.authStatePath });
  } catch (error) {
    result.errors.push(toModuleError('runtime', error));
    result.errors.push(toModuleError('network', error));
    result.errors.push(toModuleError('performance-trace', error));
    return result;
  }

  const consoleErrors: ConsoleMessageEvidence[] = [];
  const pageErrors: PageErrorEvidence[] = [];
  const requestFailures: RequestFailureEvidence[] = [];
  const httpErrors: HttpErrorEvidence[] = [];
  const networkEvents: CdpNetworkEvent[] = [];

  session.page.on('console', (payload) => {
    if (!isConsolePayload(payload) || payload.type() !== 'error') return;
    consoleErrors.push({
      type: payload.type(),
      text: redactText(payload.text()) ?? '',
      location: redactLocation(payload.location()),
    });
  });
  session.page.on('pageerror', (payload) => {
    if (!(payload instanceof Error)) return;
    pageErrors.push({ message: redactText(payload.message) ?? '', stack: redactText(payload.stack) });
  });
  session.page.on('requestfailed', (payload) => {
    if (!isRequestPayload(payload)) return;
    requestFailures.push({
      url: redactUrl(payload.url()),
      method: payload.method(),
      resourceType: payload.resourceType(),
      failureText: redactText(payload.failure()?.errorText),
    });
  });
  session.page.on('response', (payload) => {
    if (!isResponsePayload(payload) || payload.status() < 400) return;
    httpErrors.push({
      url: redactUrl(payload.url()),
      status: payload.status(),
      statusText: payload.statusText(),
      method: payload.request().method(),
    });
  });

  for (const eventName of NETWORK_EVENT_NAMES) {
    session.cdp.on(eventName, (params) => {
      networkEvents.push({ method: eventName, params });
    });
  }

  try {
    try {
      await session.cdp.send('Network.enable');
    } catch (error) {
      result.errors.push(toModuleError('network', error));
    }

    let tracingStarted = false;
    try {
      await session.cdp.send('Tracing.start', {
        categories: TRACE_CATEGORIES.join(','),
        transferMode: 'ReturnAsStream',
      });
      tracingStarted = true;
    } catch (error) {
      result.errors.push(toModuleError('performance-trace', error));
    }

    // Single page load shared by all three evidence modules. A navigation
    // failure (e.g. timeout) is swallowed so collected evidence is still
    // finalized below. Use domcontentloaded — dashboard/polling pages never
    // reach networkidle.
    try {
      await session.page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    } catch {
      // Intentionally ignored: finalize whatever evidence was captured.
    }

    try {
      await session.page.screenshot({ path: options.screenshotPath, fullPage: true });
      const finalUrl = session.page.url();
      const targetMatch = evaluateTargetUrlMatch(options.url, finalUrl);
      result.runtime = {
        requestedUrl: redactUrl(options.url),
        finalUrl: redactUrl(finalUrl),
        title: await session.page.title(),
        screenshotPath: options.screenshotPath,
        targetUrlMatched: targetMatch.matched,
        targetMismatchReason: targetMatch.mismatchReason,
        consoleErrors,
        pageErrors,
        requestFailures,
        httpErrors,
      };
    } catch (error) {
      result.errors.push(toModuleError('runtime', error));
    }

    if (tracingStarted) {
      try {
        const streamPromise = waitForTracingCompleteEvent(session.cdp);
        await session.cdp.send('Tracing.end');
        const streamHandle = await withTimeout(
          streamPromise,
          TRACE_TIMEOUT_MS,
          'Tracing did not complete within timeout',
        );
        const traceText = await readTraceStream(session.cdp, streamHandle);
        writeFileSync(options.tracePath, traceText, 'utf8');
        result.performanceTrace = parseTrace(JSON.parse(traceText), options.tracePath);
      } catch (error) {
        result.errors.push(toModuleError('performance-trace', error));
      }
    }

    try {
      result.network = createNetworkEvidenceFromCdpEvents(networkEvents);
    } catch (error) {
      result.errors.push(toModuleError('network', error));
    }

    return result;
  } finally {
    await session.close();
  }
}
