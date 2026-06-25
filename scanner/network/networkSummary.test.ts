import { describe, expect, it } from 'vitest';
import { summarizeNetworkEvidence } from './networkSummary.js';
import type { NetworkRequestEvidence } from '../types.js';

function createRequest(overrides: Partial<NetworkRequestEvidence>): NetworkRequestEvidence {
  return {
    url: 'https://example.com/app.js',
    method: 'GET',
    resourceType: 'script',
    fromDiskCache: false,
    fromMemoryCache: false,
    fromServiceWorker: false,
    transferSize: 0,
    timing: {},
    ...overrides,
  };
}

describe('summarizeNetworkEvidence', () => {
  it('summarizes totals, failures, slow requests, large resources, and cache ratio', () => {
    const requests: NetworkRequestEvidence[] = [
      createRequest({
        url: 'https://example.com/app.js',
        status: 200,
        transferSize: 700 * 1024,
        timing: { totalDurationMs: 1200 },
      }),
      createRequest({
        url: 'https://example.com/logo.png',
        status: 200,
        resourceType: 'image',
        fromDiskCache: true,
        transferSize: 0,
        timing: { totalDurationMs: 35 },
      }),
      createRequest({
        url: 'https://example.com/api/users',
        status: 500,
        statusText: 'Internal Server Error',
        resourceType: 'fetch',
        transferSize: 2048,
        timing: { totalDurationMs: 900 },
      }),
      createRequest({
        url: 'https://example.com/missing.css',
        resourceType: 'stylesheet',
        failureText: 'net::ERR_ABORTED',
        transferSize: 0,
        timing: { totalDurationMs: 10 },
      }),
    ];

    const summary = summarizeNetworkEvidence(requests);

    expect(summary.totalRequests).toBe(4);
    expect(summary.failedRequests).toBe(2);
    expect(summary.totalTransferSize).toBe(718_848);
    expect(summary.cacheHitRatio).toBe(0.25);
    expect(summary.slowRequests).toEqual([
      expect.objectContaining({
        url: 'https://example.com/app.js',
        durationMs: 1200,
      }),
    ]);
    expect(summary.largeResources).toEqual([
      expect.objectContaining({
        url: 'https://example.com/app.js',
        transferSize: 716_800,
      }),
    ]);
  });

  it('returns stable empty summary for missing requests', () => {
    expect(summarizeNetworkEvidence([])).toEqual({
      totalRequests: 0,
      failedRequests: 0,
      totalTransferSize: 0,
      cacheHitRatio: 0,
      slowRequests: [],
      largeResources: [],
    });
  });
});
