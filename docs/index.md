---
layout: default
title: FrontScope - AI-Powered Frontend Health Checker
description: AI-driven frontend project health checker with local-first approach, authenticated page testing, and multi-framework support.
---

<div align="center">

# 🏥 FrontScope

**AI-Powered Frontend Health Checker**

[![GitHub Stars](https://img.shields.io/github/stars/zuoyifeng/FrontScope?style=social)](https://github.com/zuoyifeng/FrontScope/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/zuoyifeng/FrontScope?style=social)](https://github.com/zuoyifeng/FrontScope/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/zuoyifeng/FrontScope)](https://github.com/zuoyifeng/FrontScope/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/zuoyifeng/FrontScope)](https://github.com/zuoyifeng/FrontScope/pulls)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.1.0-green.svg)](package.json)

[English](#features) | [中文](#功能特性)

</div>

---

## 🌟 Overview

FrontScope is a local-first AI-powered frontend project health checker. It organizes page runtime evidence, project quality evidence, and AI diagnostics into reviewable health reports for frontend engineers and team maintainers.

<div align="center">
  <img src="https://github.com/zuoyifeng/FrontScope/raw/main/screenshot.png" alt="FrontScope Screenshot" width="800" />
</div>

## ✨ Features

### 🔍 Dual Scanning Modes

- **Local Mode**: Scan your development project with full code quality analysis
- **Online Mode**: Monitor deployed pages with runtime diagnostics

### 🔐 Authenticated Page Support

- Visual login state recording
- Login state verification and validation
- Lighthouse metrics with authentication (LCP/CLS/TBT/Speed Index)

### 🤖 AI-Powered Diagnostics

- Intelligent health report generation
- JSON truncation repair and retry mechanism
- Evidence-based diagnosis with automatic validation

### 📊 Comprehensive Metrics

- **Runtime**: Console errors, page exceptions, failed requests
- **Performance**: Lighthouse scores, Core Web Vitals
- **Network**: Resource sizes, cache hit rates, slow requests
- **Code Quality**: TypeScript checks, ESLint, dependency audits

### 🎯 Multi-Framework Support

- React, Vue, Angular, Next.js, Nuxt, and more
- Framework-specific route detection
- Adapter-based scanner architecture

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/zuoyifeng/FrontScope.git
cd FrontScope

# Install dependencies
pnpm install

# Install Playwright browsers
npx playwright install chromium
```

### Configuration

```bash
# Copy example config
cp frontscope.config.example.json frontscope.config.json

# Set your AI API key
export FRONTSCOPE_AI_API_KEY=your-api-key
```

### Run

```bash
# Start development server
pnpm dev

# Or run CLI scan
pnpm scan --url http://localhost:5173
```

## 📖 Documentation

- [README](https://github.com/zuoyifeng/FrontScope#readme) - Full documentation
- [Future Roadmap](https://github.com/zuoyifeng/FrontScope/blob/main/docs/frontscope-future-roadmap.md) - Planned features
- [Implementation Plan](https://github.com/zuoyifeng/FrontScope/blob/main/docs/frontscope-roadmap-implementation-plan.md) - Development roadmap

## 🛠️ Tech Stack

| Category | Technologies |
|----------|--------------|
| **Frontend** | React, TypeScript, Vite, Ant Design |
| **Backend** | Hono, Node.js |
| **Scanning** | Playwright, Lighthouse |
| **Testing** | Vitest |
| **Validation** | Zod |

## 📝 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📧 Contact

- GitHub: [@zuoyifeng](https://github.com/zuoyifeng)
- Repository: [FrontScope](https://github.com/zuoyifeng/FrontScope)

---

<div align="center">

**⭐ Star this repository if you find it helpful!**

[![GitHub Stars](https://img.shields.io/github/stars/zuoyifeng/FrontScope?style=social)](https://github.com/zuoyifeng/FrontScope/stargazers)

</div>
