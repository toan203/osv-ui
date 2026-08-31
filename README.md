<div align="center">

![osv-ui dashboard](./docs/screenshot.png)

# osv-ui

**A beautiful, zero-config visual CVE dashboard for npm, Python, Go, Rust, Java, PHP, and Ruby projects.**  
One command. No signup. No API key. **Runs 100% locally — your code never leaves your machine.**

[![npm version](https://img.shields.io/npm/v/osv-ui?color=red&label=npm)](https://www.npmjs.com/package/osv-ui)
[![npm version (mcp)](https://img.shields.io/npm/v/osv-ui-mcp?color=blue&label=mcp)](https://www.npmjs.com/package/osv-ui-mcp)
[![npm downloads](https://img.shields.io/npm/dm/osv-ui?color=orange)](https://www.npmjs.com/package/osv-ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-blue)](https://nodejs.org)

[🇻🇳 Tiếng Việt](README.vi.md) · [🇺🇸 English](README.md) · [🇨🇳 中文](README.zh.md) · [🇯🇵 日本語](README.ja.md)

</div>

---

## The problem

```bash
$ npm audit

# ... 300 lines of this ...
# moderate  Regular Expression Denial of Service in semver
# package   semver
# patched in >=7.5.2
# ...
# 12 vulnerabilities (3 moderate, 6 high, 3 critical)
```

Nobody reads that. Security gets ignored. Dependencies stay vulnerable.

## The solution

```bash
npx osv-ui
```

→ Opens a dashboard. Every CVE, every fix, all your services. Done.

### Why give it a try?

- **Zero-config**: No complex setup, no signup, no API key required.
- **Privacy First**: Analysis is done 100% on your machine.
- **Fast & Visual**: Real-time Risk Scores, vulnerability charts, and clear upgrade guides in seconds.
- **Multi-platform**: Native support for Node.js (npm), Python, Go, Rust, Java, PHP, and Ruby.

---

## Features

| | |
|---|---|
| 🌐 **Multi-Ecosystem** | Scans `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Pipfile.lock`, `poetry.lock`, `requirements.txt`, `go.sum`, `Cargo.lock`, `pom.xml`, `composer.lock`, `Gemfile.lock` |
| 📡 **Live CVE data** | Powered by [OSV.dev](https://osv.dev) — updated daily from NVD, GitHub Advisory, PyPI Advisory. **No API key.** |
| 🏢 **Multi-service** | Scan your entire monorepo in one command — frontend, backend, workers, ML services |
| 💊 **Fix guide** | Dependabot-style upgrade table: current version → safe version + one-click copy command |
| 🔌 **Built-in REST API** | Power your own security dashboards with `GET /api/data` or CLI export flags |
| 🎯 **Risk score** | 0–100 per service so you know where to focus first |
| 🔍 **CVE drill-down** | Click any row — CVSS score, description, NVD link, GitHub Advisory link |
| 🌙 **Dark Mode** | Eye-friendly security audits, day or night |

---

## Quick start

**Scan current directory:**
```bash
npx osv-ui
```

**Scan a monorepo (multiple services at once):**
```bash
npx osv-ui ./frontend ./api ./worker ./ml-service
```

**Auto-discover all services under the current directory:**
```bash
npx osv-ui -d
```

**Add to your `package.json` scripts:**
```json
{
  "scripts": {
    "audit:ui":  "npx osv-ui",
    "audit:all": "npx osv-ui ./frontend ./api ./worker"
  }
}
```

```
--discover, -d    Auto-find service dirs that contain a supported manifest
--port=2003       Use a custom port (default: 2003)
--json[=file]     Save report as JSON without opening browser (defaults to osv-report.json)
--html[=file]     Save report as HTML without opening browser (defaults to osv-report.html)
--cyclonedx[=file] Save CycloneDX SBOM JSON (defaults to osv-sbom.cdx.json)
--spdx[=file]     Save SPDX SBOM JSON (defaults to osv-sbom.spdx.json)
--baseline=file   Compare with a previous --json report
--markdown[=file] Save a Markdown PR/comment report (defaults to osv-report.md)
--fail-on=level   Exit non-zero for critical/high/moderate/low findings
--webhook-url=url POST matching findings to a webhook
--webhook-severity=level Webhook threshold (default: critical)
--watch           Keep dashboard running and re-scan when manifests change
--no-open         Don't auto-open the browser
--offline         Skip OSV.dev lookup — parse manifests only
-h, --help        Show help message
```

### 🤖 AI Agent Integration (MCP)

`osv-ui` is now a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server. This allows AI agents like **Claude Desktop**, **Cursor**, and **Claude Code** to:
1. **Scan your project** for CVEs automatically.
2. **Open the visual dashboard** for you to review findings (Human-in-the-loop).
3. **Apply fixes** after your explicit confirmation.

**Quick setup (npx):**
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
See the [MCP Package README](packages/mcp/README.md) for detailed setup instructions.

---

### 🔌 Powerful built-in API

`osv-ui` isn't just a dashboard; it's a security data engine.  
Once the dashboard is running, you can pull the raw security data for your whole project:

```bash
# Get full JSON payload for all services
curl http://localhost:2003/api/data

# Use it in your custom scripts
curl -s http://localhost:2003/api/data | jq '.[0].vulns'
```

### CI reports, PR diffs, and SBOMs

Generate machine-readable reports without opening the browser:

```bash
npx osv-ui -d --json=osv-report.json --markdown=osv-report.md --cyclonedx=sbom.cdx.json --spdx=sbom.spdx.json --no-open
```

Compare a PR scan against a baseline report and fail on newly introduced high+ findings:

```bash
npx osv-ui -d --json=current.json --baseline=main-osv-report.json --markdown=osv-pr.md --fail-on=high --no-open
```

Minimal GitHub Actions flow:

```yaml
name: osv-ui
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npx osv-ui -d --json=current.json --markdown=osv-pr.md --cyclonedx=sbom.cdx.json --fail-on=high --no-open
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: osv-ui-report
          path: |
            current.json
            osv-pr.md
            sbom.cdx.json
```

Send new critical findings to a webhook:

```bash
npx osv-ui -d --baseline=main-osv-report.json --webhook-url="$SECURITY_WEBHOOK_URL" --webhook-severity=critical --json=current.json
```

---

## Supported manifest files

| Ecosystem | Files |
|-----------|-------|
| **npm / JS** | `package-lock.json` · `pnpm-lock.yaml` · `yarn.lock` |
| **Python** | `requirements.txt` · `Pipfile.lock` · `poetry.lock` · `pyproject.toml` · `uv.lock` |
| **Go** | `go.sum` |
| **Rust** | `Cargo.lock` |
| **Java** | `pom.xml` (Maven) |
| **PHP** | `composer.json` · `composer.lock` |
| **Ruby** | `Gemfile` · `Gemfile.lock` |

More ecosystems coming — see [Roadmap](#roadmap).

---

## How it works

```
Your project files
    │
    ├─ package-lock.json   ──┐
    ├─ Pipfile / poetry    ──┤──► parser ──► package list
    ├─ go.sum / Cargo.lock ──┘
                                    │
                                    ▼
                             OSV.dev batch API  (free, no key)
                                    │
                                    ▼
                             CVE matches + fix versions
                                    │
                                    ▼
                         Express server → browser dashboard
                              http://localhost:2003
```

CVE data comes from **[OSV.dev](https://osv.dev)** — a free, open database maintained by Google that aggregates:
- 🇺🇸 [NVD](https://nvd.nist.gov) — NIST National Vulnerability Database
- 🐙 [GitHub Advisory Database](https://github.com/advisories) (GHSA)
- 🐍 [PyPI Advisory Database](https://github.com/pypa/advisory-database)
- 📦 npm Advisory Database
- 🦀 RustSec · Go Vuln DB · OSS-Fuzz · and more

Updated **daily**. No account. No rate limit. No vendor lock-in.

---

## Works great alongside osv-scanner (Google)

osv-ui and [osv-scanner](https://github.com/google/osv-scanner) use the same 
OSV.dev data source. osv-ui adds the visual layer that osv-scanner lacks:
- Browser dashboard instead of terminal output
- Multi-service sidebar
- Dependabot-style upgrade guide with copy commands

---

## vs alternatives

| | **osv-ui** | `npm audit` | Snyk | Dependabot |
|---|:---:|:---:|:---:|:---:|
| Visual dashboard | ✅ | ❌ terminal only | ✅ | ✅ |
| npm support | ✅ | ✅ | ✅ | ✅ |
| Python support | ✅ | ❌ | ✅ | ✅ |
| Multi-service in one view | ✅ | ❌ | ✅ paid | ✅ |
| No signup required | ✅ | ✅ | ❌ | ❌ |
| Works on **GitLab Free** | ✅ | ✅ | ❌ | ❌ |
| Self-hosted / local | ✅ | ✅ | ❌ | ❌ |
| Fix commands | ✅ | partial | ✅ | ✅ |
| Open source | ✅ | ✅ | ❌ | ❌ |

---

## GitLab CI — block deploys on critical CVEs

No Dependabot on GitLab Free? Add this to `.gitlab-ci.yml`:

```yaml
audit:
  stage: test
  image: node:24-alpine
  script:
    - npm audit --json > /tmp/audit.json || true
    - |
      node -e "
        const r = require('/tmp/audit.json');
        const crit = Object.values(r.vulnerabilities || {})
          .filter(v => v.severity === 'critical').length;
        if (crit > 0) {
          console.error('BLOCKED: ' + crit + ' critical CVE(s). Run: npx osv-ui');
          process.exit(1);
        }
        console.log('OK: no critical vulnerabilities');
      "
  artifacts:
    paths: [/tmp/audit.json]
    when: always
```

---

## Requirements

- **Node.js** >= 22
- Internet access for OSV.dev queries — or use `--offline`
- npm projects: run `npm install` first so `package-lock.json` exists
- Python projects: any of the supported manifest files listed above

---

## Roadmap

All contributions are welcome. If you want to work on something, open an issue first so we can coordinate.

- [x] **Go support** — parse `go.sum` / `go.mod`
- [x] **Rust support** — parse `Cargo.lock`
- [x] **Java / Maven** — parse `pom.xml`
- [x] **PHP / Composer** — parse `composer.lock`
- [x] **Ruby / Bundler** — parse `Gemfile.lock`
- [x] **Export report** — save as HTML / JSON
- [x] **Dark mode** — eye-friendly dashboard UI
- [x] **GitHub Actions / CI diff** — generate Markdown PR comments and fail on new CVEs
- [x] **SBOM export** — CycloneDX / SPDX format
- [x] **Watch mode** — re-scan on manifest file changes
- [x] **Slack / webhook** — notify on new critical CVEs
- [ ] **Parser hardening** — Maven property inheritance, lockfile edge cases, workspace layouts
- [ ] **Live dashboard refresh** — push watch-mode updates to an open browser tab without reload

---

## Contributing

This project is built by the community. All skill levels welcome.

**Good first issues:**
- Write unit tests for the parsers
- Improve Python parser edge cases
- Improve Maven/Gradle and workspace parser edge cases

```bash
# Clone and run locally
git clone https://github.com/toan203/osv-ui
cd osv-ui
npm install

# Run against your own project
node bin/cli.js /path/to/your/project

# Run against multiple services
node bin/cli.js ./frontend ./backend
```

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for code style and PR process.

---

## License

[MIT](LICENSE) — use it, fork it, embed it, build on it. Attribution appreciated but not required.

---

<div align="center">

Did osv-ui catch a real CVE in your project?  
A ⭐ helps other developers find this tool.

[![Sponsor this project](https://img.shields.io/badge/Sponsor-this%20project-lightgrey?style=flat-square&logo=ko-fi)](https://ko-fi.com/P5P31W9W6A)

**[Share on Twitter](https://twitter.com/intent/tweet?text=Just%20found%20osv-ui%20%E2%80%94%20a%20beautiful%20one-command%20CVE%20dashboard%20for%20npm%20%26%20Python.%20Free%2C%20no%20signup%3A%20npx%20osv-ui%20%F0%9F%94%A5&url=https://github.com/toan203/osv-ui)** · **[Post on Reddit](https://reddit.com/submit?url=https://github.com/toan203/osv-ui&title=osv-ui%20%E2%80%94%20visual%20CVE%20dashboard%20for%20npm%20%26%20Python%2C%20one%20command%2C%20no%20signup)**

</div>
