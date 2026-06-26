// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverStaticRoutes } from './discoverRoutes.js';

function touch(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, 'export default function Page() { return null; }', 'utf8');
}

describe('discoverStaticRoutes', () => {
  it('extracts Next.js app routes from page files', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-next-app-routes-'));
    touch(join(root, 'app', 'page.tsx'));
    touch(join(root, 'app', 'dashboard', 'page.tsx'));
    touch(join(root, 'app', '(marketing)', 'pricing', 'page.tsx'));
    touch(join(root, 'app', 'users', '[id]', 'page.tsx'));
    touch(join(root, 'app', 'dashboard', 'layout.tsx'));

    const routes = discoverStaticRoutes(root);

    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/',
          source: 'next-app',
          confidence: 'high',
          file: 'app/page.tsx',
        }),
        expect.objectContaining({
          path: '/dashboard',
          source: 'next-app',
          confidence: 'high',
          file: 'app/dashboard/page.tsx',
        }),
        expect.objectContaining({
          path: '/pricing',
          source: 'next-app',
          confidence: 'high',
          file: 'app/(marketing)/pricing/page.tsx',
        }),
        expect.objectContaining({
          path: '/users/:id',
          source: 'next-app',
          confidence: 'high',
          file: 'app/users/[id]/page.tsx',
        }),
      ]),
    );
    expect(routes.map((route) => route.file)).not.toContain('app/dashboard/layout.tsx');
  });

  it('extracts Next.js pages routes and excludes API routes', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-next-pages-routes-'));
    touch(join(root, 'pages', 'index.tsx'));
    touch(join(root, 'pages', 'admin', 'settings.tsx'));
    touch(join(root, 'pages', 'blog', '[slug].tsx'));
    touch(join(root, 'pages', 'api', 'health.ts'));

    const routes = discoverStaticRoutes(root);

    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/',
          source: 'next-pages',
          file: 'pages/index.tsx',
        }),
        expect.objectContaining({
          path: '/admin/settings',
          source: 'next-pages',
          file: 'pages/admin/settings.tsx',
        }),
        expect.objectContaining({
          path: '/blog/:slug',
          source: 'next-pages',
          file: 'pages/blog/[slug].tsx',
        }),
      ]),
    );
    expect(routes.map((route) => route.path)).not.toContain('/api/health');
  });

  it('extracts Nuxt pages routes from Vue files', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontscope-nuxt-pages-routes-'));
    touch(join(root, 'pages', 'index.vue'));
    touch(join(root, 'pages', 'admin', 'users.vue'));
    touch(join(root, 'pages', 'users', '[id].vue'));

    const routes = discoverStaticRoutes(root);

    expect(routes).toEqual([
      expect.objectContaining({
        path: '/',
        source: 'nuxt-pages',
        confidence: 'high',
        file: 'pages/index.vue',
      }),
      expect.objectContaining({
        path: '/admin/users',
        source: 'nuxt-pages',
        confidence: 'high',
        file: 'pages/admin/users.vue',
      }),
      expect.objectContaining({
        path: '/users/:id',
        source: 'nuxt-pages',
        confidence: 'high',
        file: 'pages/users/[id].vue',
      }),
    ]);
  });
});
