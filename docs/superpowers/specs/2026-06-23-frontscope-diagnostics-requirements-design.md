# FrontScope Diagnostics Requirements Design

## 1. 背景

FrontScope 当前已经具备本地证据采集基础：

- Playwright 采集运行时错误、请求失败、HTTP 错误和截图。
- Lighthouse 采集性能、可访问性、最佳实践、SEO 和核心指标。
- Chrome trace 采集 Performance Trace，生成 long task、layout/style/paint/loading 和 layout shift 摘要。
- Chrome DevTools Protocol 采集 Network 请求、资源体积、缓存命中、慢请求、大资源和失败请求摘要。
- package scanner 读取包管理器、scripts、dependencies、framework hints 和配置文件。
- 报告输出 `scan.json`、`report.md`、`screenshot.png`。
- 模块失败时保留已采集证据，并记录模块异常。

下一阶段要把它从“Lighthouse + Playwright 证据采集器”升级为“前端项目 AI 体检工具”。核心原则保持不变：

```text
先采集证据，再生成结论。
没有证据，不输出 AI 诊断。
每条建议必须带验证方法。
```

## 2. 市场能力调研

### Chrome DevTools

Chrome DevTools 是交互式调试标杆。

已确认能力：

- Performance 面板支持 CPU performance profile、主线程 flame chart、long task、layout shifts、Core Web Vitals、本地 INP/LCP/CLS、FPS、memory metrics 和 trace 分析。
- Network 面板支持请求表、headers/payload/response/timing、waterfall、priority、cache、throttling、offline、response header override。
- Memory 面板支持 heap snapshot、allocation instrumentation on timeline、allocation sampling、detached elements、snapshot comparison。
- Lighthouse 面板支持 navigation、timespan、snapshot，用于页面加载、交互过程和页面特定状态审计。

FrontScope 不应该复刻完整交互式 DevTools UI，而应该自动化采集其中最适合报告化和 AI 诊断的证据。

### WebPageTest

WebPageTest 的强项是稳定实验环境和深度页面加载分析。

关键能力：

- 多浏览器、地区、设备和网络环境。
- Core Web Vitals、Lighthouse、filmstrip、video capture、waterfall。
- DevTools timeline、Chrome trace、V8 sampling profiler、custom metrics。
- 多次运行、repeat view、visual comparison、no-code experiments。

FrontScope 短期缺口：

- 多次运行与中位数。
- filmstrip/video。
- repeat view/cache 对比。
- Chrome trace 和 V8 profiler。
- 可配置网络环境。

### GTmetrix

GTmetrix 的强项是面向用户的性能报告和持续监控。

关键能力：

- Lighthouse metrics、Web Vitals、CrUX real user metrics。
- Speed visualization、waterfall、page composition、request size。
- 历史趋势、定时监控、告警、多地区测试。
- Waterfall request/response headers、CDN cache status、CPU/memory/bandwidth resource usage。

FrontScope 短期缺口：

- 历史趋势。
- 性能预算和告警。
- CrUX/field data。
- 资源组成分析。
- CDN/cache 专项诊断。

### SpeedCurve / DebugBear

这类产品的强项是 Synthetic + RUM + CI/监控。

关键能力：

- Synthetic lab tests、RUM、CrUX。
- Lighthouse audits、Core Web Vitals、INP、LCP/CLS element attribution。
- 性能预算、Slack/email/webhook 告警。
- CI/CD 集成、commit 对比、deploy annotation。
- 竞争对手 benchmark、历史趋势、回归分析。
- DebugBear 还强调 network + CPU + rendering progress 关联、LCP subparts、Long Animation Frames、慢交互归因。

FrontScope 短期缺口：

- RUM。
- 性能预算。
- CI 状态检查。
- 历史列表、手动选择两次扫描和趋势图。
- INP/用户交互真实归因。
- 多页面网站扫描。

### Sentry

Sentry 的强项是线上错误、性能 tracing 和 session replay。

关键能力：

- JavaScript errors、unhandled rejections、stack trace、source map。
- BrowserTracing 自动捕获 pageload、navigation、fetch/XHR、user interactions、long tasks。
- Web Vitals、INP、distributed tracing。
- Session Replay，把错误、网络、交互、console 和用户行为关联起来。

FrontScope 短期缺口：

- 线上用户真实错误采集。
- session replay。
- distributed tracing。
- release/version 维度归因。

这些属于监控平台方向，不建议作为本地 MVP 的核心。

### SonarQube / Snyk / Knip

这类工具说明“项目质量”不只看页面性能。

关键能力：

