#!/usr/bin/env node
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { readdirSync, statSync, writeFileSync, watch as watchFile } from 'fs';
import { createServer, buildDashboard } from '../src/server.js';
import { scanService } from '../src/scanner.js';
import {
  buildCycloneDxSbom,
  buildDiffReport,
  buildMarkdownReport,
  buildSpdxSbom,
  parseSeverityThreshold,
  sendWebhook,
  shouldFailForSeverity,
} from '../src/reporters.js';
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
const watch = args.includes('--watch');

const jsonArg = args.find(a => a.startsWith('--json'));
const isJson = !!jsonArg;
const jsonFile = jsonArg && jsonArg.includes('=') ? jsonArg.split('=')[1] : 'osv-report.json';

const htmlArg = args.find(a => a.startsWith('--html'));
const isHtml = !!htmlArg;
const htmlFile = htmlArg && htmlArg.includes('=') ? htmlArg.split('=')[1] : 'osv-report.html';

const cyclonedxArg = args.find(a => a.startsWith('--cyclonedx'));
const spdxArg = args.find(a => a.startsWith('--spdx'));
const sbomArg = args.find(a => a.startsWith('--sbom'));
const sbomFormatArg = args.find(a => a.startsWith('--sbom-format='));
const sbomValue = sbomArg?.includes('=') ? sbomArg.split('=')[1] : null;
const sbomFormat = sbomFormatArg
  ? sbomFormatArg.split('=')[1]
  : ['cyclonedx', 'spdx'].includes(sbomValue) ? sbomValue : 'cyclonedx';
const isCycloneDx = !!cyclonedxArg || (!!sbomArg && sbomFormat !== 'spdx');
const cyclonedxFile = cyclonedxArg?.includes('=')
  ? cyclonedxArg.split('=')[1]
  : sbomValue && !['cyclonedx', 'spdx'].includes(sbomValue) && sbomFormat !== 'spdx'
    ? sbomValue
    : 'osv-sbom.cdx.json';
const isSpdx = !!spdxArg || (!!sbomArg && sbomFormat === 'spdx');
const spdxFile = spdxArg?.includes('=')
  ? spdxArg.split('=')[1]
  : sbomValue && !['cyclonedx', 'spdx'].includes(sbomValue) && sbomFormat === 'spdx'
    ? sbomValue
    : 'osv-sbom.spdx.json';

const baselineArg = args.find(a => a.startsWith('--baseline='));
const baselineFile = baselineArg ? baselineArg.split('=')[1] : null;
const markdownArg = args.find(a => a.startsWith('--markdown'));
const isMarkdown = !!markdownArg;
const markdownFile = markdownArg && markdownArg.includes('=') ? markdownArg.split('=')[1] : 'osv-report.md';
const failOnArg = args.find(a => a.startsWith('--fail-on='));
const failOn = failOnArg ? parseSeverityThreshold(failOnArg.split('=')[1]) : null;
const webhookArg = args.find(a => a.startsWith('--webhook-url='));
const webhookUrl = webhookArg ? webhookArg.slice('--webhook-url='.length) : null;
const webhookSeverityArg = args.find(a => a.startsWith('--webhook-severity='));
const webhookSeverity = parseSeverityThreshold(webhookSeverityArg ? webhookSeverityArg.split('=')[1] : 'critical');

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
  log(cyan('    --cyclonedx[=file]') + dim('save CycloneDX SBOM JSON (defaults to osv-sbom.cdx.json)'));
  log(cyan('    --spdx[=file]     ') + dim('save SPDX SBOM JSON (defaults to osv-sbom.spdx.json)'));
  log(cyan('    --baseline=<file> ') + dim('compare current scan with a previous --json report'));
  log(cyan('    --markdown[=file] ') + dim('save a Markdown report / PR comment (defaults to osv-report.md)'));
  log(cyan('    --fail-on=<sev>   ') + dim('exit non-zero for findings at or above severity (critical/high/moderate/low)'));
  log(cyan('    --webhook-url=<u> ') + dim('POST critical/high/etc findings to a webhook'));
  log(cyan('    --webhook-severity=<sev> ') + dim('webhook threshold (default: critical)'));
  log(cyan('    --watch           ') + dim('keep dashboard running and re-scan when manifest files change'));
  log(cyan('    --offline         ') + dim('skip live OSV.dev lookup (offline mode)'));
  log(cyan('    --no-open         ') + dim('do not automatically open dashboard in browser'));
  log(cyan('    -h, --help        ') + dim('show this help message'));
  log('');
  log('  Supported manifests:');
  log(dim('    JavaScript: package-lock.json · pnpm-lock.yaml · yarn.lock'));
  log(dim('    Python:     uv.lock · poetry.lock · Pipfile.lock · requirements.txt'));
  log(dim('    Go:         go.sum'));
  log(dim('    Rust:       Cargo.lock'));
  log(dim('    Java:       pom.xml'));
  log(dim('    PHP:        composer.lock'));
  log(dim('    Ruby:       Gemfile.lock'));
  log('');
  process.exit(0);
}

