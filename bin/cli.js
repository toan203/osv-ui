#!/usr/bin/env node
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { readdirSync, statSync, writeFileSync } from 'fs';
import { createServer, buildDashboard } from '../src/server.js';
import { scanService } from '../src/scanner.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
const version = pkg.version;

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1]) : 2003;
const noOpen = args.includes('--no-open');
const discover = args.includes('--discover') || args.includes('-d');
const noOsv = args.includes('--offline');           // skip live OSV.dev lookup

const jsonArg = args.find(a => a.startsWith('--json'));
const isJson = !!jsonArg;
const jsonFile = jsonArg && jsonArg.includes('=') ? jsonArg.split('=')[1] : 'osv-report.json';

const htmlArg = args.find(a => a.startsWith('--html'));
const isHtml = !!htmlArg;
const htmlFile = htmlArg && htmlArg.includes('=') ? htmlArg.split('=')[1] : 'osv-report.html';

const paths = args.filter(a => !a.startsWith('-') && !a.startsWith('--')); // positional = service dirs

const log = (msg) => process.stdout.write(msg + '\n');
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

log('');
log(bold(cyan('  ⚡ osv-ui')) + ` — v${version} multi-service CVE dashboard`);
log(dim('  CVE data: OSV.dev (live, updated daily from NVD + GitHub Advisory)'));
log('');

const showHelp = args.includes('--help') || args.includes('-h');
if (showHelp) {
  log('  Usage:');
  log(cyan('    npx osv-ui                          ') + dim('# current dir'));
  log(cyan('    npx osv-ui ./frontend ./api ./worker') + dim('# multi-service'));
  log(cyan('    npx osv-ui -d                       ') + dim('# auto-detect'));
  log('');
  log('  Options:');
  log(cyan('    --port=<port>     ') + dim('port to run the server on (default: 2003)'));
  log(cyan('    -d, --discover    ') + dim('auto-detect services in the given dirs or current dir'));
  log(cyan('    --json[=file]     ') + dim('save report as JSON (defaults to osv-report.json)'));
  log(cyan('    --html[=file]     ') + dim('save report as HTML (defaults to osv-report.html)'));
  log(cyan('    --offline         ') + dim('skip live OSV.dev lookup (offline mode)'));
  log(cyan('    --no-open         ') + dim('do not automatically open dashboard in browser'));
  log(cyan('    -h, --help        ') + dim('show this help message'));
  log('');
  log('  Supported manifests:');
  log(dim('    npm:    package-lock.json'));
  log(dim('    Python: requirements.txt · Pipfile.lock · poetry.lock · pyproject.toml'));
  log(dim('    Go:     go.sum'));
  log(dim('    Cargo:  Cargo.lock'));
  log('');
  process.exit(0);
}

// ── Discover services ────────────────────────────────────────────────────────
function discoverDirs(root) {
  const hits = [];
  const MANIFEST = ['package-lock.json', 'requirements.txt', 'Pipfile.lock', 'poetry.lock', 'pyproject.toml', 'go.sum', 'Cargo.lock'];
  const IGNORE = ['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', '.next', 'build', 'target'];
  function walk(dir, depth = 0) {
    if (depth > 3) return;
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    const hasManifest = entries.some(e => MANIFEST.includes(e));
    if (hasManifest) { hits.push(dir); return; } // don't recurse into a found service
    for (const e of entries) {
      if (IGNORE.includes(e)) continue;
      const full = join(dir, e);
      try { if (statSync(full).isDirectory()) walk(full, depth + 1); } catch {}
    }
  }
  walk(root);
  return hits;
}

let serviceDirs = [];
if (paths.length > 0) {
  serviceDirs = paths.map(p => resolve(p));
} else if (discover) {
  log(dim('  Discovering services from current directory...'));
  serviceDirs = discoverDirs(process.cwd());
  if (serviceDirs.length === 0) {
    log(red('  ✖ No service manifests found. Try passing paths explicitly.'));
    process.exit(1);
  }
  log(dim(`  Found ${serviceDirs.length} service(s)\n`));
} else {
  serviceDirs = [process.cwd()];
}

