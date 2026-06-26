import type { RouteDiscoveryEvidence } from '../types.js';
import { discoverStaticRoutes } from './discoverRoutes.js';

export function collectRouteDiscoveryEvidence(projectPath: string): RouteDiscoveryEvidence {
  const candidates = discoverStaticRoutes(projectPath);
  if (candidates.length === 0) {
    return {
      status: 'skipped',
      candidates: [],
      skippedReason: '未发现可识别的前端路由文件。',
    };
  }

  return { status: 'ok', candidates };
}
