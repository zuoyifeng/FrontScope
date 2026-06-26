import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  assertSafeProfileName,
  listAuthProfiles,
  readAuthProfileMetadata,
  resolveAuthProfilePath,
  toAuthProfileDisplayMetadata,
  writeAuthProfileMetadata,
} from '../scanner/auth/authProfile.js';
import { saveAuthState } from '../scanner/auth/saveAuthState.js';
import { verifyAuthProfile } from '../scanner/auth/verifyAuthProfile.js';
import { startVisualAuthRecording, type VisualAuthRecordingSession } from '../scanner/auth/visualAuthRecorder.js';
import {
  resolveAiConfig,
  resolveSecurityConfig,
  describeAiConfig,
} from '../scanner/ai/config.js';
import { runAiConnectionTest } from '../scanner/ai/testAiConnection.js';
import { inspectLocalProject } from '../scanner/localProject/projectIntake.js';
import { runScan } from '../scanner/scan/runScan.js';
import { validateInput } from '../scanner/scan/validateInput.js';
import { assertPathWithinRoots } from '../scanner/security/guards.js';
import {
  completeScanProgress,
  failScanProgress,
  getScanProgress,
  initScanProgress,
  updateScanProgress,
} from './scanProgressStore.js';

export const INTERACTIVE_AUTH_PROFILE_FLOW = 'interactive-playwright' as const;
export const INTERACTIVE_AUTH_PROFILE_MESSAGE =
  'A non-headless browser opens for manual login; complete SSO, MFA, or captcha in the Playwright inspector before storage state is saved.';

const VISUAL_AUTH_RECORDING_MESSAGE =
  '浏览器已打开，请在浏览器中完成登录，然后回到 FrontScope 点击验证并保存。';

const activeAuthRecordings = new Map<string, VisualAuthRecordingSession>();

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

function parseVerifyAuthProfileBody(body: unknown): { targetUrl: string } {
  if (!body || typeof body !== 'object') {
    throw new AuthProfileRequestError('request body must be a JSON object', 'targetUrl');
  }

  const record = body as Record<string, unknown>;
  assertValidHttpUrl(record.targetUrl, 'targetUrl');
  return { targetUrl: record.targetUrl };
}

const security = resolveSecurityConfig();

const app = new Hono();

app.use('/*', cors({ origin: security.allowedOrigins }));

// Require a bearer token for sensitive local actions when one is configured.
// This blocks arbitrary local webpages from triggering scans, auth-state writes,
// or AI provider calls through the local API.
const requireBearerToken = async (c: Parameters<Parameters<typeof app.use>[1]>[0], next: Parameters<Parameters<typeof app.use>[1]>[1]) => {
  if (!security.apiToken) {
    return next();
  }

  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (token !== security.apiToken) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  return next();
};

app.use('/api/scan', requireBearerToken);
app.use('/api/scan/*', requireBearerToken);
app.use('/api/ai/test', requireBearerToken);
app.use('/api/auth-profiles', requireBearerToken);
app.use('/api/auth-profiles/*', requireBearerToken);
app.use('/api/local-projects/inspect', requireBearerToken);

