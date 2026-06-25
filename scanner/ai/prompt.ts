import type { CompactEvidenceItem } from './types.js';

export interface DiagnosisMessages {
  system: string;
  user: string;
}

const OUTPUT_SHAPE = `{
  "summary": "对页面/项目整体健康状况的中文总结",
  "healthLevel": "good | warning | critical",
  "topIssues": [
    {
      "title": "问题标题",
      "severity": "high | medium | low",
      "category": "runtime | performance | network | memory | dependency | code-quality | project",
      "evidenceIds": ["必须引用 evidence 列表中真实存在的 id"],
      "possibleCause": "可能原因",
      "suggestion": "可执行的修复建议",
      "verifyMethod": "修复后如何验证"
    }
  ],
  "nextActions": ["按优先级排列的后续动作"]
}`;

/**
 * Build the system + user messages for an evidence-first diagnosis.
 * The model is constrained to only cite evidence ids that actually exist so the
 * downstream guardrail in `parseAiDiagnosis` can reject hallucinated references.
 */
export function buildDiagnosisMessages(evidence: CompactEvidenceItem[]): DiagnosisMessages {
  const system = [
    '你是 FrontScope 的前端体检诊断助手，面向前端工程师输出可执行的诊断结论。',
    '核心原则：先证据，后结论。',
    '- 你只能基于下面提供的证据（evidence）得出结论。',
    '- 禁止编造任何未在证据中出现的文件、指标、依赖、请求或错误。',
    '- 每个 issue 的 evidenceIds 必须引用至少一个真实存在的证据 id；找不到支撑证据的结论不要输出。',
    '- 如果整体证据不足，应在 summary 中说明还需要补充哪些证据，并减少 issue 数量。',
    '输出要求：',
    '- 仅输出一个 JSON 对象，不要包含 Markdown、解释或多余文本。',
    '- 所有文本字段使用简体中文。',
    '- healthLevel 取值：good | warning | critical。',
    '- severity 取值：high | medium | low。',
    '- category 取值：runtime | performance | network | memory | dependency | code-quality | project。',
    '- 涉及内存的结论必须使用"疑似"措辞，并给出人工验证方法，不要断言确定的内存泄漏。',
    '- topIssues 最多 5 条，按 severity 从高到低排序。',
    'JSON 结构如下：',
    OUTPUT_SHAPE,
  ].join('\n');

  const user = [
    '以下是本次扫描采集到的证据列表（JSON 数组，每项含稳定的 id）：',
    JSON.stringify(evidence, null, 2),
    '请基于以上证据生成体检诊断 JSON。',
  ].join('\n\n');

  return { system, user };
}
