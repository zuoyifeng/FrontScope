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
            optimizationDirection: '减少同步布局读写与频繁 resize 回调，降低主线程抖动。',
            implementationSteps: ['在 DevTools 中定位触发 ResizeObserver 的组件', '将布局读取与写入拆分到 requestAnimationFrame'],
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
              optimizationDirection: '先补齐证据再给出代码级建议。',
              implementationSteps: ['补充扫描证据', '重新生成 AI 诊断'],
              verifyMethod: '重新测试',
            },
          ],
          nextActions: [],
        }),
        new Set(evidence.map((item) => item.id)),
      ),
    ).toThrow(/evidenceIds|evidence id/);
  });

  it('sanitizes unknown evidence ids to a known fallback id', () => {
    const diagnosis = parseAiDiagnosis(
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
            optimizationDirection: '仅引用真实 evidence id。',
            implementationSteps: ['检查 evidence 列表', '修正 evidenceIds'],
            verifyMethod: '重新扫描',
          },
        ],
        nextActions: [],
      }),
      new Set(evidence.map((item) => item.id)),
    );

    expect(diagnosis.topIssues[0].evidenceIds).toEqual(['runtime.console.0']);
  });

  it('repairs truncated JSON returned by long-context models', () => {
    const complete = JSON.stringify({
      summary: 'ok',
      healthLevel: 'warning',
      topIssues: [
        {
          title: 'x',
          severity: 'high',
          category: 'network',
          evidenceIds: ['runtime.console.0'],
          possibleCause: 'GIS 地图库体积过大',
          suggestion: '拆分懒加载',
          optimizationDirection: '优先削减首屏 GIS 脚本体积并推迟非关键模块加载。',
          implementationSteps: ['定位大资源', '路由级 lazy import'],
          verifyMethod: '重新扫描',
        },
      ],
      nextActions: [],
    });
    const truncated = complete.slice(0, -2);

    const diagnosis = parseAiDiagnosis(truncated, new Set(['runtime.console.0']));

    expect(diagnosis.summary).toBe('ok');
    expect(diagnosis.topIssues[0].title).toBe('x');
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
              optimizationDirection: '优先削减首屏 JS/CSS 体积并推迟非关键脚本执行。',
              implementationSteps: ['用 Coverage/Network 定位大资源', '对路由级组件做 lazy import', '为 LCP 图片设置 priority/preload'],
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
              optimizationDirection: '优先优化首屏资源加载性能与体积。',
              implementationSteps: ['步骤一', '步骤二'],
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
