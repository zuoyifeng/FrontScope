import { evaluateTargetUrlMatch } from '../scanners/runtimeScanner.js';
import type { AuthProfileVerificationStatus } from './authProfile.js';

export interface VerifyAuthProfileInput {
  authStatePath: string;
  targetUrl: string;
}

export interface AuthProfileVerificationResult {
  status: AuthProfileVerificationStatus;
  finalUrl?: string;
  title?: string;
  message?: string;
}

export interface AuthProfileVerifyDriver {
  open(input: VerifyAuthProfileInput): Promise<{
    finalUrl: string;
    title: string;
    status?: number;
  }>;
}

function createPlaywrightVerifyDriver(): AuthProfileVerifyDriver {
  return {
    async open(input) {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ storageState: input.authStatePath });
        const page = await context.newPage();
        const response = await page.goto(input.targetUrl, {
          waitUntil: 'networkidle',
          timeout: 60_000,
        });

        return {
          finalUrl: page.url(),
          title: await page.title(),
          status: response?.status(),
        };
      } finally {
        await browser.close();
      }
    },
  };
}

function statusMessage(status: number): string {
  return `目标页面返回 ${status}，登录态存在但权限不足或已失效。`;
}

export async function verifyAuthProfile(
  input: VerifyAuthProfileInput,
  driver: AuthProfileVerifyDriver = createPlaywrightVerifyDriver(),
): Promise<AuthProfileVerificationResult> {
  try {
    const opened = await driver.open(input);
    if (opened.status === 401 || opened.status === 403) {
      return {
        status: 'unauthorized',
        finalUrl: opened.finalUrl,
        title: opened.title,
        message: statusMessage(opened.status),
      };
    }

    const targetMatch = evaluateTargetUrlMatch(input.targetUrl, opened.finalUrl);
    if (targetMatch.matched) {
      return {
        status: 'valid',
        finalUrl: opened.finalUrl,
        title: opened.title,
      };
    }

    if (targetMatch.mismatchReason === 'redirected-to-login') {
      return {
        status: 'login-redirect',
        finalUrl: opened.finalUrl,
        title: opened.title,
        message: '目标页面被重定向到登录页，请刷新登录态后重试。',
      };
    }

    return {
      status: 'error',
      finalUrl: opened.finalUrl,
      title: opened.title,
      message: '最终页面与目标页面不一致。',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