// ── Validate dirs ────────────────────────────────────────────────────────────
const MANIFESTS = ['package-lock.json', 'requirements.txt', 'Pipfile.lock', 'poetry.lock', 'pyproject.toml', 'go.sum', 'Cargo.lock'];
serviceDirs = serviceDirs.filter(dir => {
  const ok = existsSync(dir) && MANIFESTS.some(m => existsSync(join(dir, m)));
  if (!ok) log(yellow(`  ⚠ Skipping ${dir} — no supported manifest found`));
  return ok;
});

if (serviceDirs.length === 0) {
  log(red('  ✖ No valid service directories found.'));
  log('');
  log('  Supported manifests:');
  log(dim('    npm:    package-lock.json'));
  log(dim('    Python: requirements.txt · Pipfile.lock · poetry.lock · pyproject.toml'));
  log(dim('    Go:     go.sum'));
  log(dim('    Rust:   Cargo.lock'));
  log('');
  log('  Usage:');
  log(cyan('    npx osv-ui                          ') + dim('# current dir'));
  log(cyan('    npx osv-ui ./frontend ./api ./worker') + dim('# multi-service'));
  log(cyan('    npx osv-ui -d                       ') + dim('# auto-detect'));
  log('');
  process.exit(1);
}

// ── Scan all services ────────────────────────────────────────────────────────
const services = [];
for (const dir of serviceDirs) {
  log(dim(`  → Scanning ${dir}`));
  try {
    const result = await scanService(dir, { noOsv });
    services.push(result);
    const v = result.vulns.length;
    const crit = result.severity.critical;
    const statusIcon = crit > 0 ? red('●') : v > 0 ? yellow('●') : green('●');
    log(`    ${statusIcon} ${bold(result.name)} ${dim(`(${result.ecosystem})`)} — ${v} vuln${v !== 1 ? 's' : ''}`);
  } catch (e) {
    log(red(`    ✖ Failed: ${e.message}`));
  }
}

log('');

// ── Global summary ───────────────────────────────────────────────────────────
const totalVulns = services.reduce((s, r) => s + r.vulns.length, 0);
const totalCrit = services.reduce((s, r) => s + r.severity.critical, 0);
const totalPkgs = services.reduce((s, r) => s + r.packages.length, 0);

// ── Export or Start Server ───────────────────────────────────────────────────
const payload = { services, scannedAt: new Date().toISOString(), noOsv };

if (isJson) {
  try {
    writeFileSync(jsonFile, JSON.stringify(payload, null, 2));
    log(`  ${green('✔')} Report saved to ${cyan(jsonFile)}`);
  } catch (err) {
    log(red(`  ✖ Failed to write JSON report to ${jsonFile}: ${err.message}`));
    process.exit(1);
  }
} else if (isHtml) {
  try {
    const html = buildDashboard(payload, version);
    writeFileSync(htmlFile, html);
    log(`  ${green('✔')} Report saved to ${cyan(htmlFile)}`);
  } catch (err) {
    log(red(`  ✖ Failed to write HTML report to ${htmlFile}: ${err.message}`));
    process.exit(1);
  }
} else {
  createServer(payload, PORT, version).then(async () => {
    const url = `http://localhost:${PORT}`;
    log(`  ${green('✔')} Dashboard ready → ${cyan(url)}`);
    log(dim(`  ${totalPkgs} packages · ${totalVulns} vulnerabilities · ${services.length} service(s)`));
    if (totalCrit > 0) log(red(`  ⚠ ${totalCrit} CRITICAL vulnerability${totalCrit > 1 ? 'ies' : ''} found!`));
    log(dim('  Press Ctrl+C to stop\n'));

    if (!noOpen) {
      try { const { default: open } = await import('open'); await open(url); } catch {}
    }
  });
}
