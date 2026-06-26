import type { RouteCandidate } from './types.js';

export interface RuntimeRouteDiscoveryInput {
  startUrl: string;
  authStatePath?: string;
}

export interface RuntimeLink {
  href: string;
  text?: string;
}

export interface RuntimeRouteDiscoveryDriver {
  collectLinks(input: RuntimeRouteDiscoveryInput): Promise<RuntimeLink[]>;
}

const UNSAFE_PATH_PATTERN = /(?:^|\/)(logout|log-out|signout|sign-out|delete|remove|destroy)(?:\/|$)/i;
const DOWNLOAD_EXTENSION_PATTERN = /\.(zip|pdf|csv|xlsx?|docx?|pptx?)(?:$|\?)/i;

function createPlaywrightRuntimeRouteDriver(): RuntimeRouteDiscoveryDriver {
  return {
    async collectLinks(input) {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext(
          input.authStatePath ? { storageState: input.authStatePath } : undefined,
        );
        const page = await context.newPage();
        await page.goto(input.startUrl, { waitUntil: 'networkidle', timeout: 60_000 });
        return page.$$eval('a[href]', (anchors) =>
          anchors.map((anchor) => ({
            href: (anchor as HTMLAnchorElement).href,
            text: anchor.textContent?.trim() || undefined,
          })),
        );
      } finally {
        await browser.close();
      }
    },
  };
}

function routePathFromUrl(url: URL): string {
  const hashRoute = url.hash.startsWith('#/') ? url.hash.slice(1).split('?')[0] : '';
  return hashRoute || url.pathname || '/';
}

function shouldKeepLink(start: URL, candidate: URL): boolean {
  if (candidate.origin !== start.origin) return false;
  if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') return false;
  if (UNSAFE_PATH_PATTERN.test(candidate.pathname)) return false;
  if (DOWNLOAD_EXTENSION_PATTERN.test(candidate.pathname)) return false;
  return true;
}

function toRouteCandidate(path: string): RouteCandidate {
  return {
    path,
    source: 'runtime-link',
    confidence: 'medium',
    reason: 'Runtime same-origin link discovered after auth',
    requiresAuth: true,
  };
}

export async function discoverRuntimeRoutes(
  input: RuntimeRouteDiscoveryInput,
  driver: RuntimeRouteDiscoveryDriver = createPlaywrightRuntimeRouteDriver(),
): Promise<RouteCandidate[]> {
  const start = new URL(input.startUrl);
  const links = await driver.collectLinks(input);
  const routePaths = new Set<string>();

  for (const link of links) {
    let parsed: URL;
    try {
      parsed = new URL(link.href, input.startUrl);
    } catch {
      continue;
    }

    if (!shouldKeepLink(start, parsed)) continue;
    routePaths.add(routePathFromUrl(parsed));
  }

  return [...routePaths].sort((left, right) => left.localeCompare(right)).map(toRouteCandidate);
}
