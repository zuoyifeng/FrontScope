# FrontScope

FrontScope 是一个本地优先的前端项目 AI 体检工具。

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
- 支持本地模式与线上模式；线上模式可复用登录态配置扫描权限页面。

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
- **AI 诊断**：仅引用运行态证据，不输出代码质量类结论。

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
5. **线上模式**：如需扫描权限页面，选择或新建 `.frontscope/auth/` 下的登录态配置
6. 根据 AI 配置状态决定是否开启“生成 AI 诊断”（已配置时默认开启）
7. 查看右侧 **体检就绪度** 面板，确认扫描前检查已通过
8. 点击“开始扫描”

右侧工作台会随表单与扫描结果实时更新：

- **扫描进度**：扫描启动后展示真实步骤进度（页面会话、Lighthouse、项目质量、内存、AI、报告），并高亮当前正在监测的项；前端每 500ms 轮询 `/api/scan/progress/:id`。
- **证据采集模块**：按当前模式与选项展示将采集 / 采集中 / 已采集 / 已跳过 / 采集失败等状态；扫描进行中会与进度步骤联动更新。
- **体检就绪度**：扫描前检查页面地址、API 服务、项目路径（本地模式）与 AI 配置（开启时）；扫描完成后改为统计各证据模块的采集完成度，不再使用 Lighthouse 性能分冒充就绪度。

扫描完成后，将显示扫描结果，包括：
- 扫描模式与目标命中状态
- 运行时错误数量
- 失败请求数量
- Lighthouse 性能分数
- Performance Trace 文件、Long Task 数、Layout Shift 数
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

在 UI 中可通过“新建登录态配置”向导生成：输入登录地址与目标地址后，在弹出的浏览器中手动完成登录，工具会保存当前会话到 `.frontscope/auth/`。

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

当前限制：使用 `--auth-state` 时，运行时、Network、Performance Trace 和 Memory 会复用登录态；Lighthouse 模块暂时跳过，避免它用无登录态会话误测登录页。

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
- `apiToken` 配置后，`POST /api/scan` 需携带 `Authorization: Bearer <token>`；未配置时仅放行同源/允许来源请求。
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

AI 诊断遵循证据约束：每条 AI 问题必须引用已采集的 evidence id，否则诊断会被拒绝并记录为 AI 模块异常。

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
│   ├── scan/              # 扫描逻辑
│   ├── scanners/          # 扫描器实现
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
- ✅ 性能审计：Lighthouse 评分、核心指标
- ✅ Performance Trace：保存 trace 文件、识别长任务、渲染/绘制/加载耗时、布局偏移
- ✅ Network 资源诊断：资源体积、缓存命中率、慢请求、大资源、失败请求
- ✅ 项目扫描：依赖分析、框架检测（仅本地模式）
- ✅ Markdown 报告：输出可读体检报告
- ✅ AI 诊断链路：通过 `frontscope.config.json` 配置 OpenAI 兼容 provider、mock provider、结构化输出校验和证据约束
- ✅ 项目质量诊断：TypeScript 类型检查、ESLint、依赖漏洞审计（pnpm/npm audit）、无用代码（Knip）、循环依赖（Madge），缺失工具自动跳过并提示安装（仅本地模式）
- ✅ 本地 Code Review：内置 AST 规则（列表 key 缺失/下标作 key、dangerouslySetInnerHTML 等），零外部依赖（仅本地模式）
- ✅ Memory 诊断：CDP 堆快照、detached DOM 统计、可选重载前后对比，仅输出"疑似+验证方法"
- ✅ 扫描历史与对比：输出目录维护 `history.json`，同 URL 与扫描模式复扫时在 JSON、Markdown 和 UI 中展示指标变化
- ✅ 本地/线上双模式：本地模式读取项目证据，线上模式专注运行态监测并支持登录态配置

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
