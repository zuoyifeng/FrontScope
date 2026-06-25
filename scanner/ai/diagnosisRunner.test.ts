// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAiDiagnosis } from './diagnosisRunner.js';
import type { AiProvider } from './aiProvider.js';
import type { CompactEvidenceItem } from './types.js';

const evidence: CompactEvidenceItem[] = [
  { id: 'lighthouse.metric.lcp', category: 'performance', summary: 'LCP: 3.2 s' },
];

describe('runAiDiagnosis', () => {
  it('returns failure meta when openai provider has no api key', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'frontscope-ai-config-'));
    const configPath = join(cwd, 'frontscope.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({ ai: { provider: 'openai', model: 'mimo-v2.5-pro', baseURL: 'https://api.example.com/v1' } }),
      'utf8',
    );

    const result = await runAiDiagnosis({ evidence, configPath });

    expect(result.diagnosis).toBeUndefined();
    expect(result.meta.status).toBe('failed');
    expect(result.meta.error).toContain('apiKey');
  });

  it('uses an injected provider without reading config credentials', async () => {
    const provider: AiProvider = {
      async generateDiagnosis() {
        return JSON.stringify({
          summary: 'ok',
          healthLevel: 'good',
          topIssues: [
            {
              title: 'LCP',
              severity: 'low',
              category: 'performance',
              evidenceIds: ['lighthouse.metric.lcp'],
              possibleCause: 'c',
              suggestion: 's',
              verifyMethod: 'v',
            },
          ],
          nextActions: [],
        });
      },
    };

    const result = await runAiDiagnosis({ evidence, aiProvider: provider });

    expect(result.meta.status).toBe('success');
    expect(result.diagnosis?.healthLevel).toBe('good');
    expect(result.meta.rawResponsePreview).toContain('healthLevel');
  });
});
