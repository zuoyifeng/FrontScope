# FrontScope

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.1.0-green.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vitejs.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-e66a00.svg)](https://playwright.dev/)
[![Lighthouse](https://img.shields.io/badge/Lighthouse-12-f44b21.svg)](https://developer.chrome.com/docs/lighthouse/)
[![AI Powered](https://img.shields.io/badge/AI-Powered-ff69b4.svg)](#ai-配置)

🏥 **FrontScope** - AI 驱动的前端项目健康检查工具 | 本地优先 | 支持登录态页面 | 多框架兼容 | 智能诊断报告

FrontScope 是一个本地优先的前端项目 AI 体检工具。它面向前端工程师和团队维护者，把页面运行证据、项目质量证据和 AI 诊断组织成可复查的健康报告。

> Project status: early-stage open source. Core scanning/reporting is usable, but authenticated route coverage, cross-framework static analysis, and zero-config local project execution are still on the roadmap.

当前框架使用 React、Vite、TypeScript、Ant Design 和 Vitest。它已经具备本地证据采集和 AI 诊断报告基础能力：

- 使用 Playwright 做运行时诊断（运行时错误、网络、Performance Trace 在同一会话内只加载页面一次采集）。
- 使用 Lighthouse 做性能审计。
- 使用 Chrome trace 做 Performance Trace 诊断。
- 使用 Chrome DevTools Protocol 做 Network 资源诊断。
- 从 `package.json` 读取项目元信息。
- 项目质量诊断：tsc 类型检查、ESLint、依赖漏洞审计、无用代码（Knip）、循环依赖（Madge），以及内置 AST 本地代码审查。
- 基于采集证据生成 Markdown 体检报告。
- 可通过 mock provider 验证 AI 诊断链路。
- 支持本地扫描历史索引；同 URL 与扫描模式复扫时会自动生成“与上次扫描对比”。
- 支持本地模式与线上模式；线上模式可复用登录态配置扫描权限页面，并支持可视化登录态录制与登录态验证。
- 登录态场景下 Lighthouse 会通过 Playwright 注入 `storageState` 采集 LCP/CLS/TBT 等核心指标。
- 线上扫描对大屏/持续轮询页面更稳健：页面会话与内存诊断使用 `domcontentloaded`，Performance Trace 超时不致拖垮 API。
- AI 诊断支持 JSON 截断修复、证据 id 自动校正与失败重试，适配证据较多的线上页面。

## 产品方向

FrontScope 围绕三个长期方向构建：

1. **登录态页面诊断**：可靠地扫描本地和生产环境中的受保护路由，避免误测登录页。
2. **框架无关的前端健康检查**：通过适配器架构支持 React、Vue、Angular、Next.js、Nuxt、Solid 及原生 JavaScript/TypeScript 项目。
3. **零配置本地项目模式**：接受本地项目目录，自动推断安装和运行方式，发现重要路由，并提示用户选择监测页面。

## 扫描模式

FrontScope 提供两种扫描模式，共用“先采集证据、再生成结论”的原则。

### 本地模式

面向开发阶段的前端项目体检：

- **必填**：项目路径（`projectPath`）、页面地址（`url`，通常是 `http://localhost:5173/...`）。
- **采集**：页面运行态证据（Runtime、Network、Trace、Lighthouse、截图）+ 本地项目证据（依赖、类型检查、Lint、未使用依赖、循环依赖、本地代码审查）。
- **AI 诊断**：可引用页面证据与项目证据。

核心问题：这个本地前端项目哪里慢、哪里脆、哪里值得先优化？

### 线上模式

面向已部署页面的运行态监测：

- **必填**：页面地址（`url`）。
- **不要求**项目路径；即使传入也不会扫描本地代码与依赖。
- **采集**：页面运行态证据（Runtime、Network、Trace、Lighthouse、截图、历史对比）。
- **可选**：选择 `.frontscope/auth/` 下的登录态配置，用于扫描需要登录或有权限控制的目标页面。
- **登录态 + Lighthouse**：选中登录态后仍会运行 Lighthouse，并复用 cookie/localStorage 采集 LCP/CLS/TBT/Speed Index；若 Lighthouse 在大屏轮询页失败，报告会展示 Performance Trace 的 Long Task 与 Layout Shift 近似指标。
- **AI 诊断**：引用运行态证据（运行时、Network、Trace、Lighthouse 等），不输出本地代码质量类结论；证据较多时会自动压缩并重试解析。

核心问题：这个线上页面现在是否真实可访问，加载和运行是否健康，是否出现回归？

> **注意**：线上模式无法读取本地代码、依赖或项目配置文件。若需要项目质量诊断，请使用本地模式。

扫描入口已简化，不再要求选择显示尺寸；内部固定使用 `desktop` 布局。CLI 的 `--viewport` 参数仅用于旧脚本兼容，不属于主要扫描输入。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

### 3. 配置 AI（推荐）

AI 配置属于**项目级配置**，请在 **FrontScope 安装目录**（运行 `pnpm dev` / `pnpm scan` 时的当前工作目录）的 `frontscope.config.json` 或环境变量中完成，**不要在扫描表单中填写密钥**。

本地模式扫描时：若被扫描的前端项目目录下也有 `frontscope.config.json`，其中的 `ai` 字段会**叠加覆盖**工具目录配置；若被扫描项目没有该文件，则仅使用 FrontScope 安装目录的配置（与页面顶部「AI 配置已就绪」检测一致）。

```bash
cp frontscope.config.example.json frontscope.config.json
```

推荐示例（完整字段见 `frontscope.config.example.json`）：

```json
{
  "ai": {
    "provider": "openai",
    "baseURL": "https://api.example.com/v1",
    "model": "gpt-4.1-mini"
  }
}
```

将 `FRONTSCOPE_AI_API_KEY` 写入环境变量（例如 `export FRONTSCOPE_AI_API_KEY=sk-...`），或在配置文件的密钥字段使用 `${FRONTSCOPE_AI_API_KEY}` 从环境变量引用，避免把密钥写进文件。`frontscope.config.json` 已加入 `.gitignore`，避免误提交。

配置完成后，可在扫描表单中点击 **「测试 AI 接口联通」**：会向配置的 Chat Completions 端点发送一次最小 `ping` 请求，验证鉴权、模型与网络是否真正可用（不仅检查配置文件是否存在）。

配置优先级：环境变量 `FRONTSCOPE_AI_*` > `frontscope.config.json` > 内置默认值。可用环境变量包括 `FRONTSCOPE_AI_PROVIDER`、`FRONTSCOPE_AI_BASE_URL`、`FRONTSCOPE_AI_MODEL`、`FRONTSCOPE_AI_API_KEY`、`FRONTSCOPE_CONFIG`（指定配置文件路径）。

### 4. 启动开发环境

一条命令同时启动前端与 API：

```bash
pnpm dev
```

- 前端：http://localhost:5173
- API：http://localhost:3001

若只需单独调试，可使用 `pnpm dev:web`（仅前端）或 `pnpm dev:api`（仅 API）。

### 5. 使用扫描功能

1. 在浏览器中打开 http://localhost:5173
2. 选择扫描模式：**本地模式** 或 **线上模式**
3. 输入页面地址（例如：`http://localhost:5173` 或 `https://example.com/admin`）
4. **本地模式**：填写项目路径（例如：`/path/to/your/frontend-project`）
5. **线上模式**：如需扫描权限页面，选择或新建 `.frontscope/auth/` 下的登录态配置（推荐「可视化登录态录制」）
6. 可选：对已保存的登录态点击「验证登录态」，确认当前页面地址仍可访问
7. 根据 AI 配置状态决定是否开启“生成 AI 诊断”（已配置时默认开启）
8. 查看右侧 **体检就绪度** 面板，确认扫描前检查已通过
9. 点击“开始扫描”

右侧工作台会随表单与扫描结果实时更新：

- **扫描进度**：扫描启动后展示真实步骤进度（页面会话、Lighthouse、项目质量、内存、AI、报告），并高亮当前正在监测的项；前端每 500ms 轮询 `/api/scan/progress/:id`。
- **证据采集模块**：按当前模式与选项展示将采集 / 采集中 / 已采集 / 已跳过 / 采集失败等状态；扫描进行中会与进度步骤联动更新。
- **体检就绪度**：扫描前检查页面地址、API 服务、项目路径（本地模式）与 AI 配置（开启时）；扫描完成后改为统计各证据模块的采集完成度，不再使用 Lighthouse 性能分冒充就绪度。

扫描完成后，将显示扫描结果，包括：
- 扫描模式与目标命中状态
- 运行时错误数量
- 失败请求数量
- Lighthouse 性能分数与核心指标（LCP/CLS/TBT/Speed Index；登录态场景同样采集）
- Performance Trace 文件、Long Task 数、Layout Shift 数（Lighthouse 失败时部分指标以 Trace 近似展示）
- Network 请求数、失败数、缓存命中率、慢请求数和总传输体积
- 包管理器和框架特征（仅本地模式）
- JSON 证据文件路径
- Markdown 体检报告路径

## 登录态配置

线上模式扫描权限页面时，使用 Playwright `storageState` 保存登录态：

```text
.frontscope/auth/<profileName>.json
```

这些文件包含 cookie 与 localStorage，属于**本地敏感认证状态**，已加入 `.gitignore`，请勿提交到版本库。

### 可视化登录态录制

权限页面推荐使用可视化登录态录制：

1. 在线上模式填写目标页面地址。
2. 点击“新建登录态配置”。
3. 输入配置名称、登录页地址、目标页地址。
4. 点击“开始登录录制”，FrontScope 会打开一个真实浏览器窗口。
5. 在浏览器中手动完成登录、验证码、MFA 或企业 SSO。
6. 回到 FrontScope 点击“我已完成登录，验证并保存”。
7. 保存成功后，后续扫描选择该登录态配置即可复用 cookie、localStorage 和 sessionStorage。

FrontScope 不识别或破解验证码；验证码、MFA、SSO 都由用户在真实浏览器中手动完成。若验证后仍跳转登录页，说明登录态未生效或账号无目标页权限，需要重新录制或更换账号。

录制相关 API（需配置 `security.apiToken` 时携带 Bearer Token）：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth-profiles/recordings` | 启动可视化录制（body: `profileName`, `loginUrl`, `targetUrl`） |
| `POST` | `/api/auth-profiles/recordings/:id/complete` | 验证目标页并保存 `storageState` |
| `POST` | `/api/auth-profiles/recordings/:id/cancel` | 取消录制并关闭浏览器 |
| `POST` | `/api/auth-profiles/:profileName/verify` | 用已有登录态验证指定 `targetUrl` |

旧版 `POST /api/auth-profiles`（直接调用 Playwright Inspector 脚本流）仍保留兼容，UI 默认走可视化录制流程。

本版本本地模式仍要求用户提供项目路径和已启动的服务地址。自动上传源码、自动沙盒运行项目、自动选择路由属于后续路线图，不在当前版本范围内。

CLI 也可通过 `--auth-state` 传入：

```bash
pnpm scan --url https://example.com/admin/dashboard --auth-state /absolute/path/to/.frontscope/auth/admin.json
```

最小登录态生成脚本示例：

```js
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://example.com/login');
await page.pause();
await context.storageState({ path: '.frontscope/auth/admin.json' });
await browser.close();
```

执行脚本后会打开浏览器。手动登录到目标账号，并确认能访问目标页面后，在 Playwright Inspector 中点击继续，脚本会保存当前 Cookie、localStorage 等登录态。扫描结果页会展示“目标页是否命中”：如果最终地址仍落到登录页，会在顶部提示“未命中目标页面”。

当前限制：使用 `--auth-state` 时，运行时、Network、Performance Trace、Memory 与 Lighthouse 均会复用登录态。大屏/监控类页面若持续轮询，Lighthouse 可能偏慢或偶发失败；此时 Performance Trace 仍会提供 Long Task 与 Layout Shift 近似指标，不建议对该类页面开启内存诊断，除非确有需要。

### 大屏与持续轮询页面建议

- 目标页若为数据大屏、实时看板或 WebSocket 轮询页，FrontScope 仍可完成运行时、Network、Trace 与（多数情况下）Lighthouse 采集。
- 内存诊断对这类页面仍可能偏慢，默认建议关闭「内存诊断」。
- 若 AI 诊断失败，可在报告 AI Tab 查看 `error` 与原始返回预览；常见原因是模型输出 JSON 被截断，FrontScope 已内置修复与重试，仍失败时请检查模型配额或换更短证据的页面复扫。

更大的限制是：如果一个 Web 项目的关键业务页面都在权限路由后面，FrontScope 目前仍需要用户手动提供目标 URL 和登录态。未来会引入路由发现和认证态路由批量验证，让本地与线上模式都能更可靠地发现并监测受保护页面。

## CLI 使用

也可以使用命令行工具进行扫描：

```bash
# 本地模式（提供 --project）
pnpm scan --project /path/to/project --url http://localhost:5173 --name 首页

# 线上模式（不提供 --project）
pnpm scan --url https://example.com --name 首页
```

启用内存诊断（较慢，采集堆快照；`--memory-reload-rounds` 大于 0 时执行重载前后对比）：

```bash
pnpm scan --url http://localhost:5173 --memory --memory-reload-rounds 5
```

验证 AI 诊断链路时，可以使用本地 mock provider：

```bash
pnpm scan --project /path/to/project --url http://localhost:5173 --name 首页 --mock-ai
```

启用 AI 诊断（读取 `frontscope.config.json` 或环境变量，不在 CLI 参数中传递密钥）：

```bash
# 读取当前目录的 frontscope.config.json
pnpm scan --project /path/to/project --url http://localhost:5173 --name 首页 --ai

# 指定配置文件路径
pnpm scan --url https://example.com --ai --config /path/to/frontscope.config.json
```

AI 配置缺失或调用失败时，扫描仍会完成并生成基础报告，AI 异常会记录在 `scan.json` 与 `report.md` 的模块状态中。

### 安全配置

FrontScope 默认面向本地使用，但 API 服务存在被本机其它网页或局域网调用的风险。可在 `frontscope.config.json` 的 `security` 段加固：

```json
{
  "security": {
    "apiToken": "${FRONTSCOPE_API_TOKEN}",
    "allowedOrigins": ["http://localhost:5173", "http://127.0.0.1:5173"],
    "allowPrivateNetwork": true,
    "allowedProjectRoots": [],
    "allowedOutputRoots": [],
    "allowedUrlHosts": []
  }
}
```

默认行为与说明：

- API 服务仅绑定 `127.0.0.1`（可用 `FRONTSCOPE_API_HOST` 覆盖），局域网无法访问。
- `apiToken` 配置后，扫描、扫描进度、登录态配置和 AI 联通测试等敏感接口需携带 `Authorization: Bearer <token>`；未配置时仅放行同源/允许来源请求。
- `allowedOrigins` 限制浏览器跨域请求来源，防止任意网页触发扫描。
- `allowPrivateNetwork` 默认 `true` 以支持扫描本地开发服务器；部署到远端或多用户环境时应设为 `false`，会拒绝内网/回环地址（始终拒绝云元数据地址 `169.254.169.254`）。
- `allowedUrlHosts` 非空时作为 URL 主机硬白名单。
- `allowedProjectRoots` / `allowedOutputRoots` 非空时，限制可扫描的项目路径与报告输出目录，防止任意文件读取/写入；为空表示本地受信任模式（CLI 默认）。

扫描成功后会在单次报告目录生成：

```text
frontscope-reports/
  2026-06-23_18-30-45-shou-ye/   # 本地时间 YYYY-MM-DD_HH-mm-ss + 页面名称 slug
    scan.json
    report.md
    screenshot.png
```

同时会在输出根目录维护 `history.json`，用于下一次同 URL 与扫描模式复扫时生成对比。

如果某个采集模块失败，FrontScope 会尽量保留其他模块已经采集到的证据，并在 `scan.json` 与 `report.md` 中记录模块异常。

AI 诊断遵循证据约束：每条 AI 问题应引用已采集的 evidence id。解析时会自动丢弃无效 id、尝试修复被截断的 JSON，并在证据过多时重试；仍无法解析时记录为 AI 模块异常，扫描报告与其它证据不受影响。

除摘要外，每条 AI 问题会输出可执行的优化信息：

- **修复方向**（`suggestion`）：一句话说明应改什么。
- **优化策略**（`optimizationDirection`）：目标、思路、预期收益与注意事项。
- **实施步骤**（`implementationSteps`）：2–8 条可落地操作，尽量具体到文件/配置/命令。
- **代码/配置提示**（`codeHints`，可选）：伪代码、配置片段或改造示例。
- **验证方法**（`verifyMethod`）：复扫或指标对比方式。

UI 报告与 `report.md` 均按上述结构展示；旧版扫描结果缺少新字段时仍可正常渲染。

## 测试

运行所有测试：

```bash
pnpm test
```

## 构建

构建生产版本：

```bash
pnpm build
```

## 技术栈

- **前端**: React + TypeScript + Vite + Ant Design
- **后端**: Hono + Node.js
- **扫描**: Playwright + Lighthouse
- **验证**: Zod
- **测试**: Vitest

## 项目结构

```
frontscope/
├── src/                    # 前端代码
│   ├── App.tsx            # 主应用组件
│   ├── features/          # 功能模块
│   └── ...
├── scanner/               # 扫描器代码
│   ├── cli.ts             # CLI 入口
│   ├── types.ts           # 类型定义
│   ├── auth/              # 登录态配置、可视化录制、验证
│   ├── scan/              # 扫描编排与进度
│   ├── scanners/          # 页面会话、Lighthouse、Network 等
│   ├── ai/                # 证据压缩与 AI 诊断
│   └── report/            # 报告生成
├── server/                # API 服务
│   ├── api.ts             # API 路由
│   └── index.ts           # 服务入口
├── .frontscope/
│   ├── auth/              # 登录态配置（敏感，已 gitignore）
│   └── reports/           # 扫描报告输出
└── ...
```

## 功能特性

- ✅ 运行时诊断：控制台错误、页面异常、失败请求
- ✅ 登录态配置：`.frontscope/auth/` 存储 Playwright `storageState`；支持可视化录制、验证并保存、已有配置复验
- ✅ 性能审计：Lighthouse 评分与 LCP/CLS/TBT/Speed Index（含登录态场景）
- ✅ Performance Trace：保存 trace 文件、识别长任务、渲染/绘制/加载耗时、布局偏移
- ✅ Network 资源诊断：资源体积、缓存命中率、慢请求、大资源、失败请求
- ✅ 项目扫描：依赖分析、框架检测（仅本地模式）
- ✅ Markdown 报告：输出可读体检报告
- ✅ AI 诊断链路：OpenAI 兼容 provider、mock provider、结构化校验、证据 id 约束、截断 JSON 修复与失败重试
- ✅ 项目质量诊断：TypeScript 类型检查、ESLint、依赖漏洞审计（pnpm/npm audit）、无用代码（Knip）、循环依赖（Madge），缺失工具自动跳过并提示安装（仅本地模式）
- ✅ 本地 Code Review：内置 AST 规则（列表 key 缺失/下标作 key、dangerouslySetInnerHTML 等），零外部依赖（仅本地模式）
- ✅ Memory 诊断：CDP 堆快照、detached DOM 统计、可选重载前后对比，仅输出"疑似+验证方法"（页面加载策略为 `domcontentloaded`，适配持续轮询页）
- ✅ 扫描历史与对比：输出目录维护 `history.json`，同 URL 与扫描模式复扫时在 JSON、Markdown 和 UI 中展示指标变化
- ✅ 本地/线上双模式：本地模式读取项目证据，线上模式专注运行态监测并支持登录态配置与大屏页扫描
- ⚠️ 权限路由覆盖：可复用登录态扫描指定 URL 并验证命中，尚不能自动发现受保护路由全集
- ⚠️ 框架覆盖：页面运行态扫描适用于多数 Web 项目；本地代码质量和 AST 规则仍以 React/TypeScript 为主，跨框架适配在路线图中
- ⚠️ 本地零配置运行：当前需要填写项目路径和服务 URL；未来目标是拖入/选择项目目录后自动沙盒运行、发现路由并提示选择监测页面

## Known Gaps And Roadmap

### 1. Authenticated Route Coverage

Current state:

- Online mode can reuse a Playwright `storageState` file via UI visual recording or CLI `--auth-state`.
- Visual recorder opens a headed browser for manual login (captcha/MFA/SSO), then verifies the target URL before saving.
- Existing profiles can be re-verified against the current scan URL.
- Lighthouse runs with the same login state to collect LCP/CLS/TBT/Speed Index on protected pages.
- Target mismatch detection warns when the browser lands on a login or unauthorized page.
- Users still need to provide each protected URL manually.

Planned work:

- Auth Profile lifecycle: refresh schedules, expiry warnings, and batch re-verification.
- Authenticated route discovery: scan route manifests, sitemap files, framework route folders, and runtime navigation links after login.
- Route verification at scale: distinguish target page, login page, unauthorized page, blank shell, and redirect loops.
- Monitoring sets: save groups of protected routes as repeatable scan targets.

### 2. Cross-Framework Project Quality

Current state:

- Runtime, Network, Trace, Lighthouse, Memory, and screenshot evidence are framework-agnostic.
- Package detection can identify several framework hints.
- Local AST review rules are strongest for React/TypeScript projects.

Planned adapters:

- React / Next.js: JSX rules, route extraction, bundle and hydration hints.
- Vue / Nuxt: SFC parsing, template rules, route extraction, Pinia/Vue Router hints.
- Angular: workspace detection, router config parsing, template checks.
- Solid: JSX rules adapted for Solid primitives and routing patterns.
- JavaScript-only projects: Babel/Acorn parsing path for projects without TypeScript.

### 3. Zero-Config Local Project Mode

Current state:

- Local mode requires `projectPath` and a running service URL.
- Project quality checks run against the provided local folder.

Planned workflow:

```text
drop/select folder
-> detect package manager, framework, scripts, env needs, and routes
-> install or reuse dependencies in a sandbox/cache
-> start the app on an isolated port
-> discover likely route candidates
-> ask user which routes to monitor
-> scan selected routes and produce a report set
```

Key constraints:

- Never mutate the target project without explicit consent.
- Run scripts with clear sandbox boundaries and timeouts.
- Ask before using secrets, env files, backend endpoints, or destructive commands.
- Keep a manual fallback when auto-run detection fails.

## DevTools 深度能力路线

FrontScope 的方向不是复制 Chrome DevTools 的完整交互式面板，而是通过 Playwright、Lighthouse 和 Chrome DevTools Protocol 自动采集关键证据，再输出适合 AI 分析和团队评审的报告。

详细能力拆解见 [docs/devtools-capability-roadmap.md](docs/devtools-capability-roadmap.md)。

## Scripts

```bash
pnpm install
pnpm dev          # 同时启动前端与 API
pnpm dev:web      # 仅启动前端
pnpm dev:api      # 仅启动 API
pnpm test         # 运行测试
pnpm build        # 构建生产版本
pnpm scan         # 使用 CLI 扫描
```
