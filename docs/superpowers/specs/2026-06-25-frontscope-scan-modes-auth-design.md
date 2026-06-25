# FrontScope Scan Modes And Auth Profile Design

## 1. 背景

FrontScope 当前已经具备页面运行时、Lighthouse、Network、Performance Trace、项目依赖、AI 诊断、历史对比和 Markdown 报告能力。下一步产品边界需要更清晰：

- 本地开发者模式可以读取代码和项目配置，适合发现本地性能、依赖、代码质量和可维护性问题。
- 线上监测模式只能访问页面运行态，适合持续监测已部署页面的加载、网络、异常和回归。
- AI 诊断不应该让用户在扫描入口手填模型、密钥和请求头，这属于项目级配置。
- 视口桌面端和移动端不再作为核心扫描维度，扫描入口应更简洁。
- 线上内部页面常有登录权限，扫描时必须能复用登录态，否则实际扫描目标会变成登录页。

## 2. 产品定位

FrontScope 的目标拆成两个方向：

```text
本地模式：面向开发者的本地前端项目体检。
线上模式：面向已部署页面的性能与运行态监测。
```

两种模式共用证据优先原则：

```text
先采集证据，再生成结论。
没有证据，不输出 AI 诊断。
每条建议必须带验证方法。
```

## 3. 非目标

本轮不做完整云监控平台，不做多地域调度，不做 RUM SDK，不做移动端/桌面端双视口矩阵，不做完整 DevTools 交互式面板。

线上登录态只解决“本地工具扫描需要权限的页面”的问题，不负责绕过组织认证策略，也不保存用户密码。

## 4. 扫描模式

### 4.1 本地模式

本地模式用于开发阶段：

- 必填 `projectPath`。
- 必填 `url`，通常是 `http://localhost:5173/...`。
- 允许扫描本地代码、依赖、配置、类型检查、Lint、未使用依赖、循环依赖等项目质量证据。
- 页面运行态证据继续采集：Runtime、Network、Trace、Lighthouse、截图、历史对比。
- AI 诊断可以引用页面证据和项目证据。

本地模式的核心问题：

```text
这个本地前端项目哪里慢、哪里脆、哪里值得先优化？
```

### 4.2 线上模式

线上模式用于部署后页面：

- 必填 `url`。
- 不要求 `projectPath`。
- 不扫描本地代码和依赖。
- 采集页面运行态证据：Runtime、Network、Trace、Lighthouse、截图、历史对比。
- 支持选择认证配置文件，让扫描进入真实目标页面。
- AI 诊断只能引用运行态证据，不能输出“代码质量”结论。

线上模式的核心问题：

```text
这个线上页面现在是否真实可访问，加载和运行是否健康，是否出现回归？
```

## 5. 输入模型

新增 `scanMode`：

```ts
type ScanMode = "local" | "online";
```

推荐输入约束：

- `local`：必须提供 `projectPath`。
- `online`：允许不提供 `projectPath`；若提供也不用于本地项目质量扫描。
- `viewport`：从用户入口移除，内部默认 `desktop`，旧调用仍可传入以保持兼容。
- `enableAi`：由 UI 根据项目级 AI 配置默认决定，仍保留 API 开关用于测试和 CLI。
- `authStatePath`：由认证配置文件选择得到，报告中只展示 basename，不展示完整敏感路径。

## 6. 扫描入口简化

UI 第一层只保留：

- 模式切换：本地模式 / 线上模式。
- 目标地址。
- 本地模式项目路径。
- 线上模式认证配置文件。
- AI 诊断开关和配置状态。
- 输出目录和页面名称作为高级选项。

移除：

- 桌面端 / 移动端视口选择。
- 手动输入 AI baseURL、apiKey、model、auth header。
- 和本次扫描目标无关的配置项。

## 7. AI 配置策略

AI 配置属于项目级配置，来源按优先级合并：

1. `frontscope.config.json`
2. 环境变量
3. 代码默认值

扫描入口只展示状态：

