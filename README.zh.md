<div align="center">
  
![osv-ui dashboard](./docs/screenshot.png)

# osv-ui

**一款美观、零配置的 npm、Python、Go 和 Rust 项目 CVE 仪表板。**  
一条命令。无需注册。无需 API 密钥。**100% 本地运行 — 您的代码绝不会离开您的机器。**

[🇻🇳 Tiếng Việt](README.vi.md) · [🇺🇸 English](README.md) · [🇨🇳 中文](README.zh.md) · [🇯🇵 日本語](README.ja.md)

[![npm version](https://img.shields.io/npm/v/osv-ui?color=red&label=npm)](https://www.npmjs.com/package/osv-ui)
[![npm downloads](https://img.shields.io/npm/dm/osv-ui?color=orange)](https://www.npmjs.com/package/osv-ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-blue)](https://nodejs.org)

</div>

---

## 问题

```bash
$ npm audit

# ... 这里有 300 行 ...
# moderate  Regular Expression Denial of Service in semver
# package   semver
# patched in >=7.5.2
# ...
# 12 vulnerabilities (3 moderate, 6 high, 3 critical)
```

没人会读这些枯燥的文字。安全问题被忽视。依赖项仍然存在漏洞。

## 解决方案

```bash
npx osv-ui
```

→ 打开一个直观的仪表板。每一个 CVE，每一个修复方案，涵盖你所有的服务。搞定。

### 为什么要尝试使用？

- **零配置**：无需安装、无需创建帐户或 API Key。
- **隐私至上**：分析过程 100% 在您的本地机器上完成。
- **直观且快速**：几秒钟内即可显示风险评分、漏洞图表和详细的升级指南（安全版本）。
- **支持多平台**：原生支持 Node.js (npm)、Python、Go 和 Rust。

---

## 功能特性

| | |
|---|---|
| 🟨 **npm** + 🐍 **Python** + 🔵 **Go** + 🦀 **Rust** | 扫描 `package-lock.json`、`Pipfile.lock`、`poetry.lock`、`requirements.txt`、`go.sum`、`Cargo.lock` |
| 📡 **实时 CVE 数据** | 由 [OSV.dev](https://osv.dev) 提供支持 — 每天从 NVD、GitHub Advisory、PyPI Advisory 更新。**无需 API 密钥。** |
| 🏢 **多服务扫描** | 一条命令扫描整个 monorepo — 前端、后端、workers、ML 服务 |
| 💊 **修复指南** | Dependabot 风格的升级表：当前版本 → 安全版本 + 一键复制命令 |
| 🔌 **内置 REST API** | 使用 `GET /api/data` 或 CLI 导出标志，构建自有的安全仪表板 |
| 🎯 **风险评分** | 为每个服务提供 0–100 的评分，让您知道该优先修复哪里 |
| 🔍 **CVE 详情** | 点击任意行查看详情：CVSS 评分、描述、NVD 链接、GitHub Advisory 链接 |
| 🌙 **深色模式** | 无论昼夜，提供更舒适的安全审计体验 |

---

## 快速开始

**扫描当前目录：**
```bash
npx osv-ui
```

**扫描 monorepo（同时扫描多个服务）：**
```bash
npx osv-ui ./frontend ./api ./worker ./ml-service
```

**自动发现当前目录下的所有服务：**
```bash
npx osv-ui -d
```

**添加到你的 `package.json` 脚本中：**
```json
{
  "scripts": {
    "audit:ui":  "npx osv-ui",
    "audit:all": "npx osv-ui ./frontend ./api ./worker"
  }
}
```

**所有选项：**
```
--discover, -d  自动查找包含受支持清单文件的服务目录
--port=2003     使用自定义端口（默认：2003）
--json[=file]   将报告保存为 JSON（默认：osv-report.json）
--html[=file]   将报告保存为 HTML（默认：osv-report.html）
--no-open       不自动打开浏览器
--offline       跳过 OSV.dev 查询 — 仅解析清单文件
-h, --help      显示帮助信息
```

### 🤖 AI 智能体集成 (MCP)

`osv-ui` 现在是一个 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 服务器。这允许像 **Claude Desktop**, **Cursor**, 和 **Claude Code** 这样的 AI 智能体：
1. **自动扫描项目** 中的 CVE 漏洞。
2. **打开可视化仪表板** 供你查看发现（人机回环/Human-in-the-loop）。
3. **在经过你明确确认后应用修复**。

**快速设置 (npx):**
```json
{
  "mcpServers": {
    "osv-ui": {
      "command": "npx",
      "args": ["-y", "osv-ui-mcp"]
    }
  }
}
```
有关详细设置说明，请参阅 [MCP 软件包 README](packages/mcp/README.md)。

---

### 🔌 强大的内置 API

`osv-ui` 不仅仅是一个仪表板；它还是一个安全数据引擎。  
当仪表板运行时，您可以获取整个项目的原始安全数据：

```bash
# 获取所有服务的完整 JSON 数据
curl http://localhost:2003/api/data

# 在您的自定义脚本中使用
curl -s http://localhost:2003/api/data | jq '.[0].vulns'
```

---

## 支持的清单文件

| 生态系统 | 文件 |
|-----------|-------|
| **npm** | `package-lock.json` (lockfileVersion 1, 2, 3) |
| **Python** | `requirements.txt` · `Pipfile.lock` · `poetry.lock` · `pyproject.toml` |
| **Go** | `go.sum` |
| **Rust** | `Cargo.lock` |

更多生态系统即将推出 — 请参阅 [路线图](#路线图)。

---

## 工作原理

```
项目文件
    │
    ├─ package-lock.json   ──┐
    ├─ Pipfile / poetry    ──┤──► 解析器 (parser) ──► 软件包列表
    ├─ go.sum / Cargo.lock ──┘
                                     │
                                     ▼
                             OSV.dev 批量 API (免费，无需密钥)
                                     │
                                     ▼
                             CVE 匹配 + 修复版本
                                     │
                                     ▼
                          Express 服务器 → 浏览器仪表板
                               http://localhost:2003
```

CVE 数据来自 **[OSV.dev](https://osv.dev)** — 一个由 Google 维护的免费开放数据库，汇总了：
- 🇺🇸 [NVD](https://nvd.nist.gov) — 美国国家漏洞数据库
- 🐙 [GitHub Advisory Database](https://github.com/advisories) (GHSA)
- 🐍 [PyPI Advisory Database](https://github.com/pypa/advisory-database)
- 📦 npm Advisory Database
- 🦀 RustSec · Go Vuln DB · OSS-Fuzz · 等等

**每日**更新。无需账号。无速率限制。无供应商锁定。

---

## 与其他方案的比较

| | **osv-ui** | `npm audit` | Snyk | Dependabot |
|---|:---:|:---:|:---:|:---:|
| 直观仪表板 | ✅ | ❌ 仅限终端 | ✅ | ✅ |
| 支持 npm | ✅ | ✅ | ✅ | ✅ |
| 支持 Python | ✅ | ❌ | ✅ | ✅ |
| 一处查看多服务 | ✅ | ❌ | ✅ (付费) | ✅ |
| 无需注册 | ✅ | ✅ | ❌ | ❌ |
| 适用于 **GitLab 免费版** | ✅ | ✅ | ❌ | ❌ |
| 自托管 / 本地运行 | ✅ | ✅ | ❌ | ❌ |
| 修复命令 | ✅ | 部分 | ✅ | ✅ |
| 开源 | ✅ | ✅ | ❌ | ❌ |

---

## GitLab CI — 在出现严重 CVE 时阻止部署

在 GitLab 免费版上没有 Dependabot？将此内容添加到 `.gitlab-ci.yml`：

```yaml
audit:
  stage: test
  image: node:20-alpine
  script:
    - npm audit --json > /tmp/audit.json || true
    - |
      node -e "
        const r = require('/tmp/audit.json');
        const crit = Object.values(r.vulnerabilities || {})
          .filter(v => v.severity === 'critical').length;
        if (crit > 0) {
          console.error('已阻止：发现 ' + crit + ' 个严重 CVE。请运行：npx osv-ui');
          process.exit(1);
        }
        console.log('OK：无严重漏洞');
      "
  artifacts:
    paths: [/tmp/audit.json]
    when: always
```

---

## 运行要求

- **Node.js** >= 16
- 访问互联网以进行 OSV.dev 查询 — 或使用 `--offline`
- npm 项目：先运行 `npm install` 以生成 `package-lock.json`
- Python 项目：上述清单列表中的任何文件

---

## 路线图

欢迎所有贡献。如果你想开发某个功能，请先开启一个 issue，以便我们进行协调。

- [x] **Go 支持** — 解析 `go.sum` / `go.mod`
- [x] **Rust 支持** — 解析 `Cargo.lock`
- [x] **导出报告** — 保存为 HTML / JSON
- [x] **深色模式** — 护眼的仪表板 UI
- [ ] **Java / Maven** — 解析 `pom.xml`
- [ ] **GitHub Actions** — 在 PR 上发布 CVE 差异评论
- [ ] **SBOM 导出** — CycloneDX / SPDX 格式
- [ ] **监听模式** — 清单文件更改时自动重新扫描
- [ ] **Slack / webhook** — 新出现的严重 CVE 通知

---

## 贡献 (Contributing)

本项目由社区构建。欢迎各种技能水平的开发者。

**适合入门的 Issue (Good first issue):**
- 添加 Java/Maven 解析器 (`pom.xml`) — 请参考 `src/parsers.js` 中的模式
- 为解析器编写单元测试
- 改进 Python 解析器的边缘情况处理

```bash
# 克隆并在本地运行
git clone https://github.com/toan203/osv-ui
cd osv-ui
npm install

# 针对你自己的项目运行
node bin/cli.js /path/to/your/project

# 针对多个服务运行
node bin/cli.js ./backend ./frontend
```

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 以了解代码风格和 PR 流程。

---

## 开源协议 (License)

[MIT](LICENSE) — 随意使用、克隆、嵌入或二次开发。

---

<div align="center">

osv-ui 是否在你的项目中发现了真实的 CVE？  
一颗 ⭐ 能帮助其他开发者发现这个工具。

[![Sponsor this project](https://img.shields.io/badge/Sponsor-this%20project-lightgrey?style=flat-square&logo=ko-fi)](https://ko-fi.com/P5P31W9W6A)

**[在 Twitter 分享](https://twitter.com/intent/tweet?text=Just%20found%20osv-ui%20%E2%80%94%20a%20beautiful%20one-command%20CVE%20dashboard%20for%20npm%20%26%20Python.%20Free%2C%20no%20signup%3A%20npx%20osv-ui%20%F0%9F%94%A5&url=https://github.com/toan203/osv-ui)** · **[在 Reddit 发布](https://reddit.com/submit?url=https://github.com/toan203/osv-ui&title=osv-ui%20%E2%80%94%20visual%20CVE%20dashboard%20for%20npm%20%26%20Python%2C%20one%20command%2C%20no%20signup)**

</div>
