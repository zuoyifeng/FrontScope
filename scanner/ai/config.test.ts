// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG_FILENAME, mergeAiConfig, resolveAiConfig, resolveEffectiveAiConfig, resolveLayeredAiConfig } from './config.js';

function writeConfig(content: unknown): { cwd: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'frontscope-config-'));
  writeFileSync(join(cwd, DEFAULT_CONFIG_FILENAME), JSON.stringify(content), 'utf8');
  return { cwd };
}

describe('resolveAiConfig', () => {
  it('defaults to the mock provider when no config file exists', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'frontscope-empty-'));
    const config = resolveAiConfig({ cwd, env: {} });

    expect(config.provider).toBe('mock');
    expect(config.apiKey).toBeUndefined();
  });

  it('reads provider and model from the config file', () => {
    const { cwd } = writeConfig({
      ai: { provider: 'openai', model: 'gpt-4o-mini', baseURL: 'https://api.example.com/v1', apiKey: 'sk-file' },
    });

    const config = resolveAiConfig({ cwd, env: {} });

    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.baseURL).toBe('https://api.example.com/v1');
    expect(config.apiKey).toBe('sk-file');
  });

  it('interpolates ${ENV} apiKey references from the environment', () => {
    const { cwd } = writeConfig({ ai: { provider: 'openai', model: 'deepseek-chat', apiKey: '${DEEPSEEK_KEY}' } });

    const config = resolveAiConfig({ cwd, env: { DEEPSEEK_KEY: 'sk-deepseek' } });

    expect(config.apiKey).toBe('sk-deepseek');
  });

  it('lets environment variables override the config file', () => {
    const { cwd } = writeConfig({ ai: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-file' } });

    const config = resolveAiConfig({
      cwd,
      env: { FRONTSCOPE_AI_MODEL: 'gpt-4o', FRONTSCOPE_AI_API_KEY: 'sk-env' },
    });

    expect(config.model).toBe('gpt-4o');
    expect(config.apiKey).toBe('sk-env');
  });

  it('falls back to OPENAI_API_KEY when no apiKey is configured', () => {
    const { cwd } = writeConfig({ ai: { provider: 'openai', model: 'gpt-4o-mini' } });

    const config = resolveAiConfig({ cwd, env: { OPENAI_API_KEY: 'sk-openai' } });

    expect(config.apiKey).toBe('sk-openai');
  });

  it('reads authHeader and resolves MIMO_API_KEY for Xiaomi-style configs', () => {
    const { cwd } = writeConfig({
      ai: {
        provider: 'openai',
        baseURL: 'https://api.xiaomimimo.com/v1',
        authHeader: 'api-key',
        apiKey: '${MIMO_API_KEY}',
        model: 'mimo-v2.5-pro',
      },
    });

    const config = resolveAiConfig({ cwd, env: { MIMO_API_KEY: 'sk-mimo' } });

    expect(config.authHeader).toBe('api-key');
    expect(config.baseURL).toBe('https://api.xiaomimimo.com/v1');
    expect(config.model).toBe('mimo-v2.5-pro');
    expect(config.apiKey).toBe('sk-mimo');
  });

  it('merges per-request overrides on top of file config', () => {
    const merged = mergeAiConfig(
      { provider: 'mock', baseURL: 'https://file.example.com/v1', model: 'file-model' },
      { apiKey: 'sk-ui', baseURL: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', authHeader: 'api-key' },
    );

    expect(merged.provider).toBe('openai');
    expect(merged.apiKey).toBe('sk-ui');
    expect(merged.baseURL).toBe('https://api.xiaomimimo.com/v1');
    expect(merged.model).toBe('mimo-v2.5-pro');
    expect(merged.authHeader).toBe('api-key');
  });

  it('resolveEffectiveAiConfig prefers inline apiKey over file config', () => {
    const effective = resolveEffectiveAiConfig({
      override: {
        apiKey: 'sk-ui',
        baseURL: 'https://api.xiaomimimo.com/v1',
        model: 'mimo-v2.5-pro',
        authHeader: 'api-key',
      },
    });

    expect(effective.apiKey).toBe('sk-ui');
    expect(effective.provider).toBe('openai');
    expect(effective.baseURL).toBe('https://api.xiaomimimo.com/v1');
    expect(effective.model).toBe('mimo-v2.5-pro');
  });

  it('resolveLayeredAiConfig uses tool config when scanned project has no config file', () => {
    const toolDir = mkdtempSync(join(tmpdir(), 'frontscope-tool-'));
    writeFileSync(
      join(toolDir, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({
        ai: { provider: 'openai', model: 'mimo-v2.5-pro', apiKey: 'sk-tool', baseURL: 'https://api.example.com/v1' },
      }),
      'utf8',
    );
    const projectDir = mkdtempSync(join(tmpdir(), 'frontscope-project-'));

    const config = resolveLayeredAiConfig({ cwd: toolDir, projectPath: projectDir, env: {} });

    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('sk-tool');
    expect(config.model).toBe('mimo-v2.5-pro');
  });

  it('resolveLayeredAiConfig overlays project ai config on top of tool config', () => {
    const toolDir = mkdtempSync(join(tmpdir(), 'frontscope-tool-'));
    writeFileSync(
      join(toolDir, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({
        ai: { provider: 'openai', model: 'tool-model', apiKey: 'sk-tool' },
      }),
      'utf8',
    );
    const projectDir = mkdtempSync(join(tmpdir(), 'frontscope-project-'));
    writeFileSync(
      join(projectDir, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({
        ai: { model: 'project-model' },
      }),
      'utf8',
    );

    const config = resolveLayeredAiConfig({ cwd: toolDir, projectPath: projectDir, env: {} });

    expect(config.apiKey).toBe('sk-tool');
    expect(config.model).toBe('project-model');
    expect(config.provider).toBe('openai');
  });
});
