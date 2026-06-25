import type { NetworkRequestEvidence, NetworkRequestSummaryItem, NetworkSummaryEvidence } from '../types.js';

const SLOW_REQUEST_THRESHOLD_MS = 1000;
const LARGE_RESOURCE_THRESHOLD_BYTES = 500 * 1024;

function isFailedRequest(request: NetworkRequestEvidence): boolean {
  return Boolean(request.failureText) || (typeof request.status === 'number' && request.status >= 400);
}

function isCacheHit(request: NetworkRequestEvidence): boolean {
  return request.fromDiskCache || request.fromMemoryCache || request.fromServiceWorker;
}

function toSummaryItem(request: NetworkRequestEvidence): NetworkRequestSummaryItem {
  return {
    url: request.url,
    method: request.method,
    resourceType: request.resourceType,
    status: request.status,
    transferSize: request.transferSize,
    durationMs: request.timing.totalDurationMs,
    fromCache: isCacheHit(request),
  };
}

export function summarizeNetworkEvidence(requests: NetworkRequestEvidence[]): NetworkSummaryEvidence {
  if (requests.length === 0) {
    return {
      totalRequests: 0,
      failedRequests: 0,
      totalTransferSize: 0,
      cacheHitRatio: 0,
      slowRequests: [],
      largeResources: [],
    };
  }

  const cacheHits = requests.filter(isCacheHit).length;
  const slowRequests = requests
    .filter((request) => (request.timing.totalDurationMs ?? 0) > SLOW_REQUEST_THRESHOLD_MS)
    .sort((left, right) => (right.timing.totalDurationMs ?? 0) - (left.timing.totalDurationMs ?? 0))
    .slice(0, 5)
    .map(toSummaryItem);
  const largeResources = requests
    .filter((request) => request.transferSize > LARGE_RESOURCE_THRESHOLD_BYTES)
    .sort((left, right) => right.transferSize - left.transferSize)
    .slice(0, 5)
    .map(toSummaryItem);

  return {
    totalRequests: requests.length,
    failedRequests: requests.filter(isFailedRequest).length,
    totalTransferSize: requests.reduce((total, request) => total + request.transferSize, 0),
    cacheHitRatio: Number((cacheHits / requests.length).toFixed(4)),
    slowRequests,
    largeResources,
  };
}
