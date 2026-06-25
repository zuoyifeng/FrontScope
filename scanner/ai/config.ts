import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';

export const DEFAULT_CONFIG_FILENAME = 'frontscope.config.json';
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

const authHeaderSchema = z.enum(['bearer', 'api-key']);

const aiConfigSchema = z.object({
  provider: z.enum(['mock', 'openai']).optional(),
  baseURL: z.string().optional(),
  apiKey: z.string().optional(),
  /** `bearer` = Authorization: Bearer (OpenAI 默认); `api-key` = api-key 头 (小米 Mimo 等) */
  authHeader: authHeaderSchema.optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const securityConfigSchema = z.object({
  apiToken: z.string().optional(),
  allowedOrigins: z.array(z.string()).optional(),
  allowPrivateNetwork: z.boolean().optional(),
  allowedProjectRoots: z.array(z.string()).optional(),
  allowedOutputRoots: z.array(z.string()).optional(),
  allowedUrlHosts: z.array(z.string()).optional(),
});

const frontscopeConfigSchema = z.object({
  ai: aiConfigSchema.optional(),
  security: securityConfigSchema.optional(),
});

export type AiProviderKind = 'mock' | 'openai';
export type AiAuthHeader = z.infer<typeof authHeaderSchema>;

export interface AiConfig {
  provider: AiProviderKind;
  baseURL?: string;
  apiKey?: string;
  authHeader?: AiAuthHeader;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface SecurityConfig {
  apiToken?: string;
  allowedOrigins: string[];
  allowPrivateNetwork: boolean;
  allowedProjectRoots: string[];
  allowedOutputRoots: string[];
  allowedUrlHosts: string[];
}

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

export interface ResolveAiConfigOptions {
  /** Explicit config file path. Overrides cwd/env discovery. */
  configPath?: string;
  /** Working directory used to discover the default config file. */
  cwd?: string;
  /** Environment source, defaults to process.env. */
  env?: Record<string, string | undefined>;
}

export type ResolveSecurityConfigOptions = ResolveAiConfigOptions;

/**
 * Resolve `${VAR}` references against the environment so secrets stay out of the
 * committed config file. Plain values are returned unchanged.
 */
function interpolateEnv(value: string | undefined, env: Record<string, string | undefined>): string | undefined {
  if (!value) return value;

  const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value.trim());
  if (!match) return value;

  return env[match[1]];
}

function resolveConfigPath(options: ResolveAiConfigOptions, env: Record<string, string | undefined>): string {
  if (options.configPath) return resolve(options.configPath);
  if (env.FRONTSCOPE_CONFIG) return resolve(env.FRONTSCOPE_CONFIG);
  return resolve(options.cwd ?? process.cwd(), DEFAULT_CONFIG_FILENAME);
}

type FrontscopeConfigFile = z.infer<typeof frontscopeConfigSchema>;

function readConfigFile(configPath: string): FrontscopeConfigFile {
  if (!existsSync(configPath)) return {};

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`无法解析配置文件 ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return frontscopeConfigSchema.parse(raw);
}

/**
 * Merge configuration from the config file with environment overrides.
 * Precedence: explicit env vars > config file > built-in defaults.
 */
export function resolveAiConfig(options: ResolveAiConfigOptions = {}): AiConfig {
  const env = options.env ?? process.env;
  const fileConfig = readConfigFile(resolveConfigPath(options, env)).ai ?? {};

  const provider = (env.FRONTSCOPE_AI_PROVIDER as AiProviderKind | undefined) ?? fileConfig.provider ?? 'mock';
  const baseURL = env.FRONTSCOPE_AI_BASE_URL ?? fileConfig.baseURL;
  const model = env.FRONTSCOPE_AI_MODEL ?? fileConfig.model;
  const apiKey =
    env.FRONTSCOPE_AI_API_KEY ??
    interpolateEnv(fileConfig.apiKey, env) ??
    env.MIMO_API_KEY ??
    env.OPENAI_API_KEY ??
    undefined;

  const authHeader =
    (env.FRONTSCOPE_AI_AUTH_HEADER as AiAuthHeader | undefined) ?? fileConfig.authHeader ?? 'bearer';

  return {
    provider,
    baseURL,
    apiKey,
    authHeader,
    model,
    temperature: fileConfig.temperature,
    maxOutputTokens: fileConfig.maxOutputTokens,
    timeoutMs: fileConfig.timeoutMs,
  };
}

function pickDefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) as Partial<T>;
}

/**
 * Merge per-request AI settings (UI / CLI) on top of file + env config.
 * Request values win when provided.
 */
export function mergeAiConfig(base: AiConfig, override?: Partial<AiConfig>): AiConfig {
  if (!override) return base;

  const picked = pickDefined(override);
  if (Object.keys(picked).length === 0) return base;

  const hasCredentials = Boolean(picked.apiKey || picked.baseURL || picked.model);

  return {
    ...base,
    ...picked,
    provider: hasCredentials ? 'openai' : picked.provider ?? base.provider,
    authHeader: (picked.authHeader as AiAuthHeader | undefined) ?? base.authHeader ?? 'bearer',
  };
}

function fileAiToPartialConfig(
  fileConfig: NonNullable<FrontscopeConfigFile['ai']>,
  env: Record<string, string | undefined>,
): Partial<AiConfig> {
  return pickDefined({
    provider: fileConfig.provider,
    baseURL: fileConfig.baseURL,
    apiKey: interpolateEnv(fileConfig.apiKey, env) ?? fileConfig.apiKey,
    authHeader: fileConfig.authHeader,
    model: fileConfig.model,
    temperature: fileConfig.temperature,
    maxOutputTokens: fileConfig.maxOutputTokens,
    timeoutMs: fileConfig.timeoutMs,
  });
}

/**
 * Resolve AI config for a scan.
 *
 * Precedence:
 * 1. Explicit `configPath` / `FRONTSCOPE_CONFIG`
 * 2. Tool install config (`cwd` / process cwd)
 * 3. Optional project overlay at `{projectPath}/frontscope.config.json`
 * 4. Environment variables (applied inside each `resolveAiConfig` call)
 */
export function resolveLayeredAiConfig(
  options: { configPath?: string; projectPath?: string; cwd?: string; env?: Record<string, string | undefined> } = {},
): AiConfig {
  const env = options.env ?? process.env;

  if (options.configPath || env.FRONTSCOPE_CONFIG) {
    return resolveAiConfig({ configPath: options.configPath, cwd: options.cwd, env });
  }

  const toolConfig = resolveAiConfig({ cwd: options.cwd, env });

  if (!options.projectPath) {
    return toolConfig;
  }

  const projectConfigPath = join(resolve(options.projectPath), DEFAULT_CONFIG_FILENAME);
  if (!existsSync(projectConfigPath)) {
    return toolConfig;
  }

  const projectAi = readConfigFile(projectConfigPath).ai;
  if (!projectAi) {
    return toolConfig;
  }

  return mergeAiConfig(toolConfig, fileAiToPartialConfig(projectAi, env));
}

/** Build effective AI config: per-scan form values win over file/env. */
export function resolveEffectiveAiConfig(
  options: { configPath?: string; projectPath?: string; override?: Partial<AiConfig> } = {},
): AiConfig {
  const override = options.override ? pickDefined(options.override) : undefined;

  if (override?.apiKey) {
    return mergeAiConfig(
      {
        provider: 'openai',
        authHeader: (override.authHeader as AiAuthHeader | undefined) ?? 'api-key',
        temperature: 0.2,
        maxOutputTokens: 4096,
        timeoutMs: 60_000,
      },
      { provider: 'openai', ...override },
    );
  }

  return mergeAiConfig(
    resolveLayeredAiConfig({ configPath: options.configPath, projectPath: options.projectPath }),
    override,
  );
}

export interface AiConfigDescription {
  provider: string;
  model?: string;
  baseURL?: string;
  endpoint: string;
  authHeader: AiAuthHeader;
  apiKeyConfigured: boolean;
}

/** Safe summary for UI / logs — never includes the apiKey. */
export function describeAiConfig(config: AiConfig): AiConfigDescription {
  const baseURL = config.baseURL ?? DEFAULT_OPENAI_BASE_URL;
  return {
    provider: config.provider,
    model: config.model,
    baseURL,
    endpoint: `${baseURL.replace(/\/+$/, '')}/chat/completions`,
    authHeader: config.authHeader ?? 'bearer',
    apiKeyConfigured: Boolean(config.apiKey),
  };
}

/**
 * Resolve the security policy from the config file with env overrides.
 * Defaults are local-first: private network access allowed, no path/host
 * allowlist (trusted mode), CORS restricted to the local dev UI origins.
 */
export function resolveSecurityConfig(options: ResolveSecurityConfigOptions = {}): SecurityConfig {
  const env = options.env ?? process.env;
  const fileConfig = readConfigFile(resolveConfigPath(options, env)).security ?? {};

  return {
    apiToken: env.FRONTSCOPE_API_TOKEN ?? fileConfig.apiToken,
    allowedOrigins: fileConfig.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
    allowPrivateNetwork: fileConfig.allowPrivateNetwork ?? true,
    allowedProjectRoots: fileConfig.allowedProjectRoots ?? [],
    allowedOutputRoots: fileConfig.allowedOutputRoots ?? [],
    allowedUrlHosts: fileConfig.allowedUrlHosts ?? [],
  };
}