// ── Discover services ────────────────────────────────────────────────────────
function discoverDirs(root) {
  const hits = [];
  const MANIFEST = [
    'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
    'uv.lock', 'poetry.lock', 'Pipfile.lock', 'requirements.txt', 'pyproject.toml',
    'go.sum', 'go.mod', 'Cargo.lock', 'pom.xml', 'composer.json', 'composer.lock', 'Gemfile', 'Gemfile.lock'
  ];
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
if (discover) {
  const roots = paths.length > 0 ? paths.map(p => resolve(p)) : [process.cwd()];
  log(dim(`  Discovering services from ${paths.length > 0 ? paths.join(', ') : 'current directory'}...`));
  serviceDirs = roots.flatMap(r => discoverDirs(r));
  if (serviceDirs.length === 0) {
    log(red('  ✖ No service manifests found in the search paths.'));
    process.exit(1);
  }
  log(dim(`  Found ${serviceDirs.length} service(s)\n`));
} else {
  serviceDirs = paths.length > 0 ? paths.map(p => resolve(p)) : [process.cwd()];
}

// ── Validate dirs ────────────────────────────────────────────────────────────
const MANIFESTS = [
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
  'uv.lock', 'poetry.lock', 'Pipfile.lock', 'requirements.txt', 'pyproject.toml',
  'go.sum', 'go.mod', 'Cargo.lock', 'pom.xml', 'composer.json', 'composer.lock', 'Gemfile', 'Gemfile.lock'
];
serviceDirs = serviceDirs.filter(dir => {
  const ok = existsSync(dir) && MANIFESTS.some(m => existsSync(join(dir, m)));
  if (!ok) log(yellow(`  ⚠ Skipping ${dir} — no supported manifest found`));
  return ok;
});

if (serviceDirs.length === 0) {
  log(red('  ✖ No valid service directories found.'));
  log('');
  log('  Supported manifests:');
  log(dim('    JavaScript: package-lock.json · pnpm-lock.yaml · yarn.lock'));
  log(dim('    Python:     uv.lock · poetry.lock · Pipfile.lock · requirements.txt'));
  log(dim('    Go:         go.sum'));
  log(dim('    Rust:       Cargo.lock'));
  log(dim('    Java:       pom.xml'));
  log(dim('    PHP:        composer.lock'));
  log(dim('    Ruby:       Gemfile.lock'));
  log('');
  log('  Usage:');
  log(cyan('    npx osv-ui                          ') + dim('# current dir'));
  log(cyan('    npx osv-ui ./frontend ./api ./worker') + dim('# multi-service'));
  log(cyan('    npx osv-ui -d                       ') + dim('# auto-detect'));
  log('');
  process.exit(1);
}

// ── Scan all services ────────────────────────────────────────────────────────
async function scanAllServices() {
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
  return services;
}

const services = await scanAllServices();

log('');

// ── Global summary ───────────────────────────────────────────────────────────
const totalVulns = services.reduce((s, r) => s + r.vulns.length, 0);
const totalCrit = services.reduce((s, r) => s + r.severity.critical, 0);
const totalPkgs = services.reduce((s, r) => s + r.packages.length, 0);

// ── Export or Start Server ───────────────────────────────────────────────────
const payload = { services, scannedAt: new Date().toISOString(), noOsv };
const baselinePayload = baselineFile ? readJsonFile(baselineFile) : null;
const diffReport = baselinePayload ? buildDiffReport(payload, baselinePayload) : null;
let wroteReport = false;

try {
  if (isJson) {
    writeFileSync(jsonFile, JSON.stringify(payload, null, 2));
    wroteReport = true;
    log(`  ${green('✔')} Report saved to ${cyan(jsonFile)}`);
  }
  if (isHtml) {
    const html = buildDashboard(payload, version);
    writeFileSync(htmlFile, html);
    wroteReport = true;
    log(`  ${green('✔')} Report saved to ${cyan(htmlFile)}`);
  }
  if (isCycloneDx) {
    writeFileSync(cyclonedxFile, JSON.stringify(buildCycloneDxSbom(payload), null, 2));
    wroteReport = true;
    log(`  ${green('✔')} CycloneDX SBOM saved to ${cyan(cyclonedxFile)}`);
  }
  if (isSpdx) {
    writeFileSync(spdxFile, JSON.stringify(buildSpdxSbom(payload), null, 2));
    wroteReport = true;
    log(`  ${green('✔')} SPDX SBOM saved to ${cyan(spdxFile)}`);
  }
  if (isMarkdown) {
    writeFileSync(markdownFile, buildMarkdownReport(payload, diffReport));
    wroteReport = true;
    log(`  ${green('✔')} Markdown report saved to ${cyan(markdownFile)}`);
  }
  if (webhookUrl) {
    const result = await sendWebhook(webhookUrl, payload, { threshold: webhookSeverity, diffReport });
    if (result?.sent) log(`  ${green('✔')} Webhook sent (${result.findings} finding${result.findings === 1 ? '' : 's'})`);
    else log(dim(`  Webhook skipped: ${result?.reason || 'no matching findings'}`));
  }
} catch (err) {
  log(red(`  ✖ Report step failed: ${err.message}`));
  process.exit(1);
}

if (diffReport) {
  log(dim(`  Diff: ${diffReport.summary.added} new · ${diffReport.summary.resolved} resolved · ${diffReport.summary.unchanged} unchanged`));
}

const failPayload = diffReport || payload;
const shouldFail = failOn && shouldFailForSeverity(failPayload, failOn);

if (failOn && !watch) {
  if (shouldFail) {
    log(red(`  ✖ Failing because ${failOn}+ findings were found${diffReport ? ' in the diff' : ''}.`));
    process.exit(2);
  }
  log(`  ${green('✔')} No ${failOn}+ findings${diffReport ? ' in the diff' : ''}.`);
  if (!wroteReport) process.exit(0);
}

if (!wroteReport || watch) {
  createServer(payload, PORT, version).then(async ({ port }) => {
    const url = `http://localhost:${port}`;
    log(`  ${green('✔')} Dashboard ready → ${cyan(url)}`);
    log(dim(`  ${totalPkgs} packages · ${totalVulns} vulnerabilities · ${services.length} service(s)`));
    if (totalCrit > 0) log(red(`  ⚠ ${totalCrit} CRITICAL vulnerability${totalCrit > 1 ? 'ies' : ''} found!`));
    log(dim('  Press Ctrl+C to stop\n'));

    if (!noOpen) {
      try { const { default: open } = await import('open'); await open(url); } catch {}
    }

    if (watch) {
      startWatch(payload);
    }
  });
}

function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    log(red(`  ✖ Failed to read baseline ${file}: ${err.message}`));
    process.exit(1);
  }
}

function startWatch(payload) {
  const watched = new Set();
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      log(dim('\n  Manifest changed; re-scanning...'));
      const services = await scanAllServices();
      payload.services.splice(0, payload.services.length, ...services);
      payload.scannedAt = new Date().toISOString();
      log(dim('  Re-scan complete. Refresh the browser to see the latest dashboard.\n'));
    }, 300);
  };

  for (const dir of serviceDirs) {
    for (const manifest of MANIFESTS) {
      const file = join(dir, manifest);
      if (!existsSync(file) || watched.has(file)) continue;
      watched.add(file);
      try { watchFile(file, { persistent: true }, schedule); } catch {}
    }
  }
  log(dim(`  Watching ${watched.size} manifest file(s) for changes.`));
}
