import type { CompactEvidenceItem } from './types.js';

export interface DiagnosisMessages {
  system: string;
  user: string;
}

const OUTPUT_SHAPE = `{
  "summary": "对页面/项目整体健康状况的中文总结，并点明优先治理方向（性能/稳定性/代码质量/依赖安全）",
  "healthLevel": "good | warning | critical",
  "topIssues": [
    {
      "title": "问题标题",
      "severity": "high | medium | low",
      "category": "runtime | performance | network | memory | dependency | code-quality | project",
      "evidenceIds": ["必须引用 evidence 列表中真实存在的 id"],
      "possibleCause": "基于证据推断的可能根因，说明触发机制",
      "suggestion": "一句话可执行修复方向（供快速扫读）",
      "optimizationDirection": "优化策略：目标、思路、预期收益、注意事项（2-4 句）",
      "implementationSteps": ["按顺序列出 2-6 条具体实施步骤，面向前端工程师可直接开工"],
      "codeHints": "可选。仅当证据含文件路径/规则/URL/配置项时，给出代码或配置层面的修改提示；禁止编造路径",
      "verifyMethod": "修复后如何验证（指标、命令、复扫方式）"
    }
  ],
  "nextActions": ["按优先级排列的后续工程动作，避免空泛表述"]
}`;

/**
 * Build the system + user messages for an evidence-first diagnosis.
 * The model is constrained to only cite evidence ids that actually exist so the
 * downstream guardrail in `parseAiDiagnosis` can reject hallucinated references.
 */
export function buildDiagnosisMessages(evidence: CompactEvidenceItem[]): DiagnosisMessages {
  const system = [
    '你是 FrontScope 的前端体检诊断助手，面向资深前端工程师输出可落地的工程建议。',
    '你的职责不是复述扫描报告，而是把证据翻译成：根因分析 → 优化方向 → 具体改法 → 验证方式。',
    '核心原则：先证据，后结论。',
    '- 你只能基于下面提供的证据（evidence）得出结论。',
    '- 禁止编造任何未在证据中出现的文件路径、类名、函数名、依赖名、请求 URL 或指标数值。',
    '- 每个 issue 的 evidenceIds 必须引用至少一个真实存在的证据 id；找不到支撑证据的结论不要输出。',
    '- 如果整体证据不足，应在 summary 中说明还需要补充哪些证据，并减少 issue 数量。',
    '工程建议要求（每条 issue 必须满足）：',
    '- suggestion：一句话说明「先改什么」。',
    '- optimizationDirection：说明优化策略、预期收益、可能影响面，不要只重复 evidence 原文。',
    '- implementationSteps：2-6 条按顺序可执行步骤，例如「定位资源 → 拆分 bundle → 懒加载 → 复扫对比」。',
    '- codeHints：当证据包含文件:行号、ESLint 规则、漏洞包名、慢请求 URL、Lighthouse audit id 时，给出对应的代码/配置修改方向（可用伪代码或配置片段，但不得虚构路径）。',
    '- 性能类问题要区分「加载链路」「主线程长任务」「布局抖动」「网络体积」等治理手段，给出不同层级的优化路径。',
    '- 代码质量/依赖类问题要给出治理顺序（先阻断发布风险 vs 可渐进治理）。',
    '- 涉及内存的结论必须使用"疑似"措辞，并给出人工验证方法，不要断言确定的内存泄漏。',
    '输出要求：',
    '- 仅输出一个 JSON 对象，不要包含 Markdown 解释或多余文本。',
    '- 所有文本字段使用简体中文。',
    '- healthLevel 取值：good | warning | critical。',
    '- severity 取值：high | medium | low。',
    '- category 取值：runtime | performance | network | memory | dependency | code-quality | project。',
    '- topIssues 最多 5 条，按 severity 从高到低排序。',
    '- nextActions 每条都应是可执行的工程任务（含建议工具/命令/复扫动作），禁止「持续关注」「进一步优化」等空话。',
    'JSON 结构如下：',
    OUTPUT_SHAPE,
  ].join('\n');

  const user = [
    '以下是本次扫描采集到的证据列表（JSON 数组，每项含稳定的 id）：',
    JSON.stringify(evidence, null, 2),
    '请基于以上证据生成体检诊断 JSON。重点输出可落地的代码与优化建议，不要只做报告解读。',
  ].join('\n\n');

  return { system, user };
}