app.post('/api/scan', async (c) => {
  try {
    const body = await c.req.json();
    const input = validateInput(body);
    const progressId = randomUUID();
    initScanProgress(progressId, input);

    void runScan(body, {
      security,
      onProgress: (update) => {
        updateScanProgress(progressId, update);
      },
    })
      .then((result) => {
        completeScanProgress(progressId, result);
      })
      .catch((error) => {
        failScanProgress(progressId, error instanceof Error ? error.message : 'Unknown error');
      });

    return c.json({
      success: true,
      data: { progressId },
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

app.get('/api/scan/progress/:progressId', (c) => {
  const progress = getScanProgress(c.req.param('progressId'));
  if (!progress) {
    return c.json({ success: false, error: '扫描进度不存在或已过期' }, 404);
  }

  return c.json({
    success: true,
    data: {
      progressId: progress.progressId,
      status: progress.status,
      percent: progress.percent,
      currentStepKey: progress.currentStepKey,
      currentStepLabel: progress.currentStepLabel,
      steps: progress.steps,
      startedAt: progress.startedAt,
      updatedAt: progress.updatedAt,
      error: progress.error,
      result: progress.result,
    },
  });
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

app.post('/api/ai/test', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const projectPath = typeof body?.projectPath === 'string' ? body.projectPath : undefined;
    const result = await runAiConnectionTest({ projectPath });
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        success: false,
        provider: 'unknown',
        apiKeyConfigured: false,
        durationMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
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
    writeAuthProfileMetadata({
      profileName,
      authStatePath,
      loginUrl,
      targetOrigin: new URL(targetUrl ?? loginUrl).origin,
      createdAt: new Date().toISOString(),
      verification: { status: 'unknown' },
    });

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

app.post('/api/local-projects/inspect', async (c) => {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || typeof body.projectPath !== 'string' || !body.projectPath.trim()) {
      return c.json({ success: false, error: 'projectPath is required' }, 400);
    }

    const projectPath = body.projectPath.trim();
    assertPathWithinRoots(projectPath, security.allowedProjectRoots, '项目路径');
    if (!existsSync(join(projectPath, 'package.json'))) {
      return c.json({ success: false, error: '未找到 package.json' }, 400);
    }

    const data = inspectLocalProject(projectPath);
    return c.json({ success: true, data });
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

app.post('/api/auth-profiles/recordings', async (c) => {
  try {
    const body = await c.req.json();
    const { profileName, loginUrl, targetUrl } = parseCreateAuthProfileBody(body);
    if (!targetUrl) {
      return c.json({ success: false, error: 'targetUrl is required', field: 'targetUrl' }, 400);
    }

    const session = await startVisualAuthRecording({ profileName, loginUrl, targetUrl });
    activeAuthRecordings.set(session.id, session);

    return c.json({
      success: true,
      data: {
        recordingId: session.id,
        profileName: session.profileName,
        loginUrl: session.loginUrl,
        targetUrl: session.targetUrl,
        message: VISUAL_AUTH_RECORDING_MESSAGE,
      },
    });
  } catch (error) {
    if (error instanceof AuthProfileRequestError) {
      return c.json({ success: false, error: error.message, field: error.field }, 400);
    }
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});

app.post('/api/auth-profiles/recordings/:recordingId/complete', async (c) => {
  try {
    const recordingId = c.req.param('recordingId');
    const session = activeAuthRecordings.get(recordingId);
    if (!session) {
      return c.json({ success: false, error: '录制会话不存在或已结束' }, 404);
    }

    activeAuthRecordings.delete(recordingId);
    const authStatePath = resolveAuthProfilePath(session.profileName);
    const result = await session.complete(authStatePath);

    if (result.status !== 'valid') {
      return c.json({ success: false, error: result.message ?? '登录态验证失败', verification: result }, 400);
    }

    const now = new Date().toISOString();
    const metadata = {
      profileName: session.profileName,
      authStatePath: toAuthProfileDisplayMetadata(session.profileName).authStatePath,
      loginUrl: session.loginUrl,
      targetOrigin: new URL(session.targetUrl).origin,
      createdAt: now,
      lastVerifiedAt: now,
      verification: {
        status: result.status,
        finalUrl: result.finalUrl,
        message: result.message,
      },
    };

    writeAuthProfileMetadata(metadata);
    return c.json({ success: true, data: metadata });
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : '登录态验证失败' },
      400,
    );
  }
});

app.post('/api/auth-profiles/recordings/:recordingId/cancel', async (c) => {
  const recordingId = c.req.param('recordingId');
  const session = activeAuthRecordings.get(recordingId);
  if (!session) {
    return c.json({ success: false, error: '录制会话不存在或已结束' }, 404);
  }

  activeAuthRecordings.delete(recordingId);
  await session.cancel();
  return c.json({ success: true });
});

app.post('/api/auth-profiles/:profileName/verify', async (c) => {
  try {
    const profileName = c.req.param('profileName');
    try {
      assertSafeProfileName(profileName);
    } catch (error) {
      throw new AuthProfileRequestError(
        error instanceof Error ? error.message : 'invalid profile name',
        'profileName',
      );
    }

    const { targetUrl } = parseVerifyAuthProfileBody(await c.req.json());
    const authStatePath = resolveAuthProfilePath(profileName);
    const result = await verifyAuthProfile({ authStatePath, targetUrl });
    const existingMetadata = readAuthProfileMetadata(profileName);
    const now = new Date().toISOString();
    const metadata = {
      profileName,
      authStatePath: toAuthProfileDisplayMetadata(profileName).authStatePath,
      loginUrl: existingMetadata?.loginUrl ?? targetUrl,
      targetOrigin: existingMetadata?.targetOrigin ?? new URL(targetUrl).origin,
      createdAt: existingMetadata?.createdAt ?? now,
      lastVerifiedAt: now,
      notes: existingMetadata?.notes,
      verification: {
        status: result.status,
        finalUrl: result.finalUrl,
        message: result.message,
      },
    };

    writeAuthProfileMetadata(metadata);
    return c.json(metadata);
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
