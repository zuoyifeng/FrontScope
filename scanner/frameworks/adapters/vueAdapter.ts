import type { CodeReviewFinding } from '../../types.js';

export function reviewVueSource(fileName: string, text: string): CodeReviewFinding[] {
  const findings: CodeReviewFinding[] = [];
  const template = text.match(/<template[^>]*>([\s\S]*?)<\/template>/i)?.[1] ?? text;

  if (/v-html\s*=/.test(template)) {
    findings.push({
      ruleId: 'vue/dangerous-html',
      severity: 'high',
      file: fileName,
      line: 1,
      message: '使用 v-html 存在 XSS 风险，需确认内容已严格转义或来自可信来源。',
    });
  }

  const vForPattern = /<([a-zA-Z][^\s/>]*)(?=[^>]*\sv-for\s*=)(?![^>]*(?:\s:key\s*=|\skey\s*=))[^>]*>/g;
  if (vForPattern.test(template)) {
    findings.push({
      ruleId: 'vue/missing-key',
      severity: 'medium',
      file: fileName,
      line: 1,
      message: 'v-for 列表渲染缺少稳定的 :key，可能导致渲染错乱和不必要的重渲染。',
    });
  }

  return findings;
}