- SonarQube：JavaScript/TypeScript/CSS 静态分析、bugs、code smells、vulnerabilities、quality gate、CI/PR 集成。
- Snyk：npm/pnpm/yarn 依赖漏洞、license、lockfile/workspace、Fix PR、持续监控。
- Knip：unused files、unused exports、unused dependencies、missing dependencies，支持大量 JS/TS 工具链插件。

FrontScope 短期缺口：

- ESLint/TypeScript 诊断。
- unused dependency / missing dependency。
- dead code / unused exports。
- circular dependency。
- dependency vulnerability / license。
- AI code review 基于静态证据输出。

## 3. 产品定位修正

FrontScope 不做全量 DevTools 克隆，也不做云监控平台。

推荐定位：

```text
面向前端工程师的网页性能检测与本地代码质量审查工具。
它自动采集远端或本地页面的加载、网络、运行时异常、性能 trace 和内存证据，
同时采集本地项目的依赖、静态检查、代码逻辑和交互风险证据，
再生成可验证的 AI Markdown 诊断报告。
```

差异点：

- 比 Lighthouse 更懂本地项目上下文。
- 比 DevTools 更适合自动化归档、对比和报告。
- 比商业监控工具更轻量，不需要先接 SDK、账号、云服务。
- 比纯 AI code review 更可信，因为每条结论必须引用采集证据。

## 4. 需求分层

### A. 页面体验层

用于回答：

```text
这个页面现在表现怎么样？
用户打开时慢在哪里？
运行时有没有错误？
网络资源是否健康？
交互过程是否卡顿？
```

模块：

- Runtime Evidence
- Lighthouse Evidence
- Network Evidence
- Performance Trace Evidence
- Memory Evidence later

### B. 项目健康层

用于回答：

```text
这个前端项目本身有没有维护风险？
依赖是否异常？
代码是否有明显质量问题？
前端代码逻辑和交互实现是否存在明显问题？
```

模块：

- Package Evidence
- Dependency Risk Evidence
- Static Code Quality Evidence
- Local Code Review Evidence
- Bundle Evidence later

### C. AI 诊断层

用于回答：

```text
优先修什么？
证据是什么？
可能原因是什么？
怎么修？
修完怎么验证？
```

模块：

- Evidence Compactor
- AI Analyzer
- Schema Validator
- Evidence Guardrail
- Markdown Report Generator

## 5. 版本范围

### V0.2 AI Evidence Report

目标：

把 `scan.json` 转成可信的中文 AI 诊断报告。

需求：

- 支持配置 AI provider。
- 构造紧凑 evidence payload。
- AI 输出结构化 JSON。
- 用 Zod 校验 AI 输出。
- 每条 issue 必须引用 evidence id。
- 报告包含 summary、health level、top issues、evidence、possible cause、suggestion、verify method。
- AI 失败时仍输出基础 Markdown 报告。

不做：

- 自动改代码。
- 多 agent 修复。
- 云端历史。

### V0.3 Network Diagnosis

目标：

补齐接近 DevTools Network 面板的报告型能力。

当前进度：

- 已实现请求级 CDP 事件归并、资源体积、缓存命中率、慢请求、大资源和失败请求摘要。
- 已写入 `scan.json`、Markdown “Network 资源诊断” 小节、AI evidence compactor 和中文 UI 摘要。
- 后续增强重点是交互式瀑布图、阻塞链路分析和 render-blocking hints。

需求：

- 采集每个请求的 URL、method、resourceType、status、mimeType、priority、initiator。
- 采集 timing breakdown：queueing、dns、connect、ssl、request、ttfb、download、total。
- 采集 transfer size、encoded body size、decoded body size。
- 标记 fromDiskCache、fromMemoryCache、service worker。
- 生成 slow requests、large resources、failed requests、render-blocking hints。
- 输出 cache hit ratio。
- Markdown 中加入 Network 总览、Top 问题和表格。

不做：

- 完整交互式瀑布图 UI。
- 抓取 response body。
- 复杂 HAR 编辑器。

### V0.4 Performance Trace Diagnosis

目标：

做报告式 Performance 面板，定位主线程瓶颈和布局问题。

当前进度：

- 已实现 Chrome trace 文件保存。
- 已解析 long task、layout/style/paint/loading 分类耗时、Layout/Style/Paint 事件和 LayoutShift。
- 已写入 `scan.json`、Markdown “Performance Trace 诊断” 小节、AI evidence compactor、CLI 输出和中文 UI 摘要。
- 后续增强重点是用户操作过程 trace、完整火焰图摘要、调用栈树和 INP/交互归因。

