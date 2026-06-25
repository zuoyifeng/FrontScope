// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendScanHistory,
  createScanHistoryEntry,
  findPreviousComparableScan,
  readScanHistory,
} from './scanHistory.js';
import type { ScanResult } from '../types.js';

function createResult(id: string, overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    id,
    createdAt: `2026-06-25T10:00:0${id.endsWith('2') ? '2' : '1'}.000Z`,
    scanMode: 'local',
    projectEvidenceEnabled: true,
    input: {
      url: 'http://localhost:5173/dashboard',
      viewport: 'desktop',
      pageName: 'Dashboard',
      projectPath: '/project',
    },
    runtime: {
      finalUrl: 'http://localhost:5173/dashboard',
      title: 'Dashboard',
      screenshotPath: `/tmp/${id}/screenshot.png`,
      consoleErrors: [{ type: 'error', text: 'Boom' }],
      pageErrors: [],
      requestFailures: [],
      httpErrors: [],
    },
    lighthouse: {
      scores: { performance: 70, accessibility: 90, bestPractices: 88, seo: 80 },
      metrics: {},
      audits: [],
    },
    network: {
      requests: [],
      summary: {
        totalRequests: 10,
        failedRequests: 1,
        totalTransferSize: 1024,
        cacheHitRatio: 0.2,
        slowRequests: [],
        largeResources: [],
      },
    },
    errors: [],
    ...overrides,
  };
}

const reportPaths = (id: string) => ({
  scanDir: `/reports/${id}`,
  scanJsonPath: `/reports/${id}/scan.json`,
  reportMarkdownPath: `/reports/${id}/report.md`,
});

describe('scan history', () => {
  it('appends scan entries, deduplicates by id, and keeps newest scans first', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-history-'));
    const first = createScanHistoryEntry(createResult('scan-1'), {
      scanDir: join(outputDir, 'scan-1'),
      scanJsonPath: join(outputDir, 'scan-1', 'scan.json'),
      reportMarkdownPath: join(outputDir, 'scan-1', 'report.md'),
    });
    const second = createScanHistoryEntry(createResult('scan-2', { lighthouse: { ...createResult('scan-2').lighthouse!, scores: { performance: 92, accessibility: 90, bestPractices: 88, seo: 80 } } }), {
      scanDir: join(outputDir, 'scan-2'),
      scanJsonPath: join(outputDir, 'scan-2', 'scan.json'),
      reportMarkdownPath: join(outputDir, 'scan-2', 'report.md'),
    });

    appendScanHistory(outputDir, first);
    const history = appendScanHistory(outputDir, second);
    appendScanHistory(outputDir, second);

    const persisted = JSON.parse(readFileSync(join(outputDir, 'history.json'), 'utf8'));
    expect(history.scans.map((entry) => entry.id)).toEqual(['scan-2', 'scan-1']);
    expect(persisted.scans).toHaveLength(2);
    expect(persisted.scans[0].summary.performanceScore).toBe(92);
    expect(persisted.scans[1].summary.runtimeErrorCount).toBe(1);
    expect(persisted.scans[0].input.scanMode).toBe('local');
  });

  it('finds the latest previous scan for the same scan mode, URL, and page name', () => {
    const previous = createScanHistoryEntry(createResult('scan-1'), reportPaths('scan-1'));
    const current = createScanHistoryEntry(createResult('scan-2'), reportPaths('scan-2'));

    expect(findPreviousComparableScan({ version: 1, updatedAt: current.createdAt, scans: [previous] }, current)?.id).toBe(
      'scan-1',
    );
    expect(
      findPreviousComparableScan(
        {
          version: 1,
          updatedAt: current.createdAt,
          scans: [{ ...previous, input: { ...previous.input, pageName: 'Settings' } }],
        },
        current,
      ),
    ).toBeUndefined();
  });

  it('compares scans with the same mode and URL even when viewport differs', () => {
    const previous = createScanHistoryEntry(createResult('scan-1'), reportPaths('scan-1'));
    const current = createScanHistoryEntry(createResult('scan-2'), reportPaths('scan-2'));

    expect(
      findPreviousComparableScan(
        {
          version: 1,
          updatedAt: current.createdAt,
          scans: [{ ...previous, input: { ...previous.input, viewport: 'mobile' } }],
        },
        current,
      )?.id,
    ).toBe('scan-1');
  });

  it('does not compare local and online scans for the same URL', () => {
    const previous = createScanHistoryEntry(createResult('scan-1'), reportPaths('scan-1'));
    const current = createScanHistoryEntry(
      createResult('scan-2', {
        scanMode: 'online',
        projectEvidenceEnabled: false,
        input: {
          url: 'http://localhost:5173/dashboard',
          pageName: 'Dashboard',
        },
      }),
      reportPaths('scan-2'),
    );

    expect(
      findPreviousComparableScan({ version: 1, updatedAt: current.createdAt, scans: [previous] }, current),
    ).toBeUndefined();
  });

  it('matches legacy history entries without scanMode when mode is inferred from input', () => {
    const previous = createScanHistoryEntry(createResult('scan-1'), reportPaths('scan-1'));
    const legacyPrevious = {
      ...previous,
      input: {
        url: previous.input.url,
        viewport: previous.input.viewport,
        pageName: previous.input.pageName,
        projectPath: previous.input.projectPath,
      },
    };
    const current = createScanHistoryEntry(createResult('scan-2'), reportPaths('scan-2'));

    expect(
      findPreviousComparableScan({ version: 1, updatedAt: current.createdAt, scans: [legacyPrevious] }, current)?.id,
    ).toBe('scan-1');
  });

  it('reads legacy history entries without scanMode', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'frontscope-history-legacy-'));
    const legacyHistory = {
      version: 1,
      updatedAt: '2026-06-25T10:00:00.000Z',
      scans: [
        {
          id: 'scan-legacy',
          createdAt: '2026-06-25T10:00:00.000Z',
          input: {
            url: 'http://localhost:5173/dashboard',
            viewport: 'desktop',
            pageName: 'Dashboard',
            projectPath: '/project',
          },
          scanDir: join(outputDir, 'scan-legacy'),
          scanJsonPath: join(outputDir, 'scan-legacy', 'scan.json'),
          reportMarkdownPath: join(outputDir, 'scan-legacy', 'report.md'),
          summary: { performanceScore: 80 },
        },
      ],
    };

    writeFileSync(join(outputDir, 'history.json'), `${JSON.stringify(legacyHistory, null, 2)}\n`, 'utf8');
    const history = readScanHistory(outputDir);

    expect(history.scans).toHaveLength(1);
    expect(history.scans[0].input.url).toBe('http://localhost:5173/dashboard');
    expect(history.scans[0].input.scanMode).toBeUndefined();
  });
});
