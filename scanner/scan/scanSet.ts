import type { ScanInput, ScanResult } from '../types.js';

export interface ScanSetInput {
  baseUrl: string;
  routes: string[];
  scanMode: 'local' | 'online';
  projectPath?: string;
  authStatePath?: string;
}

export interface ScanSetRouteResult {
  url: string;
  result: ScanResult;
}

export interface ScanSetResult {
  routes: ScanSetRouteResult[];
  summary: {
    routeCount: number;
    failedRoutes: number;
  };
}

function routeUrl(baseUrl: string, route: string): string {
  return new URL(route, baseUrl).toString();
}

export async function runScanSet(
  input: ScanSetInput,
  runOne: (input: ScanInput) => Promise<ScanResult>,
): Promise<ScanSetResult> {
  const routes: ScanSetRouteResult[] = [];
  for (const route of input.routes) {
    const url = routeUrl(input.baseUrl, route);
    const result = await runOne({
      scanMode: input.scanMode,
      url,
      projectPath: input.projectPath,
      authStatePath: input.authStatePath,
    });
    routes.push({ url, result });
  }

  return {
    routes,
    summary: {
      routeCount: routes.length,
      failedRoutes: routes.filter((route) => route.result.errors.length > 0).length,
    },
  };
}
