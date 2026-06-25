import { ensureAuthProfileParentDirectory } from './authProfile.js';

export interface SaveAuthStateOptions {
  loginUrl: string;
  targetUrl?: string;
  outputPath: string;
}

export interface AuthStateDriver {
  save(options: SaveAuthStateOptions): Promise<void>;
}

function createPlaywrightAuthStateDriver(): AuthStateDriver {
  return {
    async save(options) {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: false });
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(options.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.pause();
        if (options.targetUrl) {
          await page.goto(options.targetUrl, { waitUntil: 'networkidle', timeout: 60_000 });
        }
        await context.storageState({ path: options.outputPath });
      } finally {
        await browser.close();
      }
    },
  };
}

export async function saveAuthState(
  options: SaveAuthStateOptions,
  driver: AuthStateDriver = createPlaywrightAuthStateDriver(),
): Promise<void> {
  ensureAuthProfileParentDirectory(options.outputPath);
  await driver.save(options);
}
