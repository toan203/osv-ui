# osv-ui-mcp

> MCP server for [osv-ui](https://github.com/toan203/osv-ui) — scan projects for CVEs inside Claude Desktop, Cursor, and more.

![OSV-UI Dashboard Summary](../../docs/mcp/dashboard.png)

## Why this exists

AI Agents (like Claude or Cursor) can write code, but they shouldn't always be trusted to "blindly" fix security vulnerabilities. 

**osv-ui-mcp** provides a **Human-in-the-loop** workflow:
1. The AI scans your project and finds vulnerabilities.
2. Instead of just showing text, it **opens a beautiful visual dashboard** in your browser.
3. You review the CVEs, severity, and suggested fixes in the UI.
4. You tell the AI: *"OK, fix exactly what I saw in the dashboard."*

![Human-in-the-loop Flow](../../docs/mcp/human-in-the-loop.webp)

## Comparison with others

| | osv-ui-mcp | StacklokLabs/osv-mcp | others |
|---|:---:|:---:|:---:|
| Auto-detect manifests | ✅ | ❌ manual query | ❌ |
| npm + Python + Go + Rust | ✅ | ✅ (query only) | partial |
| Visual dashboard (browser UI) | ✅ | ❌ | ❌ |
| Human-in-the-loop confirm | ✅ | ❌ | ❌ |
| Apply fixes from chat | ✅ | ❌ | ❌ |

## Install

```bash
npm install -g osv-ui-mcp
# also install osv-ui for the dashboard feature
npm install -g osv-ui
```

## Setup — Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "osv-ui": {
      "command": "osv-ui-mcp"
    }
  }
}
```

## Setup — Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "osv-ui": {
      "command": "osv-ui-mcp"
    }
  }
}
```

## Setup — Claude Code (npx, no install)

```bash
claude mcp add osv-ui -- npx osv-ui-mcp
```

## Usage

Just talk naturally in Claude or Cursor:

```
"Scan my project for CVEs"
"Are there any critical vulnerabilities in ./frontend?"
"Show me the fix commands for axios and lodash"
"Open the security dashboard so I can review before fixing"
"Fix all high severity vulnerabilities in ./api"
```

## Available MCP tools

### `scan_project`
Scan a directory for CVEs across all supported ecosystems.

```
scan_project({ path: "./", severity_filter: "high" })
```

Returns: full vulnerability report with risk score, CVE list, and fix recommendations.

### `open_dashboard`
Launch the osv-ui visual dashboard in your browser.

```
open_dashboard({ path: "./" })
```

This is the **human-in-the-loop step** — review the full dashboard before applying any fixes. The dashboard shows severity charts, CVE drill-down, and the upgrade guide.

### `get_fix_commands`
Get safe upgrade commands without executing them.

```
get_fix_commands({ path: "./", packages: ["axios", "lodash"] })
```

Returns: a table of current → safe version + commands to run.

### `apply_fixes`
Execute upgrade commands after your explicit confirmation.

```
apply_fixes({ path: "./", packages: ["axios", "lodash"] })
```

> ⚠️ Always review with `get_fix_commands` or `open_dashboard` before calling this.

## Human-in-the-loop flow

```
You:   "Scan my project for vulnerabilities and fix them"

AI:    scan_project("./")
       → "Found 28 CVEs: 1 HIGH, 2 MODERATE, 25 LOW.
          3 direct packages can be upgraded.
          Want me to open the dashboard to review first?"

You:   "Yes, show me the dashboard"

AI:    open_dashboard("./")
       → Browser opens with full osv-ui UI ✨

You:   [reviews dashboard, comes back]
       "Fix axios and lodash, skip next for now"

AI:    get_fix_commands({ packages: ["axios", "lodash"] })
       → "Will run:
          npm install axios@0.30.3  (fixes 4 CVEs)
          npm install lodash@4.17.23 (fixes 3 CVEs)
          Confirm?"

You:   "Yes, do it"

AI:    apply_fixes({ packages: ["axios", "lodash"] })
       → "✅ Done. 7 CVEs resolved."
```

## Monorepo usage

```
"Scan all services in my monorepo"
→ scan_project("./frontend")
→ scan_project("./api")
→ scan_project("./worker")
→ Summary: "Found CVEs in 2/3 services. Worst: api (risk score 67/100)"
```

## License

MIT
