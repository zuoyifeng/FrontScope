import { summarizeNetworkEvidence } from '../network/networkSummary.js';
import { redactUrl } from '../security/redactUrl.js';
import type { NetworkEvidence, NetworkRequestEvidence, NetworkTimingEvidence } from '../types.js';

export interface CdpNetworkEvent {
  method: string;
  params: unknown;
}

interface RequestRecord {
  requestId: string;
  url: string;
  method: string;
  resourceType: string;
  priority?: string;
  initiatorType?: string;
  startTime?: number;
  responseTime?: number;
  endTime?: number;
  status?: number;
  statusText?: string;
  mimeType?: string;
  fromDiskCache: boolean;
  fromMemoryCache: boolean;
  fromServiceWorker: boolean;
  transferSize: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  responseTiming?: Record<string, number>;
  failureText?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getObject(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function toResourceType(type: string | undefined): string {
  return type ? type.toLowerCase() : 'unknown';
}

function durationMs(startTime?: number, endTime?: number): number | undefined {
  if (typeof startTime !== 'number' || typeof endTime !== 'number') return undefined;
  return Math.max(0, Math.round((endTime - startTime) * 1000));
}

function relativeDurationMs(start?: number, end?: number): number | undefined {
  if (typeof start !== 'number' || typeof end !== 'number' || start < 0 || end < 0 || end < start) {
    return undefined;
  }

  return Math.round(end - start);
}

function createTiming(record: RequestRecord): NetworkTimingEvidence {
  const timing = record.responseTiming;
  const totalDurationMs = durationMs(record.startTime, record.endTime);
  const downloadMs = durationMs(record.responseTime, record.endTime);

  return {
    startTime: record.startTime,
    endTime: record.endTime,
    totalDurationMs,
    dnsMs: timing ? relativeDurationMs(timing.dnsStart, timing.dnsEnd) : undefined,
    connectMs: timing ? relativeDurationMs(timing.connectStart, timing.connectEnd) : undefined,
    sslMs: timing ? relativeDurationMs(timing.sslStart, timing.sslEnd) : undefined,
    requestMs: timing ? relativeDurationMs(timing.sendStart, timing.sendEnd) : undefined,
    ttfbMs: timing ? relativeDurationMs(0, timing.receiveHeadersEnd) : undefined,
    downloadMs,
  };
}

function toRequestEvidence(record: RequestRecord): NetworkRequestEvidence {
  return {
    url: redactUrl(record.url),
    method: record.method,
    resourceType: record.resourceType,
    status: record.status,
    statusText: record.statusText,
    mimeType: record.mimeType,
    priority: record.priority,
    initiatorType: record.initiatorType,
    fromDiskCache: record.fromDiskCache,
    fromMemoryCache: record.fromMemoryCache,
    fromServiceWorker: record.fromServiceWorker,
    transferSize: record.transferSize,
    encodedBodySize: record.encodedBodySize,
    decodedBodySize: record.decodedBodySize,
    timing: createTiming(record),
    failureText: record.failureText,
  };
}

export function createNetworkEvidenceFromCdpEvents(events: CdpNetworkEvent[]): NetworkEvidence {
  const records = new Map<string, RequestRecord>();

  for (const event of events) {
    if (!isRecord(event.params)) continue;

    const requestId = getString(event.params, 'requestId');
    if (!requestId) continue;

    if (event.method === 'Network.requestWillBeSent') {
      const request = getObject(event.params, 'request');
      if (!request) continue;

      const url = getString(request, 'url');
      if (!url) continue;

      const initiator = getObject(event.params, 'initiator');
      records.set(requestId, {
        requestId,
        url,
        method: getString(request, 'method') ?? 'GET',
        resourceType: toResourceType(getString(event.params, 'type')),
        priority: getString(request, 'initialPriority'),
        initiatorType: initiator ? getString(initiator, 'type') : undefined,
        startTime: getNumber(event.params, 'timestamp'),
        fromDiskCache: false,
        fromMemoryCache: false,
        fromServiceWorker: false,
        transferSize: 0,
      });
      continue;
    }

    const record = records.get(requestId);
    if (!record) continue;

    if (event.method === 'Network.requestServedFromCache') {
      record.fromMemoryCache = true;
      continue;
    }

    if (event.method === 'Network.responseReceived') {
      const response = getObject(event.params, 'response');
      if (!response) continue;

      record.responseTime = getNumber(event.params, 'timestamp');
      record.resourceType = toResourceType(getString(event.params, 'type') ?? record.resourceType);
      record.status = getNumber(response, 'status');
      record.statusText = getString(response, 'statusText');
      record.mimeType = getString(response, 'mimeType');
      record.fromDiskCache = getBoolean(response, 'fromDiskCache');
      record.fromServiceWorker = getBoolean(response, 'fromServiceWorker');
      record.fromMemoryCache = record.fromMemoryCache || getBoolean(response, 'fromPrefetchCache');
      record.encodedBodySize = getNumber(response, 'encodedDataLength');
      record.transferSize = record.encodedBodySize ?? record.transferSize;

      const timing = getObject(response, 'timing');
      if (timing) {
        record.responseTiming = Object.fromEntries(
          Object.entries(timing).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
        );
      }
      continue;
    }

    if (event.method === 'Network.loadingFinished') {
      record.endTime = getNumber(event.params, 'timestamp');
      record.transferSize = getNumber(event.params, 'encodedDataLength') ?? record.transferSize;
      record.encodedBodySize = record.transferSize || record.encodedBodySize;
      continue;
    }

    if (event.method === 'Network.loadingFailed') {
      record.endTime = getNumber(event.params, 'timestamp');
      record.failureText = getString(event.params, 'errorText');
    }
  }

  const requests = [...records.values()]
    .filter((record) => record.url)
    .sort((left, right) => (left.startTime ?? 0) - (right.startTime ?? 0))
    .map(toRequestEvidence);

  return {
    requests,
    summary: summarizeNetworkEvidence(requests),
  };
}
