// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyzeWithAi, parseAiDiagnosis } from './aiAnalyzer.js';
import type { AiProvider } from './aiProvider.js';
import type { CompactEvidenceItem } from './types.js';

const evidence: CompactEvidenceItem[] = [
  {
    id: 'runtime.console.0',
    category: 'runtime',
    summary: 'console error: ResizeObserver loop limit exceeded',
  },
  {
    id: 'lighthouse.metric.lcp',
    category: 'performance',
    summary: 'LCP: 3.2 s',
  },
];

describe('parseAiDiagnosis', () => {
  it('accepts a valid diagnosis with evidence ids', () => {
    const diagnosis = parseAiDiagnosis(
      JSON.stringify({
        summary: '页面存在运行时错误和 LCP 偏慢。',
        healthLevel: 'warning',
        topIssues: [
          {
            title: '运行时控制台错误',
            severity: 'medium',
            category: 'runtime',
            evidenceIds: ['runtime.console.0'],
            possibleCause: '组件在布局变化时触发浏览器警告。',
            suggestion: '定位触发 ResizeObserver 的组件并降低重复布局。',
            verifyMethod: '重新扫描并确认 console error 为 0。',
          },
        ],
        nextActions: ['先修复运行时错误'],
      }),
      new Set(evidence.map((item) => item.id)),
    );

    expect(diagnosis.healthLevel).toBe('warning');
    expect(diagnosis.topIssues[0].evidenceIds).toEqual(['runtime.console.0']);
  });

  it('rejects issues without evidence ids', () => {
    expect(() =>
      parseAiDiagnosis(
        JSON.stringify({
          summary: '泛泛而谈的建议。',
          healthLevel: 'warning',
          topIssues: [
            {
              title: '缺少证据的问题',
              severity: 'medium',
              category: 'runtime',
              evidenceIds: [],
              possibleCause: '未知',
              suggestion: '优化代码',
              verifyMethod: '重新测试',
            },
          ],
          nextActions: [],
        }),
        new Set(evidence.map((item) => item.id)),
      ),
    ).toThrow('AI issue must reference at least one evidence id');
  });

  it('rejects evidence ids that are not present in compacted evidence', () => {
    expect(() =>
      parseAiDiagnosis(
        JSON.stringify({
          summary: '引用了不存在的证据。',
          healthLevel: 'critical',
          topIssues: [
            {
              title: '不存在的证据',
              severity: 'high',
              category: 'performance',
              evidenceIds: ['lighthouse.audit.missing'],
              possibleCause: '未知',
              suggestion: '补充证据',
              verifyMethod: '重新扫描',
            },
          ],
          nextActions: [],
        }),
        new Set(evidence.map((item) => item.id)),
      ),
    ).toThrow('AI issue references unknown evidence id: lighthouse.audit.missing');
  });
});

describe('analyzeWithAi', () => {
  it('uses the provider and validates the returned diagnosis', async () => {
    const provider: AiProvider = {
      async generateDiagnosis(input) {
        expect(input.evidence).toHaveLength(2);
        return JSON.stringify({
          summary: 'LCP 偏慢且存在运行时错误。',
          healthLevel: 'warning',
          topIssues: [
            {
              title: 'LCP 偏慢',
              severity: 'medium',
              category: 'performance',
              evidenceIds: ['lighthouse.metric.lcp'],
              possibleCause: '首屏资源加载较慢。',
              suggestion: '检查首屏资源体积和阻塞脚本。',
              verifyMethod: '重新扫描并确认 LCP 降低。',
            },
          ],
          nextActions: ['检查首屏资源'],
        });
      },
    };

    const { diagnosis } = await analyzeWithAi({ evidence, provider });

    expect(diagnosis.summary).toContain('LCP');
    expect(diagnosis.topIssues[0].evidenceIds).toEqual(['lighthouse.metric.lcp']);
  });

  it('parses JSON wrapped in markdown fences', () => {
    const diagnosis = parseAiDiagnosis(
      '```json\n' +
        JSON.stringify({
          summary: 'ok',
          healthLevel: 'good',
          topIssues: [
            {
              title: 'x',
              severity: 'low',
              category: 'runtime',
              evidenceIds: ['runtime.console.0'],
              possibleCause: 'c',
              suggestion: 's',
              verifyMethod: 'v',
            },
          ],
          nextActions: [],
        }) +
        '\n```',
      new Set(evidence.map((item) => item.id)),
    );

    expect(diagnosis.healthLevel).toBe('good');
  });
});