- 已配置：默认开启 AI 诊断。
- 未配置：默认关闭，并提示到配置文件中补齐。
- 配置无效：显示错误，不允许把密钥输入到页面表单里临时覆盖。

这样可以避免密钥进入浏览器状态、历史记录、截图或报告。

## 8. 线上权限页面方案

### 8.1 Auth Profile

新增认证配置文件概念：

```text
.frontscope/auth/<profileName>.json
```

它保存 Playwright `storageState`，包含 cookie 和 localStorage，不保存密码。

生成流程：

1. 用户在 UI 中输入登录地址、目标地址和配置名。
2. 服务端调用 Playwright 启动非 headless 浏览器。
3. 用户在真实浏览器中手动登录，完成 SSO、MFA 或验证码。
4. 用户登录完成后继续流程，工具跳转到目标地址。
5. 保存 `storageState` 到 `.frontscope/auth/<profileName>.json`。
6. 线上扫描时选择该配置文件，扫描使用同一登录态打开目标地址。

### 8.2 目标命中检测

权限页面的关键风险是“扫描成功打开了页面，但不是目标页面”。因此线上模式必须强化目标命中检测：

- 记录 requested URL。
- 记录 final URL。
- 判断 final URL 是否与目标 URL 同源并且路径匹配。
- 如果 final URL 是登录页、SSO 页或路径明显偏离目标，报告中标记 `targetUrlMatched=false`。
- UI 顶部展示警告：当前结果可能是登录页，不代表目标页面。
- AI 诊断收到该证据后，应优先提示认证态失效或目标未命中。

本轮不强制让扫描失败，因为登录页自身的错误和性能仍可能有诊断价值；但报告必须明确区分。

## 9. API 设计

扫描接口保留现有 `/api/scan`，新增字段：

```json
{
  "scanMode": "local",
  "url": "http://localhost:5173/dashboard",
  "projectPath": "/path/to/project",
  "pageName": "dashboard",
  "outputDir": ".frontscope/reports",
  "authStatePath": ".frontscope/auth/admin.json",
  "enableAi": true
}
```

新增认证接口：

```text
POST /api/auth-profiles
```

请求：

```json
{
  "profileName": "internal-admin",
  "loginUrl": "https://example.com/login",
  "targetUrl": "https://example.com/admin/dashboard"
}
```

响应：

```json
{
  "profileName": "internal-admin",
  "authStatePath": ".frontscope/auth/internal-admin.json"
}
```

新增列表接口：

```text
GET /api/auth-profiles
```

用于 UI 选择已有认证配置文件。

## 10. 报告变化

`scan.json` 和 `report.md` 需要体现：

- 扫描模式。
- 是否采集项目质量证据。
- AI 配置状态。
- 是否使用认证配置文件。
- requested URL、final URL、目标是否命中。
- 线上模式下项目质量模块显示“未运行：线上模式无法读取本地代码”。

历史对比应按 `scanMode + url + pageName` 匹配，避免本地和线上结果混在一起。

## 11. 测试策略

测试重点：

- 输入校验：本地模式必须有 `projectPath`，线上模式允许没有。
- 默认视口：未传 `viewport` 时固定为 `desktop`。
- 运行逻辑：线上模式不执行本地项目质量扫描。
- AI 配置：UI 不再提交手写 AI 密钥，状态来自 `/api/ai/status`。
- Auth Profile：配置名安全校验、路径解析、保存 storageState。
- 目标命中：redirect 到登录页时生成明确 warning。
- 报告：模式、认证、目标命中和跳过模块都可读。

## 12. 风险与取舍

- Playwright 交互式登录流程会阻塞接口直到用户完成登录，因此 UI 必须显示“浏览器登录中”的状态。
- `storageState` 包含敏感 cookie，必须默认写入本地 `.frontscope/auth`，并建议加入 `.gitignore`。
- 线上页面若依赖复杂组织代理或设备证书，Auth Profile 只能复用浏览器态，不能替代网络环境。
- Lighthouse 在复用登录态场景下当前可能被跳过或受限，报告应明确标注模块状态。
- 移除视口入口会降低配置复杂度，但保留内部字段能兼容旧脚本。
