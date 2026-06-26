// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { discoverRuntimeRoutes } from './runtimeCrawler.js';

describe('discoverRuntimeRoutes', () => {
  it('keeps same-origin navigational links and filters unsafe or external links', async () => {
    const routes = await discoverRuntimeRoutes(
      {
        startUrl: 'https://example.com/admin',
        authStatePath: '.frontscope/auth/admin.json',
      },
      {
        async collectLinks() {
          return [
            { href: 'https://example.com/admin/users', text: 'Users' },
            { href: 'https://example.com/admin/settings?tab=profile', text: 'Settings' },
            { href: 'https://example.com/logout', text: 'Logout' },
            { href: 'https://example.com/admin/users/delete', text: 'Delete user' },
            { href: 'https://cdn.example.com/file.pdf', text: 'Download' },
            { href: 'https://other.example.com/admin', text: 'External' },
            { href: 'mailto:ops@example.com', text: 'Email' },
          ];
        },
      },
    );

    expect(routes).toEqual([
      expect.objectContaining({
        path: '/admin/settings',
        source: 'runtime-link',
        confidence: 'medium',
        reason: 'Runtime same-origin link discovered after auth',
        requiresAuth: true,
      }),
      expect.objectContaining({
        path: '/admin/users',
        source: 'runtime-link',
        confidence: 'medium',
        reason: 'Runtime same-origin link discovered after auth',
        requiresAuth: true,
      }),
    ]);
  });
});
