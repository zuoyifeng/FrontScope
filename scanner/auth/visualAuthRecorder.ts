import { randomUUID } from 'node:crypto';
import { evaluateTargetUrlMatch } from '../scanners/runtimeScanner.js';
import type { AuthProfileVerificationStatus } from './authProfile.js';

const NAVIGATION_TIMEOUT_MS = 60_000;

export interface VisualAuthRecordingInput {
  profileName: string;
  loginUrl: string;
  targetUrl: string;
}

export interface VisualAuthRecordingResult {
  status: AuthProfileVerificationStatus;
  finalUrl?: string;
  title?: string;
  message?: string;
}

export interface VisualAuthRecordingPage {
  goto(url: string, options: { waitUntil: 'domcontentloaded' | 'networkidle'; timeout: number }): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
}

export interface VisualAuthRecordingHandle {
  page: VisualAuthRecordingPage;
  saveStorageState(path: string): Promise<void>;
  close(): Promise<void>;
}

export interface VisualAuthRecorderDriver {
  open(): Promise<VisualAuthRecordingHandle>;
}

export interface VisualAuthRecordingSession {
  id: string;
  profileName: string;
  loginUrl: string;
  targetUrl: string;
  startedAt: string;
  complete(outputPath: string): Promise<VisualAuthRecordingResult>;
  cancel(): Promise<void>;
}

function createPlaywrightRecorderDriver(): VisualAuthRecorderDriver {
  return {
    async open() {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: false });
      const context = await browser.newContext();
      const page = await context.newPage();

      return {
        page,
        saveStorageState: async (path) => {
          await context.storageState({ path });
        },
        close: () => browser.close(),
      };
    },
  };
}

export async function startVisualAuthRecording(
  input: VisualAuthRecordingInput,
  driver: VisualAuthRecorderDriver = createPlaywrightRecorderDriver(),
): Promise<VisualAuthRecordingSession> {
  const handle = await driver.open();
  let closed = false;

  const closeOnce = async () => {
    if (closed) return;
    closed = true;
    await handle.close();
  };

  await handle.page.goto(input.loginUrl, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  return {
    id: randomUUID(),
    profileName: input.profileName,
    loginUrl: input.loginUrl,
    targetUrl: input.targetUrl,
    startedAt: new Date().toISOString(),
    async complete(outputPath) {
      try {
        try {
          await handle.page.goto(input.targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: NAVIGATION_TIMEOUT_MS,
          });
        } catch (navigationError) {
          const finalUrl = handle.page.url();
          if (!finalUrl || finalUrl === 'about:blank') {
            const message =
              navigationError instanceof Error ? navigationError.message : String(navigationError);
            return {
              status: 'error',
              message: `无法打开目标页面：${message}`,
            };
          }
        }

        const finalUrl = handle.page.url();
        const title = await handle.page.title();
        const targetMatch = evaluateTargetUrlMatch(input.targetUrl, finalUrl);

        if (!targetMatch.matched) {
          return {
            status: targetMatch.mismatchReason === 'redirected-to-login' ? 'login-redirect' : 'error',
            finalUrl,
            title,
            message:
              targetMatch.mismatchReason === 'redirected-to-login'
                ? '目标页面仍跳转到登录页，请确认已完成登录后重试。'
                : '最终页面与目标页面不一致，未保存登录态。',
          };
        }

        await handle.saveStorageState(outputPath);
        return { status: 'valid', finalUrl, title };
      } catch (error) {
        return {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
      } finally {
        await closeOnce();
      }
    },
    cancel: closeOnce,
  };
}
