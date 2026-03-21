#!/usr/bin/env node
/**
 * osv-ui-mcp — MCP server with human-in-the-loop UI confirmation
 *
 * Tools:
 *   scan_project      — parse manifests + query OSV.dev → structured CVE report
 *   open_dashboard    — launch osv-ui browser dashboard (human review step)
 *   get_fix_commands  — list safe upgrade commands without executing
 *   apply_fixes       — execute fixes AFTER user confirms
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { execSync, spawn } from 'child_process';

import { scanService } from 'osv-ui/src/scanner.js';

// ── Running dashboard instances (path → { port, pid }) ──────────────────────
const runningDashboards = new Map();
let nextPort = 2003;

// ── Server definition ────────────────────────────────────────────────────────
const server = new Server(
  { name: 'osv-ui-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ─────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'scan_project',
      description:
        'Scan a project directory for CVE vulnerabilities. ' +
        'Automatically detects npm (package-lock.json), Python (requirements.txt / Pipfile.lock / poetry.lock), ' +
        'Go (go.sum), and Rust (Cargo.lock) manifests. ' +
        'Queries live CVE data from OSV.dev. ' +
        'Returns structured vulnerability report with severity counts, risk score, and fix recommendations. ' +
        'Use this as the first step before open_dashboard or apply_fixes.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the project directory. Defaults to current working directory.',
          },
          severity_filter: {
            type: 'string',
            enum: ['all', 'critical', 'high', 'moderate', 'low'],
            description: 'Only return vulnerabilities at this severity or above. Default: all.',
          },
          offline: {
            type: 'boolean',
            description: 'If true, skip OSV.dev query and only parse manifests. Default: false.',
          },
        },
      },
    },
    {
      name: 'open_dashboard',
      description:
        'Launch the osv-ui visual dashboard in the browser for human review. ' +
        'This is the HUMAN-IN-THE-LOOP step — always offer this before applying fixes. ' +
        'The dashboard shows full CVE details, severity charts, and the upgrade guide. ' +
        'Returns the dashboard URL. If already running for this path, returns existing URL.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the project directory to display in the dashboard.',
          },
          port: {
            type: 'number',
            description: 'Port to run the dashboard on. Default: auto-assigned starting from 2003.',
          },
        },
      },
    },
    {
      name: 'get_fix_commands',
      description:
        'Get the safe upgrade commands for vulnerable packages WITHOUT executing them. ' +
        'Use this to show the user what will be changed before calling apply_fixes. ' +
        'Returns a list of commands grouped by ecosystem (npm install / pip install).',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the project directory.',
          },
          packages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: only return fix commands for these package names. If omitted, returns all fixable packages.',
          },
          severity_filter: {
            type: 'string',
            enum: ['all', 'critical', 'high', 'moderate', 'low'],
            description: 'Only return fixes for this severity or above. Default: all.',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'apply_fixes',
      description:
        'Execute package upgrade commands to fix CVEs. ' +
        'IMPORTANT: This is a DESTRUCTIVE action that modifies package files. ' +
        'ALWAYS call get_fix_commands first and confirm with the user before calling this. ' +
        'Returns the command output for each fix applied.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the project directory.',
          },
          packages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Package names to fix. Must be explicit — never fix all without user confirmation.',
          },
          dry_run: {
            type: 'boolean',
            description: 'If true, print commands without executing. Useful for final confirmation step.',
          },
        },
        required: ['path', 'packages'],
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'scan_project': return await handleScanProject(args);
      case 'open_dashboard': return await handleOpenDashboard(args);
      case 'get_fix_commands': return await handleGetFixCommands(args);
      case 'apply_fixes': return await handleApplyFixes(args);
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error in ${name}: ${err.message}` }],
      isError: true,
    };
  }
});

// ── scan_project ─────────────────────────────────────────────────────────────
async function handleScanProject({ path: dir = '.', severity_filter = 'all', offline = false }) {
  const absDir = resolve(dir);
  if (!existsSync(absDir)) {
    return err(`Directory not found: ${absDir}`);
  }

  const result = await scanService(absDir, { noOsv: offline });
  const sevOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
  const filterRank = sevOrder[severity_filter] ?? 4;

  const filtered = result.vulns.filter(v => (sevOrder[v.severity] ?? 4) <= filterRank);

  // Build a clean, LLM-readable summary
  const lines = [
    `## CVE Scan: ${result.name}`,
    `**Directory:** ${absDir}`,
    `**Ecosystem:** ${result.ecosystem}`,
    `**Packages scanned:** ${result.totalPackages} (${result.directCount} direct)`,
    `**Risk score:** ${result.riskScore}/100`,
    '',
    '### Vulnerability summary',
    `| Severity | Count |`,
    `|----------|-------|`,
    `| 🔴 Critical | ${result.severity.critical} |`,
    `| 🟠 High     | ${result.severity.high} |`,
    `| 🟡 Moderate | ${result.severity.moderate} |`,
    `| 🔵 Low      | ${result.severity.low} |`,
    `| **Total**   | **${result.vulns.length}** |`,
    '',
  ];

  if (filtered.length === 0) {
    lines.push(severity_filter === 'all'
      ? '✅ No vulnerabilities found!'
      : `✅ No ${severity_filter}+ vulnerabilities found.`);
  } else {
    lines.push(`### Vulnerabilities (${filtered.length}${severity_filter !== 'all' ? ` filtered to ${severity_filter}+` : ''})`);
    lines.push('');
    for (const v of filtered.slice(0, 30)) {
      const fix = v.fixedIn ? `→ fix: **${v.fixedIn}**` : '→ no fix available';
      const type = v.isDirect ? 'direct' : 'transitive';
      lines.push(`- **[${v.severity.toUpperCase()}]** \`${v.packageName}@${v.packageVersion}\` (${type}) — ${v.title} (${v.cveId || v.id}) ${fix}`);
    }
    if (filtered.length > 30) {
      lines.push(`\n_... and ${filtered.length - 30} more. Use open_dashboard for full list._`);
    }

    // Fixable direct packages
    const fixable = getFixableGroups(result.vulns);
    if (fixable.length > 0) {
      lines.push('');
      lines.push(`### Quick wins — ${fixable.length} direct package(s) can be upgraded`);
      for (const f of fixable) {
        lines.push(`- \`${f.name}\` ${f.currentVersion} → **${f.fixVersion}** (fixes ${f.cveCount} CVE${f.cveCount > 1 ? 's' : ''}): \`${f.command}\``);
      }
    }
  }

  lines.push('');
  lines.push('> 💡 Call `open_dashboard` to review in a visual UI before applying any fixes.');

  return ok(lines.join('\n'));
}

// ── open_dashboard ────────────────────────────────────────────────────────────
async function handleOpenDashboard({ path: dir = '.', port }) {
  const absDir = resolve(dir);

  // Already running?
  const existing = runningDashboards.get(absDir);
  if (existing) {
    const url = `http://localhost:${existing.port}`;
    try { const { default: open } = await import('open'); await open(url); } catch {}
    return ok(`Dashboard already running at ${url}\n\nThe osv-ui dashboard is now open in your browser. Review the vulnerabilities and upgrade guide, then come back and tell me which packages you want to fix.`);
  }

  const assignedPort = port || nextPort++;
  const osvUiBin = findOsvUiBin();

  if (!osvUiBin) {
    return err(
      'osv-ui CLI not found. Install it first:\n\n  npm install -g osv-ui\n\nThen retry open_dashboard.'
    );
  }

  // Spawn osv-ui detached with discovery enabled
  const child = spawn(
    process.execPath,
    [osvUiBin, '-d', absDir, `--port=${assignedPort}`, '--no-open'],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
  runningDashboards.set(absDir, { port: assignedPort, pid: child.pid });

  // Wait for server to be ready
  await waitForPort(assignedPort, 8000);

  const url = `http://localhost:${assignedPort}`;
  try { const { default: open } = await import('open'); await open(url); } catch {}

  return ok(
    `✅ Dashboard launched at ${url}\n\n` +
    `The osv-ui dashboard is now open in your browser.\n\n` +
    `**Review the vulnerabilities and upgrade guide**, then come back here and tell me:\n` +
    `- Which packages you want to upgrade\n` +
    `- Or just say "fix all critical and high" and I'll prepare the commands for your approval.`
  );
}

// ── get_fix_commands ──────────────────────────────────────────────────────────
async function handleGetFixCommands({ path: dir = '.', packages, severity_filter = 'all' }) {
  const absDir = resolve(dir);
  const result = await scanService(absDir, { noOsv: false });
  const sevOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
  const filterRank = sevOrder[severity_filter] ?? 4;

  const fixable = getFixableGroups(result.vulns, packages, filterRank);

  if (fixable.length === 0) {
    return ok('No fixable vulnerabilities found' + (packages ? ` for packages: ${packages.join(', ')}` : '') + '.');
  }

  const lines = [
    `## Fix commands for ${result.name}`,
    '',
    `The following ${fixable.length} package(s) can be upgraded to fix CVEs:`,
    '',
    '| Package | Current | Safe version | Fixes | Command |',
    '|---------|---------|-------------|-------|---------|',
  ];

  for (const f of fixable) {
    lines.push(`| \`${f.name}\` | ${f.currentVersion} | **${f.fixVersion}** | ${f.cveCount} CVE(s) | \`${f.command}\` |`);
  }

  lines.push('');
  lines.push('⚠️ **Review before running.** Call `apply_fixes` with the package names you want to upgrade.');
  lines.push('');
  lines.push('**To apply all:** `apply_fixes({ path: "' + dir + '", packages: [' + fixable.map(f => `"${f.name}"`).join(', ') + '] })`');

  return ok(lines.join('\n'));
}

// ── apply_fixes ───────────────────────────────────────────────────────────────
async function handleApplyFixes({ path: dir = '.', packages, dry_run = false }) {
  const absDir = resolve(dir);
  const result = await scanService(absDir, { noOsv: false });

  const fixable = getFixableGroups(result.vulns, packages);
  const requested = packages.map(p => p.toLowerCase());
  const toApply = fixable.filter(f => requested.includes(f.name.toLowerCase()));

  if (toApply.length === 0) {
    return err(`No fix commands found for: ${packages.join(', ')}. Run get_fix_commands to see available fixes.`);
  }

  const outputs = [];

  for (const f of toApply) {
    if (dry_run) {
      outputs.push(`[DRY RUN] Would run: ${f.command}`);
      continue;
    }

    try {
      const stdout = execSync(f.command, { cwd: absDir, timeout: 60000 }).toString().trim();
      outputs.push(`✅ ${f.name}: upgraded to ${f.fixVersion} (fixes ${f.cveCount} CVE${f.cveCount > 1 ? 's' : ''})\n   $ ${f.command}\n   ${stdout.slice(0, 200)}`);
    } catch (e) {
      outputs.push(`❌ ${f.name}: command failed\n   $ ${f.command}\n   ${e.message.slice(0, 200)}`);
    }
  }

  const summary = dry_run
    ? `## Dry run — commands that would be executed\n\n${outputs.join('\n\n')}`
    : `## Fix results\n\n${outputs.join('\n\n')}\n\n> Run \`scan_project\` again to verify CVEs are resolved.`;

  return ok(summary);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getFixableGroups(vulns, filterNames, maxSevRank = 4) {
  const sevOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
  const map = new Map();

  for (const v of vulns) {
    if (!v.fixedIn || !v.isDirect) continue;
    if ((sevOrder[v.severity] ?? 4) > maxSevRank) continue;
    if (filterNames && !filterNames.map(n => n.toLowerCase()).includes(v.packageName.toLowerCase())) continue;

    const key = v.packageName;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        name: v.packageName,
        ecosystem: v.ecosystem,
        currentVersion: v.packageVersion,
        fixVersion: v.fixedIn,
        severity: v.severity,
        cveCount: 1,
        command: v.fixCommand || buildFixCommand(v),
      });
    } else {
      existing.cveCount++;
      // Keep highest fix version
      if (compareSemver(v.fixedIn, existing.fixVersion) > 0) {
        existing.fixVersion = v.fixedIn;
        existing.command = v.fixCommand || buildFixCommand(v);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    return (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4);
  });
}

function buildFixCommand(v) {
  if (v.ecosystem === 'npm') return `npm install ${v.packageName}@${v.fixedIn}`;
  if (v.ecosystem === 'PyPI') return `pip install "${v.packageName}>=${v.fixedIn}"`;
  return `# update ${v.packageName} to ${v.fixedIn}`;
}

function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function findOsvUiBin() {
  // Check common locations
  const candidates = [
    // Global npm bin
    join(process.env.npm_config_prefix || '', 'bin', 'osv-ui'),
    // npx cache
    join(process.env.HOME || '', '.npm', '_npx'),
    // Same node_modules
    join(process.cwd(), 'node_modules', '.bin', 'osv-ui'),
    join(process.cwd(), '..', 'node_modules', '.bin', 'osv-ui'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Try which
  try {
    return execSync('which osv-ui', { stdio: 'pipe' }).toString().trim();
  } catch {}
  return null;
}

async function waitForPort(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(`http://localhost:${port}/api/data`, { signal: AbortSignal.timeout(500) });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return false;
}

function ok(text) { return { content: [{ type: 'text', text }] }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