需求：

- 录制 Chrome trace。
- 保存 trace 文件路径。
- 解析 main thread task。
- 识别 long tasks，阈值 50ms。
- 聚合 scripting、rendering、painting、loading。
- 提取 layout、recalculate style、paint、composite layers 事件。
- 提取 layout shifts 和 CLS cluster 摘要。
- Markdown 中加入 long task、layout shift、主线程耗时摘要。

不做：

- 完整 flame chart 交互 UI。
- 逐函数源码映射。
- 自动性能修复。

### V0.5 Project Quality And Local Code Review

目标：

从页面诊断扩展到项目诊断。

需求：

- 运行 TypeScript typecheck。
- 运行 ESLint，如果项目有配置。
- 支持 `pnpm audit --json`。
- 支持 Knip 检测 unused dependencies、unused exports、unused files。
- 支持 Madge 或等价工具检测 circular dependencies。
- 统一为 code quality evidence。
- AI 输出本地 code review 风格建议，但只基于本地静态证据。
- 审查前端代码逻辑、组件边界、状态流、异常处理和交互实现风险。

不做：

- 自研完整静态分析引擎。
- 替代 SonarQube/Snyk。
- 未经用户确认自动改依赖。
- 对远端页面做源码级 code review。

### V0.6 Memory Diagnosis

目标：

补齐内存泄漏和堆快照方向的网页性能检测。

需求：

- 通过 Chrome DevTools Protocol 采集 heap snapshot。
- 支持扫描前后两次快照对比。
- 统计对象数量、retained size、detached DOM 线索。
- 允许后续接入用户操作脚本来复现疑似泄漏路径。
- AI 只输出“疑似泄漏风险”和验证方法，不直接断言所有泄漏。

不做：

- 线上用户级内存监控。
- 自动判断所有内存泄漏。
- 自动修改代码。

## 6. 优先级决策

推荐顺序：

1. V0.2 AI Evidence Report
2. V0.3 Network Diagnosis
3. V0.4 Performance Trace Diagnosis
4. V0.5 Project Quality And Local Code Review
5. V0.6 Memory Diagnosis

原因：

- V0.2 先让现有证据变成产品价值。
- V0.3/V0.4 对齐用户关心的 DevTools 深度能力。
- V0.5 再把 code review、包异常、依赖风险纳入项目健康。
- V0.6 补内存泄漏方向，因为它属于网页性能检测的深水区。

## 7. 测试策略

当前测试不够全面。目标测试矩阵如下：

| 模块 | 必须测试 | 验证方式 |
| --- | --- | --- |
| AI Analyzer | provider 成功、失败、非法 JSON、无证据结论 | mock provider 单测 |
| Report | Markdown 小节、模块失败、缺失数据 | snapshot/string test |
| Network | 请求 timing、cache、慢请求、大资源 | fixture 单测 |
| Performance Trace | long task、layout、paint、CLS | trace fixture 单测 |
| Project Quality | eslint/typecheck/audit/knip 输出解析 | fixture 单测 |
| API | scan 成功、失败、部分失败 | Hono request test |
| UI | 表单提交、成功态、失败态 | Testing Library |
| E2E | 真实本地页面生成三件套 | CLI smoke test |

## 8. 参考资料

- Chrome DevTools Performance: https://developer.chrome.com/docs/devtools/performance
- Chrome DevTools Performance Reference: https://developer.chrome.com/docs/devtools/performance/reference
- Chrome DevTools Network: https://developer.chrome.com/docs/devtools/network/overview
- Chrome DevTools Network Reference: https://developer.chrome.com/docs/devtools/network/reference
- Chrome DevTools Memory: https://developer.chrome.com/docs/devtools/memory
- Chrome DevTools Heap Snapshots: https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots
- Lighthouse User Flows: https://web.dev/articles/lighthouse-user-flows
- WebPageTest: https://webpagetest.org/
- GTmetrix Features: https://gtmetrix.com/features.html
- SpeedCurve Performance Monitoring: https://www.speedcurve.com/features/performance-monitoring/
- DebugBear: https://www.debugbear.com/
- Sentry JavaScript Tracing: https://docs.sentry.io/platforms/javascript/tracing/instrumentation/automatic-instrumentation/
- SonarQube JS/TS/CSS: https://docs.sonarsource.com/sonarqube-server/2026.1/analyzing-source-code/languages/javascript-typescript-css
- Snyk JavaScript: https://docs.snyk.io/supported-languages/supported-languages-list/javascript
- Knip: https://knip.dev/
