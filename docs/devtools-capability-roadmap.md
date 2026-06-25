# FrontScope DevTools 深度能力路线

## 结论

FrontScope 可以做到“自动化版 Chrome DevTools 深度采集 + AI 报告”，但不应在早期目标里追求复刻 Chrome DevTools 的完整交互式界面。

更合适的定位是：

```text
Chrome DevTools 用于人工调试
FrontScope 用于批量采集、归档、对比、解释和生成修复建议
```

## 当前覆盖情况

| DevTools 面板 | 当前状态 | 已有基础 | 主要缺口 |
| --- | --- | --- | --- |
| Lighthouse | 已接入第一版 | Lighthouse 分数、核心指标、异常审计项 | PWA 分类、审计详情归因、Markdown 解读 |
| Network | 已接入 V0.3 资源诊断 | failed requests、HTTP 4xx/5xx、资源体积、优先级、缓存命中率、慢请求、大资源 | 交互式瀑布图、阻塞链路分析、请求优先级优化建议 |
| Performance | 已接入 V0.4 报告式 Trace | trace 文件、long task、layout/style/paint/loading 摘要、layout shift | 交互式火焰图、完整调用栈树、用户操作过程 trace |
| Memory | 已接入实验版 | heap snapshot、detached DOM 统计、可选重载前后对比 | 用户操作脚本、retained size 深度对比、分配时间线 |
| History / Compare | 已接入基础版 | `history.json`、同 URL+扫描模式自动对比、Markdown/UI 变化摘要 | 历史列表、手动选择两次扫描、趋势图 |
| Rendering | 未接入 | 可通过 CDP/浏览器指标扩展 | FPS、paint/layout 指标、图层信息；绘制闪烁更适合人工 UI，不适合作为报告主指标 |

## 能力可行性

### 1. Performance 面板

可以做，但建议做成“报告式 Performance Trace”，不是完整火焰图编辑器。

第一阶段采集：

- Chrome trace 文件。
- long task 数量和最长耗时。
- scripting、rendering、painting、loading 粗分类耗时。
- layout shift 事件和 CLS 来源。
- main thread 长任务摘要。

第二阶段展示：

- 关键耗时阶段摘要。
- Top long tasks 列表。
- 可下载 trace 文件，必要时用 Chrome DevTools 打开。
- AI 根据 trace 摘要生成优化建议。

完整火焰图、调用栈树、逐帧交互分析可以做，但成本较高，建议放到后期。

### 2. Lighthouse 面板

当前已经具备基础版。

下一步应补：

- PWA 分类开关。
- 保存 audit details，避免只有标题没有证据。
- 把 Lighthouse 建议转换成中文 Markdown 小节。
- 多次运行取中位数，降低指标波动。

### 3. Memory 面板

可以通过 Chrome DevTools Protocol 做堆快照，但要谨慎推进。

建议路线：

- V1：手动触发 heap snapshot，保存 `.heapsnapshot` 文件。
- V2：同一页面执行两次快照，对比对象数量和 retained size。
- V3：支持用户配置操作脚本，执行前后对比，用于发现明显泄漏。

不建议早期承诺“自动判断所有内存泄漏”。内存泄漏需要业务操作路径，单纯打开页面很难得出可靠结论。

### 4. Network 面板

非常适合 FrontScope。

建议优先级高于 Memory：

- 请求瀑布图数据：startTime、dns、connect、ssl、ttfb、download。
- 资源类型、体积、状态码。
- cache 命中：fromDiskCache、fromMemoryCache。
- 请求失败和慢请求 Top 列表。
- 资源优先级和阻塞资源分析。

这些数据能直接进入 Markdown 报告，也容易变成 AI 可解释证据。

### 5. Rendering 面板

可以采集一部分指标，但不建议复刻视觉开关。

适合报告化的指标：

- FPS 或 dropped frames。
- layout/paint 次数。
- forced reflow 相关 trace 事件。
- CLS 和布局偏移来源。
- 图层数量和大图层提示。

不适合报告化的功能：

- 绘制闪烁高亮。
- 图层边界显示。

这些更适合人工调试时在浏览器里看，FrontScope 可以提供“打开调试模式”的辅助入口，但不应作为核心报告能力。

## 推荐迭代顺序

1. V0.1 修稳：部分失败报告、Markdown 报告、Lighthouse details、文档和测试。
2. V0.2 AI 报告：只基于证据输出 top issues、原因、建议、验证方法。
3. V0.3 Network 深化：瀑布图数据、缓存命中率、慢请求和大资源。
4. V0.4 Performance Trace：long task、layout shift、主线程耗时摘要，附 trace 文件。
5. V0.5 Project Quality And Local Code Review：typecheck、lint、依赖风险、无用依赖、循环依赖、本地代码逻辑与交互实现审查。
6. Memory 深化：用户操作脚本、retained size 深度对比、分配时间线。
7. History / Compare 深化：历史列表、手动选择两次扫描、趋势图，继续证明修复是否有效。

## 测试覆盖建议

当前测试覆盖了基础渲染、输入校验、package 扫描、运行时采集封装、扫描编排和 Chrome 路径解析，但还不够全面。

下一步建议补齐：

- API 层测试：`POST /api/scan` 成功、模块失败、非法输入。
- UI 交互测试：填写表单、提交、成功结果、失败结果。
- Lighthouse 解析测试：audit details、PWA 开关、失败降级。
- Network 解析测试：CDP 事件归并、缓存命中率、慢请求、大资源、失败请求。
- Performance Trace 解析测试：long task、layout/style/paint/loading 分类、layout shift、trace 文件保存。
- Markdown 报告快照测试：关键小节、模块异常、缺失模块。
- 端到端冒烟测试：启动本地 Vite 页面，通过 CLI 生成 `scan.json`、`report.md`、`screenshot.png`。

## 产品边界

短期不要追求“比肩 Chrome DevTools 完整功能”。更有价值的产品边界是：

- DevTools 擅长实时人工排查。
- FrontScope 擅长自动化采集、证据归档、AI 解读、报告导出和前后对比。
- **本地模式**读取项目证据；**线上模式**仅监测运行态，不扫描本地代码。

这个定位更容易做成可持续的小产品，也更适合前端工程师使用 AI 大模型额度形成个人竞争力。
