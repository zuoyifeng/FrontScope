// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { verifyAuthProfile } from './verifyAuthProfile.js';

describe('verifyAuthProfile', () => {
  it('marks a profile valid when the final URL matches the target route', async () => {
    const result = await verifyAuthProfile(
      {
        authStatePath: '.frontscope/auth/admin.json',
        targetUrl: 'https://internal.example/admin',
      },
      {
        async open() {
          return {
            finalUrl: 'https://internal.example/admin',
            title: 'Admin',
            status: 200,
          };
        },
      },
    );

    expect(result).toEqual({
      status: 'valid',
      finalUrl: 'https://internal.example/admin',
      title: 'Admin',
    });
  });

  it('marks a profile invalid when the browser lands on login', async () => {
    const result = await verifyAuthProfile(
      {
        authStatePath: '.frontscope/auth/admin.json',
        targetUrl: 'https://internal.example/admin',
      },
      {
        async open() {
          return {
            finalUrl: 'https://internal.example/login',
            title: 'Login',
            status: 200,
          };
        },
      },
    );

    expect(result.status).toBe('login-redirect');
    expect(result.finalUrl).toBe('https://internal.example/login');
  });

  it('marks a profile unauthorized when the target responds with 401 or 403', async () => {
    const result = await verifyAuthProfile(
      {
        authStatePath: '.frontscope/auth/admin.json',
        targetUrl: 'https://internal.example/admin',
      },
      {
        async open() {
          return {
            finalUrl: 'https://internal.example/admin',
            title: 'Forbidden',
            status: 403,
          };
        },
      },
    );

    expect(result.status).toBe('unauthorized');
    expect(result.message).toBe('目标页面返回 403，登录态存在但权限不足或已失效。');
  });
});
