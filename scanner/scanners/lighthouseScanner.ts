import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { LighthouseAuditEvidence, LighthouseEvidence, ViewportMode } from '../types.js';

export interface LighthouseScanOptions {
  url: string;
  viewport: ViewportMode;
}

function scoreToPercent(score: number | null | undefined): number | null {
  return typeof score === 'number' ? Math.round(score * 100) : null;
}

function readDisplayValue(audits: Record<string, { displayValue?: string }>, id: string): string | undefined {
  return audits[id]?.displayValue;
}

export interface ChromePathResolverOptions {
  playwrightExecutablePath?: () => string | undefined;
  fallbackPaths?: string[];
  exists?: (path: string) => boolean;
}

export function resolveChromePath(options: ChromePathResolverOptions = {}): string | undefined {
  const exists = options.exists ?? existsSync;
  const playwrightPath = options.playwrightExecutablePath?.();

  if (playwrightPath && exists(playwrightPath)) {
    return playwrightPath;
  }

  return options.fallbackPaths?.find((path) => exists(path));
}

function getKnownChromePaths(homeDir = process.env.HOME || ''): string[] {
  return [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    join(homeDir, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((path): path is string => Boolean(path));
}

async function findChromePath(): Promise<string | undefined> {
  let playwrightExecutablePath: (() => string | undefined) | undefined;

  try {
    const { chromium } = await import('playwright');
    playwrightExecutablePath = () => chromium.executablePath();
  } catch {
    playwrightExecutablePath = undefined;
  }

  return resolveChromePath({
    playwrightExecutablePath,
    fallbackPaths: getKnownChromePaths(),
  });
}

export async function scanLighthouse(options: LighthouseScanOptions): Promise<LighthouseEvidence> {
  const chromePath = await findChromePath();

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless'],
    chromePath,
  });

  try {
    const runnerResult = await lighthouse(options.url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      formFactor: options.viewport,
      screenEmulation:
        options.viewport === 'mobile'
          ? undefined
          : {
              mobile: false,
              width: 1440,
              height: 900,
              deviceScaleFactor: 1,
              disabled: false,
            },
    });

    if (!runnerResult?.lhr) {
      throw new Error('Lighthouse did not return a report');
    }

    const lhr = runnerResult.lhr;
    const audits = lhr.audits;

    const auditEvidence: LighthouseAuditEvidence[] = Object.values(audits)
      .filter((audit) => audit.score !== null && typeof audit.score === 'number' && audit.score < 0.9)
      .slice(0, 15)
      .map((audit) => ({
        id: audit.id,
        title: audit.title,
        score: audit.score,
        displayValue: audit.displayValue,
        description: audit.description,
      }));

    return {
      scores: {
        performance: scoreToPercent(lhr.categories.performance?.score),
        accessibility: scoreToPercent(lhr.categories.accessibility?.score),
        bestPractices: scoreToPercent(lhr.categories['best-practices']?.score),
        seo: scoreToPercent(lhr.categories.seo?.score),
      },
      metrics: {
        largestContentfulPaint: readDisplayValue(audits, 'largest-contentful-paint'),
        cumulativeLayoutShift: readDisplayValue(audits, 'cumulative-layout-shift'),
        totalBlockingTime: readDisplayValue(audits, 'total-blocking-time'),
        speedIndex: readDisplayValue(audits, 'speed-index'),
      },
      audits: auditEvidence,
    };
  } finally {
    await chrome.kill();
  }
}
