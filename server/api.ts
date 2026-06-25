import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  assertSafeProfileName,
  listAuthProfiles,
  resolveAuthProfilePath,
  toAuthProfileDisplayMetadata,
} from '../scanner/auth/authProfile.js';
import { saveAuthState } from '../scanner/auth/saveAuthState.js';
import {
  DEFAULT_CONFIG_FILENAME,
  resolveAiConfig,
  resolveSecurityConfig,
  describeAiConfig,
} from '../scanner/ai/config.js';
import { runScan } from '../scanner/scan/runScan.js';

export const INTERACTIVE_AUTH_PROFILE_FLOW = 'interactive-playwright' as const;
export const INTERACTIVE_AUTH_PROFILE_MESSAGE =
  'A non-headless browser opens for manual login; complete SSO, MFA, or captcha in the Playwright inspector before storage state is saved.';

type AuthProfileField = 'profileName' | 'loginUrl' | 'targetUrl';

class AuthProfileRequestError extends Error {
  constructor(
    message: string,
    readonly field: AuthProfileField,
  ) {
    super(message);
    this.name = 'AuthProfileRequestError';
  }
}

function assertValidHttpUrl(value: unknown, field: AuthProfileField): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AuthProfileRequestError(`${field} is required`, field);
  }

  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    throw new AuthProfileRequestError('URL 必须以 http:// 或 https:// 开头', field);
  }

  try {
    new URL(value);
  } catch {
    throw new AuthProfileRequestError('URL is invalid', field);
  }
}

function parseCreateAuthProfileBody(body: unknown): {
  profileName: string;
  loginUrl: string;
  targetUrl?: string;
} {
  if (!body || typeof body !== 'object') {
    throw new AuthProfileRequestError('request body must be a JSON object', 'profileName');
  }

  const record = body as Record<string, unknown>;
  const profileName = record.profileName;

  if (typeof profileName !== 'string') {
    throw new AuthProfileRequestError('profileName is required', 'profileName');
  }

  try {
    assertSafeProfileName(profileName);
  } catch (error) {
    throw new AuthProfileRequestError(
      error instanceof Error ? error.message : 'invalid profile name',
      'profileName',
    );
  }

  assertValidHttpUrl(record.loginUrl, 'loginUrl');

  let targetUrl: string | undefined;
  if (record.targetUrl !== undefined && record.targetUrl !== null && record.targetUrl !== '') {
    assertValidHttpUrl(record.targetUrl, 'targetUrl');
    targetUrl = record.targetUrl;
  }

  return {
    profileName,
    loginUrl: record.loginUrl,
    targetUrl,
  };
}

const security = resolveSecurityConfig();

const app = new Hono();

app.use('/*', cors({ origin: security.allowedOrigins }));

// Require a bearer token for scans when one is configured. This blocks
// arbitrary local webpages from triggering scans via the local API.
app.use('/api/scan', async (c, next) => {
  if (!security.apiToken) {
    return next();
  }

  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (token !== security.apiToken) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  return next();
});

app.post('/api/scan', async (c) => {
  try {
    const body = await c.req.json();
    const {
      scanMode,
      projectPath,
      url,
      viewport,
      pageName,
      outputDir,
      authStatePath,
      enableAi,
      enableMemory,
      memoryReloadRounds,
      ai,
    } = body;

    const resolvedProjectPath = projectPath ? resolve(projectPath) : undefined;
    const configPath = resolvedProjectPath ? join(resolvedProjectPath, DEFAULT_CONFIG_FILENAME) : undefined;

    const result = await runScan(
      {
        scanMode,
        projectPath,
        url,
        viewport: viewport || 'desktop',
        pageName,
        outputDir,
        authStatePath,
        enableAi,
        enableMemory,
        memoryReloadRounds,
        ai,
      },
      { security, configPath },
    );

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

app.get('/api/ai/status', (c) => {
  const config = resolveAiConfig();
  const described = describeAiConfig(config);
  return c.json({
    provider: described.provider,
    model: described.model ?? null,
    baseURL: described.baseURL,
    endpoint: described.endpoint,
    authHeader: described.authHeader,
    apiKeyConfigured: described.apiKeyConfigured,
    ready: described.provider === 'openai' && described.apiKeyConfigured && Boolean(described.model),
  });
});

app.get('/api/auth-profiles', (c) => {
  const profiles = listAuthProfiles();
  return c.json({ profiles });
});

app.post('/api/auth-profiles', async (c) => {
  try {
    const body = await c.req.json();
    const { profileName, loginUrl, targetUrl } = parseCreateAuthProfileBody(body);
    const outputPath = resolveAuthProfilePath(profileName);

    await saveAuthState({
      loginUrl,
      targetUrl,
      outputPath,
    });

    const { authStatePath } = toAuthProfileDisplayMetadata(profileName);
    return c.json({
      profileName,
      authStatePath,
      flow: INTERACTIVE_AUTH_PROFILE_FLOW,
      message: INTERACTIVE_AUTH_PROFILE_MESSAGE,
    });
  } catch (error) {
    if (error instanceof AuthProfileRequestError) {
      return c.json(
        {
          success: false,
          error: error.message,
          field: error.field,
        },
        400,
      );
    }

    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

export default app;
