<div align="center">
  
![osv-ui dashboard](./docs/screenshot.png)

# osv-ui

**npm、Python、Go、および Rust プロジェクト向けの、美しく構成不要な CVE ダッシュボード。**  
1 つのコマンド。登録不要。API キー不要。**100% ローカルで実行 — コードがマシンから離れることはありません。**

[🇻🇳 Tiếng Việt](README.vi.md) · [🇺🇸 English](README.md) · [🇨🇳 中文](README.zh.md) · [🇯🇵 日本語](README.ja.md)

[![npm version](https://img.shields.io/npm/v/osv-ui?color=red&label=npm)](https://www.npmjs.com/package/osv-ui)
[![npm downloads](https://img.shields.io/npm/dm/osv-ui?color=orange)](https://www.npmjs.com/package/osv-ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-blue)](https://nodejs.org)

</div>

---

## 課題

```bash
$ npm audit

# ... これが 300 行も続く ...
# moderate  Regular Expression Denial of Service in semver
# package   semver
# patched in >=7.5.2
# ...
# 12 vulnerabilities (3 moderate, 6 high, 3 critical)
```

誰もこの退屈なテキストを読みません。セキュリティは無視され、依存関係には脆弱性が残ったままになります。

## 解決策

```bash
npx osv-ui
```

→ ダッシュボードが開きます。すべての CVE、すべての修正、すべてのサービス。完了。

### なぜこれを使うのか？

- **ゼロ構成**: インストール不要、アカウント作成や API キーも不要です。
- **プライバシー第一**: 分析は 100% ローカルマシン上で行われます。
- **直感的かつ高速**: わずか数秒でリスクスコア、脆弱性チャート、詳細なアップグレードガイド（安全なバージョン）を表示します。
- **マルチプラットフォーム**: Node.js (npm)、Python、Go、および Rust をネイティブにサポートします。

---

## 主な機能

| | |
|---|---|
| 🟨 **npm** + 🐍 **Python** + 🔵 **Go** + 🦀 **Rust** | `package-lock.json`、`Pipfile.lock`、`poetry.lock`、`requirements.txt`、`go.sum`、`Cargo.lock` をスキャン |
| 📡 **ライブ CVE データ** | [OSV.dev](https://osv.dev) を使用 — NVD、GitHub Advisory、PyPI Advisory から毎日更新。**API キー不要。** |
| 🏢 **マルチサービス** | 1 つのコマンドでモノレポ全体をスキャン — フロントエンド、バックエンド、ワーカー、ML サービス |
| 💊 **修正ガイド** | Dependabot スタイルのアップグレード表：現在のバージョン → 安全なバージョン + ワンクリックコピーコマンド |
| 🔌 **内蔵 REST API** | `GET /api/data` または CLI エクスポート・フラグを使用して、独自のセキュリティ・ダッシュボードを構築可能 |
| 🎯 **リスクスコア** | サービスごとに 0–100 のスコアを付与し、どこを優先的に修正すべきかを可視化 |
| 🔍 **CVE 詳細** | 各行をクリックして詳細を表示：CVSS スコア、説明、NVD リンク、GitHub Advisory リンク |
| 🌙 **ダークモード** | 昼夜を問わず、目に優しいセキュリティ監査を実現 |

---

## クイックスタート

**現在のディレクトリをスキャン：**
```bash
npx osv-ui
```

**モノレポ（複数のサービスを一度に）をスキャン：**
```bash
npx osv-ui ./frontend ./api ./worker ./ml-service
```

**現在のディレクトリ下のすべてのサービスを自動検出：**
```bash
npx osv-ui -d
```

**`package.json` のスクリプトに追加：**
```json
{
  "scripts": {
    "audit:ui":  "npx osv-ui",
    "audit:all": "npx osv-ui ./frontend ./api ./worker"
  }
}
```

```
--discover, -d  サポートされているマニフェストを含むサービスディレクトリを自動検索
--port=2003     カスタムポートを使用（デフォルト: 2003）
--json[=file]   レポートを JSON として保存（デフォルト: osv-report.json）
--html[=file]   レポートを HTML として保存（デフォルト: osv-report.html）
--no-open       ブラウザを自動的に開かない
--offline       OSV.dev への問い合わせをスキップ — マニフェストの解析のみ実行
-h, --help      ヘルプメッセージを表示
```

### 🤖 AIエージェント統合 (MCP)

`osv-ui` は [Model Context Protocol (MCP)](https://modelcontextprotocol.io) サーバーになりました。これにより、**Claude Desktop**、**Cursor**、**Claude Code** などの AI エージェントが次のことを実行できるようになります。
1. プロジェクトの CVE を**自動的にスキャン**します。
2. **ビジュアルダッシュボードを開いて**、結果を確認できます (Human-in-the-loop)。
3. 明示的な確認の後、**修正を適用**します。

**クイックセットアップ (npx):**
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
詳細なセットアップ手順については、[MCP パッケージの README](packages/mcp/README.md) を参照してください。

---

### 🔌 強力な内蔵 API

`osv-ui` は単なるダッシュボードではなく、セキュリティデータ・エンジンです。  
ダッシュボードの実行中に、プロジェクト全体の生のセキュリティデータを取得できます：

```bash
# すべてのサービスの完全な JSON ペイロードを取得
curl http://localhost:2003/api/data

# カスタムスクリプトで使用する
curl -s http://localhost:2003/api/data | jq '.[0].vulns'
```

---

## サポートされているマニフェストファイル

| エコシステム | ファイル |
|-----------|-------|
| **npm** | `package-lock.json` (lockfileVersion 1, 2, 3) |
| **Python** | `requirements.txt` · `Pipfile.lock` · `poetry.lock` · `pyproject.toml` |
| **Go** | `go.sum` |
| **Rust** | `Cargo.lock` |

さらに多くのエコシステムを開発中 — [ロードマップ](#ロードマップ)をご覧ください。

---

## 仕組み

```
プロジェクトファイル
    │
    ├─ package-lock.json   ──┐
    ├─ Pipfile / poetry    ──┤──► 解析器 (parser) ──► パッケージリスト
    ├─ go.sum / Cargo.lock ──┘
                                     │
                                     ▼
                             OSV.dev バッチ API (無料、キー不要)
                                     │
                                     ▼
                             CVE 一致 + 修正バージョン
                                     │
                                     ▼
                          Express サーバー → ブラウザダッシュボード
                               http://localhost:2003
```

CVE データは **[OSV.dev](https://osv.dev)** から提供されます。これは Google が管理する無料のオープンデータベースで、以下を集計しています：
- 🇺🇸 [NVD](https://nvd.nist.gov) — NIST 米国国家脆弱性データベース
- 🐙 [GitHub Advisory Database](https://github.com/advisories) (GHSA)
- 🐍 [PyPI Advisory Database](https://github.com/pypa/advisory-database)
- 📦 npm Advisory Database
- 🦀 RustSec · Go Vuln DB · OSS-Fuzz · など

**毎日**更新。アカウント不要。回数制限なし。ベンダーロックインなし。

---

## 他のツールとの比較

| | **osv-ui** | `npm audit` | Snyk | Dependabot |
|---|:---:|:---:|:---:|:---:|
| ビジュアルダッシュボード | ✅ | ❌ ターミナルのみ | ✅ | ✅ |
| npm サポート | ✅ | ✅ | ✅ | ✅ |
| Python サポート | ✅ | ❌ | ✅ | ✅ |
| 複数サービスの一括表示 | ✅ | ❌ | ✅ (有料版) | ✅ |
| サインアップ不要 | ✅ | ✅ | ❌ | ❌ |
| **GitLab Free 版** で動作 | ✅ | ✅ | ❌ | ❌ |
| セルフホスト / ローカル動作 | ✅ | ✅ | ❌ | ❌ |
| 修正コマンド | ✅ | 一部 | ✅ | ✅ |
| オープンソース | ✅ | ✅ | ❌ | ❌ |

---

## GitLab CI — 重大な CVE 検出時にデプロイをブロック

GitLab Free 版で Dependabot が使えませんか？ `.gitlab-ci.yml` に以下を追加してください：

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
          console.error('ブロックされました: ' + crit + ' 件の重大な CVE があります。実行: npx osv-ui');
          process.exit(1);
        }
        console.log('OK: 重大な脆弱性はありません');
      "
  artifacts:
    paths: [/tmp/audit.json]
    when: always
```

---

## 実行要件

- **Node.js** >= 16
- OSV.dev への問い合わせのためのインターネット接続 — または `--offline` を使用
- npm プロジェクト: `package-lock.json` を生成するために、まず `npm install` を実行してください
- Python プロジェクト: 上記のリストに含まれるマニフェストファイル

---

## ロードマップ

すべての貢献を歓迎します。機能開発を行いたい場合は、調整のためにまず Issue を開いてください。

- [x] **Go サポート** — `go.sum` / `go.mod` の解析
- [x] **Rust サポート** — `Cargo.lock` の解析
- [x] **レポートのエクスポート** — HTML / JSON として保存
- [x] **ダークモード** — 目に優しいダッシュボード UI
- [ ] **Java / Maven** — `pom.xml` の解析
- [ ] **GitHub Actions** — PR に CVE 差分コメントを投稿
- [ ] **SBOM エクスポート** — CycloneDX / SPDX 形式
- [ ] **ウォッチモード** — マニフェスト変更時に自動再スキャン
- [ ] **Slack / Webhook** — 重大な CVE の新着を通知

---

## 貢献 (Contributing)

このプロジェクトはコミュニティによって構築されています。あらゆるスキルレベルを歓迎します。

**Good first issue** (深い知識を必要としません):
- Java または Maven のマニフェスト解析器を追加 (`pom.xml`) — `src/parsers.js` のパターンに従ってください
- 解析器のユニットテストを作成
- Python 解析器のエッジケースを改善

```bash
# クローンしてローカルで実行
git clone https://github.com/toan203/osv-ui
cd osv-ui
npm install

# 自分のプロジェクトに対して実行
node bin/cli.js /path/to/your/project

# 複数のサービスに対して実行
node bin/cli.js ./backend ./frontend
```

コードスタイルや PR プロセスについては [CONTRIBUTING.md](CONTRIBUTING.md) をお読みください。

---

## ライセンス (License)

[MIT](LICENSE) — 自由に使用、フォーク、埋め込み、拡張が可能です。

---

<div align="center">

osv-ui はあなたのプロジェクトで本物の CVE を見つけましたか？  
⭐ を付けることで、他の開発者がこのツールを見つけやすくなります。

[![Sponsor this project](https://img.shields.io/badge/Sponsor-this%20project-lightgrey?style=flat-square&logo=ko-fi)](https://ko-fi.com/P5P31W9W6A)

**[Twitter で共有](https://twitter.com/intent/tweet?text=Just%20found%20osv-ui%20%E2%80%94%20a%20beautiful%20one-command%20CVE%20dashboard%20for%20npm%20%26%20Python.%20Free%2C%20no%20signup%3A%20npx%20osv-ui%20%F0%9F%94%A5&url=https://github.com/toan203/osv-ui)** · **[Reddit に投稿](https://reddit.com/submit?url=https://github.com/toan203/osv-ui&title=osv-ui%20%E2%80%94%20visual%20CVE%20dashboard%20for%20npm%20%26%20Python%2C%20one%20command%2C%20no%20signup)**

</div>
