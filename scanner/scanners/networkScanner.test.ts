import { describe, expect, it } from 'vitest';
import { createNetworkEvidenceFromCdpEvents } from './networkScanner.js';

describe('createNetworkEvidenceFromCdpEvents', () => {
  it('joins CDP network events into request evidence without storing response bodies', () => {
    const evidence = createNetworkEvidenceFromCdpEvents([
      {
        method: 'Network.requestWillBeSent',
        params: {
          requestId: '1',
          timestamp: 100,
          type: 'Script',
          initiator: { type: 'parser' },
          request: {
            url: 'https://example.com/app.js',
            method: 'GET',
            initialPriority: 'High',
          },
        },
      },
      {
        method: 'Network.responseReceived',
        params: {
          requestId: '1',
          timestamp: 100.35,
          type: 'Script',
          response: {
            url: 'https://example.com/app.js',
            status: 200,
            statusText: 'OK',
            mimeType: 'application/javascript',
            encodedDataLength: 1024,
            fromDiskCache: true,
            fromServiceWorker: false,
            timing: {
              requestTime: 100,
              dnsStart: 2,
              dnsEnd: 6,
              connectStart: 6,
              connectEnd: 12,
              sslStart: 8,
              sslEnd: 12,
              sendStart: 14,
              sendEnd: 15,
              receiveHeadersEnd: 220,
            },
          },
        },
      },
      {
        method: 'Network.loadingFinished',
        params: {
          requestId: '1',
          timestamp: 100.7,
          encodedDataLength: 2048,
        },
      },
      {
        method: 'Network.requestWillBeSent',
        params: {
          requestId: '2',
          timestamp: 101,
          type: 'Fetch',
          request: {
            url: 'https://example.com/api/users',
            method: 'POST',
            postData: '{"password":"should-not-be-kept"}',
          },
        },
      },
      {
        method: 'Network.loadingFailed',
        params: {
          requestId: '2',
          timestamp: 101.2,
          errorText: 'net::ERR_FAILED',
        },
      },
    ]);

    expect(evidence.requests).toEqual([
      expect.objectContaining({
        url: 'https://example.com/app.js',
        method: 'GET',
        resourceType: 'script',
        status: 200,
        mimeType: 'application/javascript',
        priority: 'High',
        initiatorType: 'parser',
        fromDiskCache: true,
        transferSize: 2048,
        timing: expect.objectContaining({
          totalDurationMs: 700,
          dnsMs: 4,
          connectMs: 6,
          sslMs: 4,
          requestMs: 1,
          ttfbMs: 220,
          downloadMs: 350,
        }),
      }),
      expect.objectContaining({
        url: 'https://example.com/api/users',
        method: 'POST',
        resourceType: 'fetch',
        failureText: 'net::ERR_FAILED',
        transferSize: 0,
        timing: expect.objectContaining({
          totalDurationMs: 200,
        }),
      }),
    ]);
    expect(JSON.stringify(evidence)).not.toContain('should-not-be-kept');
    expect(evidence.summary.failedRequests).toBe(1);
  });
});
