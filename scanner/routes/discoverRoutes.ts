import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import type { RouteCandidate, RouteCandidateSource } from './types.js';

const NEXT_APP_PAGE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const NEXT_PAGES_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const NUXT_PAGES_EXTENSIONS = new Set(['.vue']);

function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let isDirectory = false;
      try {
        isDirectory = statSync(fullPath).isDirectory();
      } catch {
        continue;
      }

      if (isDirectory) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        walk(fullPath);
        continue;
      }

      files.push(fullPath);
    }
  };

  walk(root);
  return files;
}

function normalizeSegment(segment: string): string | undefined {
  if (!segment || segment === 'index') return undefined;
  if (segment.startsWith('(') && segment.endsWith(')')) return undefined;

  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return `:${segment.slice(5, -2)}*`;
  }
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return `:${segment.slice(4, -1)}*`;
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return `:${segment.slice(1, -1)}`;
  }

  return segment;
}

function routePathFromSegments(segments: string[]): string {
  const normalized = segments
    .map(normalizeSegment)
    .filter((segment): segment is string => Boolean(segment));
  return normalized.length === 0 ? '/' : `/${normalized.join('/')}`;
}

function routeCandidate(
  path: string,
  source: RouteCandidateSource,
  file: string,
  reason: string,
): RouteCandidate {
  return {
    path,
    source,
    confidence: 'high',
    file,
    reason,
  };
}

function discoverNextAppRoutes(projectPath: string): RouteCandidate[] {
  const appDir = join(projectPath, 'app');
  return walkFiles(appDir)
    .filter((filePath) => {
      const extension = extname(filePath);
      return NEXT_APP_PAGE_EXTENSIONS.has(extension) && basename(filePath).startsWith('page.');
    })
    .map((filePath) => {
      const relativeFile = toPosixPath(relative(projectPath, filePath));
      const routeRelative = toPosixPath(relative(appDir, filePath));
      const segments = routeRelative.split('/').slice(0, -1);
      return routeCandidate(
        routePathFromSegments(segments),
        'next-app',
        relativeFile,
        'Next.js app directory page file',
      );
    });
}

function discoverNextPagesRoutes(projectPath: string): RouteCandidate[] {
  const pagesDir = join(projectPath, 'pages');
  return walkFiles(pagesDir)
    .filter((filePath) => {
      const extension = extname(filePath);
      const relativeFile = toPosixPath(relative(pagesDir, filePath));
      return NEXT_PAGES_EXTENSIONS.has(extension) && !relativeFile.startsWith('api/');
    })
    .map((filePath) => {
      const relativeFile = toPosixPath(relative(projectPath, filePath));
      const routeRelative = toPosixPath(relative(pagesDir, filePath));
      const extension = extname(routeRelative);
      const withoutExtension = routeRelative.slice(0, -extension.length);
      return routeCandidate(
        routePathFromSegments(withoutExtension.split('/')),
        'next-pages',
        relativeFile,
        'Next.js pages directory route file',
      );
    });
}

function discoverNuxtPagesRoutes(projectPath: string): RouteCandidate[] {
  const pagesDir = join(projectPath, 'pages');
  return walkFiles(pagesDir)
    .filter((filePath) => NUXT_PAGES_EXTENSIONS.has(extname(filePath)))
    .map((filePath) => {
      const relativeFile = toPosixPath(relative(projectPath, filePath));
      const routeRelative = toPosixPath(relative(pagesDir, filePath));
      const extension = extname(routeRelative);
      const withoutExtension = routeRelative.slice(0, -extension.length);
      return routeCandidate(
        routePathFromSegments(withoutExtension.split('/')),
        'nuxt-pages',
        relativeFile,
        'Nuxt pages directory Vue file',
      );
    });
}

export function discoverStaticRoutes(projectPath: string): RouteCandidate[] {
  const routes = [
    ...discoverNextAppRoutes(projectPath),
    ...discoverNextPagesRoutes(projectPath),
    ...discoverNuxtPagesRoutes(projectPath),
  ];

  return routes.sort((left, right) => {
    if (left.path !== right.path) return left.path.localeCompare(right.path);
    return (left.file ?? '').localeCompare(right.file ?? '');
  });
}
