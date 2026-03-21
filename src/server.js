import express from 'express';

export function createServer(payload, port, version) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.get('/', (_, res) => { res.setHeader('Content-Type', 'text/html'); res.send(buildDashboard(payload, version)); });
    app.get('/api/data', (_, res) => res.json(payload));
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', e => {
      if (e.code === 'EADDRINUSE') console.error(`Port ${port} in use — try --port=4322`);
      reject(e);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Simple semver-ish version comparison
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
  if (!v1) return -1;
  if (!v2) return 1;
  const p1 = String(v1).replace(/^v/, '').split(/[^0-9]/).map(Number);
  const p2 = String(v2).replace(/^v/, '').split(/[^0-9]/).map(Number);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n2 > n1) return -1;
  }
  return 0;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const SEV_COLOR = { critical: 'var(--sev-critical-c)', high: 'var(--sev-high-c)', moderate: 'var(--sev-moderate-c)', low: 'var(--sev-low-c)', unknown: 'var(--sev-unknown-c)' };
const SEV_BG = { critical: 'var(--sev-critical-bg)', high: 'var(--sev-high-bg)', moderate: 'var(--sev-moderate-bg)', low: 'var(--sev-low-bg)', unknown: 'var(--sev-unknown-bg)' };
const SEV_ORDER = { critical: 0, high: 1, moderate: 2, low: 3, unknown: 4 };

function sevBadge(s) {
  return `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;background:${SEV_BG[s]};color:${SEV_COLOR[s]};border:1px solid ${SEV_COLOR[s]}25">${esc(s)}</span>`;
}

function riskColor(score) {
  return score >= 50 ? 'var(--red)' : score >= 20 ? 'var(--orange)' : score > 0 ? 'var(--yellow)' : 'var(--green)';
}

export function buildDashboard({ services, scannedAt, noOsv }, version = '1.0.0') {
  const totalVulns = services.reduce((s, r) => s + r.vulns.length, 0);
  const totalPkgs = services.reduce((s, r) => s + r.totalPackages, 0);
  const totalCrit = services.reduce((s, r) => s + r.severity.critical, 0);
  const totalHigh = services.reduce((s, r) => s + r.severity.high, 0);
  const globalRisk = services.reduce((s, r) => s + r.riskScore, 0);
  const avgRisk = services.length ? Math.round(globalRisk / services.length) : 0;

  // Build service nav
  const serviceNav = services.map((svc, i) => {
    const dot = svc.severity.critical > 0 ? 'var(--red)' : svc.vulns.length > 0 ? 'var(--orange)' : 'var(--green)';
    const ecoIcons = svc.ecosystems.map(e => {
      if (e === 'npm') return '🟨';
      if (e === 'PyPI') return '🐍';
      if (e === 'Go') return '🔵';
      if (e === 'crates.io') return '🦀';
      return '📦';
    }).join('');
    return `<div class="nav-item ${i === 0 ? 'active' : ''}" onclick="showService(${i}, this)" data-svc="${i}">
      <span style="width:7px;height:7px;border-radius:50%;background:${dot};display:inline-block;flex-shrink:0"></span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(svc.name)}</span>
      <span style="font-size:10px;color:var(--muted);flex-shrink:0">${ecoIcons} ${svc.vulns.length}</span>
    </div>`;
  }).join('');

  // Build per-service panels
  const servicePanels = services.map((svc, i) => buildServicePanel(svc, i)).join('');

  const osvNote = noOsv
    ? `<div style="background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--warn-c);margin-bottom:16px">
        ⚠ Running in offline mode — CVE data not fetched. Remove <code>--offline</code> to query OSV.dev.
      </div>`
    : `<div style="background:var(--success-bg);border:1px solid var(--success-border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--success-c);margin-bottom:16px">
        ✅ CVE data from <a href="https://osv.dev" target="_blank" rel="noopener" style="color:var(--success-c);font-weight:600">OSV.dev</a> — updated daily from NVD · GitHub Advisory · PyPI Advisory · npm Advisory
      </div>`;

  const scanTime = new Date(scannedAt).toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>osv-ui — ${services.length} service${services.length > 1 ? 's' : ''}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}

:root{
  --red:#e53e3e;--orange:#dd6b20;--yellow:#d69e2e;--blue:#3182ce;--green:#38a169;--gray:#718096;
  --bg:#f7fafc;--card:#fff;--border:#e2e8f0;--text:#1a202c;--muted:#718096;--sidebar:220px;
  
  --sev-critical-c: #e53e3e; --sev-critical-bg: #fff5f5;
  --sev-high-c: #dd6b20; --sev-high-bg: #fffaf0;
  --sev-moderate-c: #d69e2e; --sev-moderate-bg: #fffff0;
  --sev-low-c: #3182ce; --sev-low-bg: #ebf8ff;
  --sev-unknown-c: #718096; --sev-unknown-bg: #f7fafc;

  --nav-hover-bg: #f7fafc;
  --nav-active-bg: #ebf8ff; --nav-active-c: #2b6cb0; --nav-active-border: #3182ce;
  
  --success-bg: #f0fff4; --success-border: #9ae6b4; --success-c: #276749;
  --warn-bg: #fffaf0; --warn-border: #f6e05e; --warn-c: #744210;

  --code-bg: #edf2f7; --code-c: #c53030;
  
  --table-head-bg: #f7fafc; --table-row-border: #f0f4f8; --table-row-hover: #fafbfc;
  --detail-row-bg: #fafbfc;
  
  --tag-direct-bg: #e6fffa; --tag-direct-c: #276749;
  --tag-prod-bg: #f0fff4; --tag-prod-c: #276749;
  --tag-trans-bg: #edf2f7; --tag-trans-c: #718096;
  --tag-dev-bg: #ebf8ff; --tag-dev-c: #2b6cb0;
  
  --eco-npm-bg: #fffef0; --eco-npm-fg: #7d6608; --eco-npm-border: #f6e05e;
  --eco-pypi-bg: #f0f9ff; --eco-pypi-fg: #1e4e79; --eco-pypi-border: #bee3f8;
  --eco-go-bg: #ebf8ff; --eco-go-fg: #2c5282; --eco-go-border: #90cdf4;
  --eco-rust-bg: #fff5f5; --eco-rust-fg: #9b2c2c; --eco-rust-border: #feb2b2;
}

html.dark {
  --red:#fc8181;--orange:#fbd38d;--yellow:#f6e05e;--blue:#63b3ed;--green:#68d391;--gray:#a0aec0;
  --bg:#1a202c;--card:#2d3748;--border:#4a5568;--text:#f7fafc;--muted:#a0aec0;
  
  --sev-critical-c: #fc8181; --sev-critical-bg: #4c1d1d;
  --sev-high-c: #fbd38d; --sev-high-bg: #5c2c16;
  --sev-moderate-c: #f6e05e; --sev-moderate-bg: #5f370e;
  --sev-low-c: #90cdf4; --sev-low-bg: #223c5c;
  --sev-unknown-c: #e2e8f0; --sev-unknown-bg: #4a5568;

  --nav-hover-bg: #2d3748;
  --nav-active-bg: #2a4365; --nav-active-c: #90cdf4; --nav-active-border: #63b3ed;
  
  --success-bg: #1c4532; --success-border: #22543d; --success-c: #9ae6b4;
  --warn-bg: #5f370e; --warn-border: #975a16; --warn-c: #fbd38d;

  --code-bg: #1a202c; --code-c: #fc8181;
  
  --table-head-bg: #2d3748; --table-row-border: #4a5568; --table-row-hover: #4a5568;
  --detail-row-bg: #2d3748;
  
  --tag-direct-bg: #22543d; --tag-direct-c: #9ae6b4;
  --tag-prod-bg: #22543d; --tag-prod-c: #9ae6b4;
  --tag-trans-bg: #4a5568; --tag-trans-c: #e2e8f0;
  --tag-dev-bg: #2a4365; --tag-dev-c: #90cdf4;
  
  --eco-npm-bg: #5f370e; --eco-npm-fg: #fefcbf; --eco-npm-border: #b7791f;
  --eco-pypi-bg: #2a4365; --eco-pypi-fg: #bee3f8; --eco-pypi-border: #3182ce;
  --eco-go-bg: #2b6cb0; --eco-go-fg: #ebf8ff; --eco-go-border: #4299e1;
  --eco-rust-bg: #742a2a; --eco-rust-fg: #fed7d7; --eco-rust-border: #e53e3e;
}

body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;font-size:13px}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
code{font-family:'SF Mono',Menlo,Monaco,monospace;font-size:11px;background:var(--code-bg);padding:2px 6px;border-radius:4px;color:var(--code-c)}

/* Layout */
.topbar{background:var(--card);color:var(--text);border-bottom:1px solid var(--border);padding:10px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:16px}
.topbar h1{font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px;white-space:nowrap}
.topbar .meta{font-size:11px;color:var(--muted);white-space:nowrap}
.topbar .meta a{color:var(--muted);text-decoration:none}
.topbar .meta a:hover{text-decoration:underline}
.body{display:flex;flex:1;min-height:0}
.sidebar{width:var(--sidebar);background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.sidebar-top{padding:12px 14px;border-bottom:1px solid var(--border);flex-shrink:0}
.sidebar-top .label{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.global-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.gs{background:var(--bg);border-radius:6px;padding:7px;text-align:center}
.gs .v{font-size:18px;font-weight:700;line-height:1}
.gs .l{font-size:9px;color:var(--muted);margin-top:1px}
.sidebar-nav{flex:1;overflow-y:auto;padding:8px 0}
.sidebar-section{font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--muted);padding:10px 14px 4px;text-transform:uppercase}
.nav-item{display:flex;align-items:center;gap:7px;padding:7px 14px;cursor:pointer;border-left:2px solid transparent;transition:all .12s}
.nav-item:hover{background:var(--nav-hover-bg);color:var(--text)}
.nav-item.active{background:var(--nav-active-bg);border-left-color:var(--nav-active-border);color:var(--nav-active-c);font-weight:500}
.content{flex:1;padding:24px 32px;overflow-y:auto;background:var(--bg)}
.svc-panel{display:none}.svc-panel.active{display:block}
.svc-header{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.svc-title{font-size:18px;font-weight:700}
.eco-badge{font-size:10px;font-weight:600;padding:3px 9px;border-radius:999px;border:1px solid}

/* Stats grid */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:14px;margin-bottom:16px}
.sc{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.02)}
.sc .v{font-size:24px;font-weight:700;line-height:1;margin-bottom:6px;color:var(--text)}
.sc .l{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}

/* Risk bar */
.risk-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px}
.risk-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px}
.risk-track{height:8px;background:var(--border);border-radius:4px;overflow:hidden}
.risk-fill{height:100%;border-radius:4px;transition:width .8s ease}

/* Tabs */
.tabs{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px}
.tab{padding:8px 16px;cursor:pointer;font-size:12px;font-weight:500;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .12s}
.tab:hover{color:var(--text)}
.tab.active{color:var(--blue);border-bottom-color:var(--blue)}
.tab-content{display:none}.tab-content.active{display:block}

/* Filters */
.filters-row{display:flex;justify-content:flex-start;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.filters{display:flex;gap:6px;flex-wrap:wrap}
.fb{padding:6px 14px;border:1px solid var(--border);border-radius:8px;font-size:12px;cursor:pointer;background:var(--card);color:var(--muted);transition:all .12s;line-height:1.2;display:flex;align-items:center;justify-content:center}
.fb:hover{border-color:var(--muted);color:var(--text)}
.fb.active{background:var(--blue);border-color:var(--blue);color:var(--card)}
.search{padding:6px 14px;border:1px solid var(--border);border-radius:8px;font-size:12px;width:100%;max-width:240px;outline:none;background:var(--card);color:var(--text);height:30px;box-sizing:border-box}
.search:focus{border-color:var(--blue);box-shadow:0 0 0 2px rgba(49, 130, 206, 0.15)}

/* Table */
.tbl-wrap{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
thead{background:var(--table-head-bg)}
th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid var(--table-row-border);vertical-align:top}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--table-row-hover)}

/* Fix card */
.fix-card{background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px;padding:12px;margin-top:6px;display:none}
.fix-card.show{display:block}
.fix-cmd{font-family:'SF Mono',monospace;font-size:12px;background:var(--tag-direct-bg);padding:6px 10px;border-radius:5px;color:var(--success-c);display:flex;align-items:center;justify-content:space-between;gap:8px}
.fix-cmd button{font-size:10px;padding:2px 8px;border:1px solid var(--success-border);border-radius:4px;background:var(--card);cursor:pointer;color:var(--success-c);white-space:nowrap}
.fix-cmd button:hover{background:var(--success-border)}

/* Dependabot-style upgrade table */
.upgrade-card{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px}
.uc-header{background:var(--success-bg);border-bottom:1px solid var(--success-border);padding:10px 14px;font-size:12px;font-weight:600;color:var(--success-c);display:flex;align-items:center;gap:8px}

/* Charts row */
.charts{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.cc{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,0.02)}
.ct{font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text)}
.donut-wrap{display:flex;align-items:center;gap:12px}
.donut-legend{display:flex;flex-direction:column;gap:5px;font-size:11px}
.leg-item{display:flex;align-items:center;gap:5px}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.pkg-tag{font-size:10px;padding:1px 6px;border-radius:999px}

/* Empty state */
.empty{text-align:center;padding:32px;color:var(--green)}
.empty .icon{font-size:40px;margin-bottom:8px}

/* Vuln detail expandable row */
.detail-row{background:var(--detail-row-bg);display:none}
.detail-row.show{display:table-row}
.detail-content{padding:10px 14px;font-size:11px;color:var(--muted)}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.detail-item .label{font-size:10px;color:var(--muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.05em}
.detail-item .val{font-size:12px;color:var(--text)}
tr.clickable{cursor:pointer}
tr.clickable:hover td{background:var(--table-row-border)}
.kofi-button{margin-top:12px;display:inline-block;vertical-align:middle}
.kofi-link{display:flex;align-items:center;gap:3px;padding:1px 5px;border:1px solid var(--border);border-radius:4px;color:var(--muted);font-size:8.5px;font-weight:600;transition:all .2s ease;text-decoration:none!important}
.kofi-link:hover{background:#ed8936;border-color:#ed8936;color:var(--card)}
.kofi-link img{height:10px!important;opacity:0.5;filter:grayscale(1)}
.kofi-link:hover img{opacity:1;filter:none}

</style>
</head>
<body>

<div class="topbar">
  <h1>🔍 osv-ui
    <span style="font-size:10px;background:var(--muted);padding:2px 6px;border-radius:4px;margin-left:4px;vertical-align:middle;color:var(--card);font-weight:400">v${version}</span>
    <span style="color:var(--muted);font-weight:400">/</span>
    <span style="color:var(--muted);font-weight:400">${services.length} service${services.length > 1 ? 's' : ''}</span>
  </h1>
  <div style="display:flex;align-items:center;gap:12px">
    <span class="meta" style="background:var(--success-bg);padding:4px 12px;border-radius:6px;border:1px solid var(--success-border);color:var(--success-c)">
      CVE data from <strong>OSV.dev (by Google)</strong> &mdash; updated daily from NVD · GitHub Advisory · PyPI Advisory · npm Advisory
    </span>
    <span class="meta">Scanned ${scanTime} · ${totalPkgs.toLocaleString()} pkgs · <a href="/api/data" target="_blank" style="background:var(--nav-active-bg);color:var(--nav-active-c);padding:2px 8px;border-radius:4px;font-weight:600;display:inline-flex;align-items:center;gap:4px;border:1px solid var(--nav-active-border)">⚡ JSON API</a></span>
    <button id="theme-btn" onclick="toggleTheme()" style="background:transparent;border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px">🌙 Dark</button>
    <button onclick="downloadJson()" style="background:transparent;border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px">📥 JSON</button>
    <button onclick="downloadHtml()" style="background:transparent;border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px">📄 HTML</button>
  </div>
</div>

<div class="body">
  <nav class="sidebar">
    <div class="sidebar-top">
      <div class="label">Global summary</div>
      <div class="global-stats">
        <div class="gs"><div class="v">${totalPkgs.toLocaleString()}</div><div class="l">Packages</div></div>
        <div class="gs"><div class="v">${totalVulns}</div><div class="l">Total CVEs</div></div>
        <div class="gs"><div class="v" style="color:var(--red)">${totalCrit}</div><div class="l">Critical</div></div>
        <div class="gs"><div class="v" style="color:var(--orange)">${totalHigh}</div><div class="l">High</div></div>
      </div>
    </div>
    <div class="sidebar-nav">
      <div class="sidebar-section">Services</div>
      ${serviceNav}
    </div>
    <div style="padding:12px 14px;border-top:1px solid var(--border);font-size:10px;color:var(--muted);line-height:1.5;background:var(--bg);flex-shrink:0">
      <div style="font-weight:600;color:var(--text);margin-bottom:2px">Developer Info</div>
      <div>👤 Toan Nguyen</div>
      <div>💻 <a href="https://github.com/toan203/osv-ui" target="_blank" rel="noopener" style="color:var(--muted)">toan203/osv-ui</a></div>
      <div class="kofi-button">
        <a href="https://ko-fi.com/P5P31W9W6A" target="_blank" class="kofi-link">
          <img src="https://storage.ko-fi.com/cdn/cup-border.png" alt="Ko-fi" />
          Sponsor this project
        </a>
      </div>
    </div>
  </nav>

  <div class="content">
    ${servicePanels}
  </div>
</div>

<script>
const ALL_DATA = ${JSON.stringify({ services, scannedAt, noOsv })};

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  if (isDark) {
    document.documentElement.classList.remove('dark');
    document.getElementById('theme-btn').innerHTML = '🌙 Dark';
  } else {
    document.documentElement.classList.add('dark');
    document.getElementById('theme-btn').innerHTML = '☀️ Light';
  }
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(ALL_DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'osv-report.json';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadHtml() {
  // Hide buttons before generating HTML string to make standalone report cleaner? Not really necessary, but good to have.
  const html = '<!DOCTYPE html>\\n<html lang="en">\\n' + document.documentElement.outerHTML + '\\n</html>';
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'osv-report.html';
  a.click();
  URL.revokeObjectURL(url);
}

function showService(idx, el) {
  document.querySelectorAll('.svc-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('svc-' + idx).classList.add('active');
  el.classList.add('active');
}

function showTab(svcIdx, tabName) {
  const panel = document.getElementById('svc-' + svcIdx);
  panel.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  panel.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
}

// Risk bar animations on load
window.addEventListener('load', () => {
  document.querySelectorAll('.risk-fill[data-score]').forEach(el => {
    setTimeout(() => el.style.width = el.dataset.score + '%', 150);
  });
});

// Vuln filter
function filterVulns(svcIdx, sev, btn) {
  const panel = document.getElementById('svc-' + svcIdx);
  panel.querySelectorAll('.sev-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyVulnFilters(svcIdx);
}
function searchVulns(svcIdx, q) { applyVulnFilters(svcIdx); }
function applyVulnFilters(svcIdx) {
  const panel = document.getElementById('svc-' + svcIdx);
  const activeBtn = panel.querySelector('.sev-filter.active');
  const curSev = activeBtn?.dataset.sev || 'all';
  const search = panel.querySelector('.vuln-search')?.value?.toLowerCase() || '';
  panel.querySelectorAll('.vuln-row').forEach(row => {
    const sevMatch = curSev === 'all' || row.dataset.severity === curSev;
    const searchMatch = !search || row.dataset.pkg?.includes(search);
    row.style.display = sevMatch && searchMatch ? '' : 'none';
    // also hide the detail row below it
    const next = row.nextElementSibling;
    if (next?.classList.contains('detail-row')) next.style.display = 'none';
  });
}

// Package filter
function filterPkgs(svcIdx, type, btn) {
  const panel = document.getElementById('svc-' + svcIdx);
  panel.querySelectorAll('.pkg-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const search = panel.querySelector('.pkg-search')?.value?.toLowerCase() || '';
  panel.querySelectorAll('.pkg-row').forEach(row => {
    const typeMatch = type === 'all' || row.dataset.type === type;
    const searchMatch = !search || row.dataset.name?.includes(search);
    row.style.display = typeMatch && searchMatch ? '' : 'none';
  });
}
function searchPkgs(svcIdx, q) {
  const panel = document.getElementById('svc-' + svcIdx);
  const activeBtn = panel.querySelector('.pkg-filter.active');
  const type = activeBtn?.dataset.type || 'all';
  filterPkgs(svcIdx, type, activeBtn || panel.querySelector('.pkg-filter'));
}

// Toggle vuln detail row
function toggleDetail(rowId) {
  const row = document.getElementById('detail-' + rowId);
  if (!row) return;
  const isOpen = row.classList.contains('show');
  // close all in same table
  row.closest('table').querySelectorAll('.detail-row.show').forEach(r => {
    r.classList.remove('show');
    r.style.display = 'none';
  });
  if (!isOpen) {
    row.classList.add('show');
    row.style.display = 'table-row';
  } else {
    row.style.display = 'none';
  }
}

// Copy fix command
function copyCmd(btn, cmd) {
  navigator.clipboard?.writeText(cmd).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

// Donut charts
function drawDonut(canvasId, segments, cx=60, cy=60, r=44, hole=26) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const total = segments.reduce((s, x) => s + x.v, 0);
  if (!total) { el.innerHTML = '<text x="' + cx + '" y="' + (cy+4) + '" text-anchor="middle" font-size="10" fill="var(--muted)">no data</text>'; return; }
  let angle = -90, paths = '';
  segments.forEach(seg => {
    if (!seg.v) return;
    let deg = (seg.v / total) * 360;
    if (deg >= 360) deg = 359.99;
    const a1 = angle * Math.PI / 180;
    angle += deg;
    const a2 = angle * Math.PI / 180, lg = deg > 180 ? 1 : 0;
    const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
    const x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
    const ix1=cx+hole*Math.cos(a1), iy1=cy+hole*Math.sin(a1);
    const ix2=cx+hole*Math.cos(a2), iy2=cy+hole*Math.sin(a2);
    paths += '<path d="M'+ix1+','+iy1+'L'+x1+','+y1+'A'+r+','+r+' 0 '+lg+' 1 '+x2+','+y2+'L'+ix2+','+iy2+'A'+hole+','+hole+' 0 '+lg+' 0 '+ix1+','+iy1+'" fill="'+seg.c+'" opacity=".9"/>';
  });
  el.innerHTML = paths +
    '<text x="'+cx+'" y="'+(cy-4)+'" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text)">'+total+'</text>' +
    '<text x="'+cx+'" y="'+(cy+11)+'" text-anchor="middle" font-size="9" fill="var(--muted)">total</text>';
}

window.addEventListener('load', () => {
  ALL_DATA.services.forEach((svc, i) => {
    const s = svc.severity;
    drawDonut('donut-sev-'+i, [
      {v:s.critical, c:'var(--sev-critical-c)', l:'Critical'},
      {v:s.high,     c:'var(--sev-high-c)', l:'High'},
      {v:s.moderate, c:'var(--sev-moderate-c)', l:'Moderate'},
      {v:s.low,      c:'var(--sev-low-c)', l:'Low'},
    ]);
    const fix = svc.vulns.filter(v => v.fixedIn).length;
    const nofix = svc.vulns.length - fix;
    drawDonut('donut-fix-'+i, [
      {v:fix,   c:'var(--success-c)', l:'Has fix'},
      {v:nofix, c:'var(--red)', l:'No fix yet'},
    ]);
  });
});
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
function buildServicePanel(svc, i) {
  const sev = svc.severity;
  const rc = riskColor(svc.riskScore);

  // Ecosystem badges
  const ecoBadges = svc.ecosystems.map(e => {
    let [bg, fg, border, label] = ['var(--bg)', 'var(--text)', 'var(--border)', e];
    if (e === 'npm') { bg = 'var(--eco-npm-bg)'; fg = 'var(--eco-npm-fg)'; border = 'var(--eco-npm-border)'; label = '🟨 npm'; }
    else if (e === 'PyPI') { bg = 'var(--eco-pypi-bg)'; fg = 'var(--eco-pypi-fg)'; border = 'var(--eco-pypi-border)'; label = '🐍 Python'; }
    else if (e === 'Go') { bg = 'var(--eco-go-bg)'; fg = 'var(--eco-go-fg)'; border = 'var(--eco-go-border)'; label = '🔵 Go'; }
    else if (e === 'crates.io') { bg = 'var(--eco-rust-bg)'; fg = 'var(--eco-rust-fg)'; border = 'var(--eco-rust-border)'; label = '🦀 Rust'; }
    return `<span class="eco-badge" style="background:${bg};color:${fg};border-color:${border}">${label}</span>`;
  }).join('');

  const manifestInfo = svc.manifests.map(m => `<code>${m.source}</code>`).join(' + ');

  // Calculate highest fix version per package for hints in Vuln tab
  const highestFixes = {};
  svc.vulns.forEach(v => {
    if (v.fixedIn) {
      if (!highestFixes[v.packageName] || compareVersions(v.fixedIn, highestFixes[v.packageName]) > 0) {
        highestFixes[v.packageName] = v.fixedIn;
      }
    }
  });

  // Vulnerabilities tab
  const vulnRows = svc.vulns.map((v, vi) => {
    const rowId = `${i}-${vi}`;
    const fixSection = v.fixedIn
      ? `<div class="fix-cmd">
          <span>💊 Safe version: <strong>${esc(v.fixedIn)}</strong></span>
          ${v.fixCommand ? `<button onclick="copyCmd(this,'${esc(v.fixCommand)}')">Copy fix</button>` : ''}
        </div>` : '';

    const refs = v.references?.slice(0, 3).map(r => `<a href="${esc(r)}" target="_blank" rel="noopener" style="font-size:10px">${new URL(r).hostname}</a>`).join(' · ') || '';

    return `
    <tr class="vuln-row clickable" data-severity="${esc(v.severity)}" data-pkg="${esc(v.packageName.toLowerCase())}" onclick="toggleDetail('${rowId}')">
      <td>${sevBadge(v.severity)}</td>
      <td>
        <div style="font-weight:600">${esc(v.packageName)}</div>
        <div style="font-size:10px;color:var(--muted)">v${esc(v.packageVersion)} · ${esc(v.ecosystem)}</div>
      </td>
      <td>
        <div style="max-width:240px">${esc(v.title)}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${esc(v.cveId || v.id || '')}</div>
      </td>
      <td><code>${esc(v.affectedRange)}</code></td>
      <td>${v.isDirect ? '<span class="pkg-tag" style="background:var(--tag-direct-bg);color:var(--tag-direct-c)">direct</span>' : '<span class="pkg-tag" style="background:var(--tag-trans-bg);color:var(--tag-trans-c)">transitive</span>'}</td>
      <td>
        ${v.fixedIn ? `<div style="color:var(--green);font-weight:600">✅ ${esc(v.fixedIn)}</div>
          ${(highestFixes[v.packageName] && v.fixedIn !== highestFixes[v.packageName] && compareVersions(highestFixes[v.packageName], v.fixedIn) > 0)
          ? `<div style="font-size:9px;color:var(--muted);margin-top:2px;line-height:1.1">💡 Installing <strong>${esc(highestFixes[v.packageName])}</strong> will also fix this</div>`
          : ''}` : '<span style="color:var(--muted)">—</span>'}
      </td>
    </tr>
    <tr class="detail-row" id="detail-${rowId}">
      <td colspan="6">
        <div class="detail-content">
          ${v.details ? `<div style="margin-bottom:8px;line-height:1.5">${esc(v.details.slice(0, 400))}${v.details.length > 400 ? '…' : ''}</div>` : ''}
          ${fixSection}
          <div class="detail-grid" style="margin-top:8px">
            ${v.cvssScore ? `<div class="detail-item"><div class="label">CVSS Score</div><div class="val"><strong>${v.cvssScore.toFixed(1)}</strong> / 10</div></div>` : ''}
            <div class="detail-item"><div class="label">OSV ID</div><div class="val"><a href="${esc(v.osvUrl)}" target="_blank">${esc(v.id)}</a></div></div>
            ${v.nvdUrl ? `<div class="detail-item"><div class="label">NVD</div><div class="val"><a href="${esc(v.nvdUrl)}" target="_blank">${esc(v.cveId)}</a></div></div>` : ''}
            ${v.ghsaUrl ? `<div class="detail-item"><div class="label">GitHub Advisory</div><div class="val"><a href="${esc(v.ghsaUrl)}" target="_blank">${esc(v.ghsaId)}</a></div></div>` : ''}
            ${v.published ? `<div class="detail-item"><div class="label">Published</div><div class="val">${new Date(v.published).toLocaleDateString()}</div></div>` : ''}
          </div>
          ${refs ? `<div style="margin-top:8px;font-size:10px;color:var(--muted)">References: ${refs}</div>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Dependabot-style fix recommendations: Group by package, show highest fix version
  const fixGroups = {};
  svc.vulns.filter(v => v.fixedIn && v.isDirect).forEach(v => {
    if (!fixGroups[v.packageName]) {
      fixGroups[v.packageName] = {
        package: v.packageName,
        current: v.packageVersion,
        fixedIn: v.fixedIn,
        fixCommand: v.fixCommand,
        severity: v.severity,
        cveCount: 1
      };
    } else {
      const g = fixGroups[v.packageName];
      g.cveCount++;
      // Update fixedIn if this one is higher
      if (compareVersions(v.fixedIn, g.fixedIn) > 0) {
        g.fixedIn = v.fixedIn;
        g.fixCommand = v.fixCommand;
      }
      // Update severity badge if this one is worse
      if (SEV_ORDER[v.severity] < SEV_ORDER[g.severity]) {
        g.severity = v.severity;
      }
    }
  });

  const uniqueFixes = Object.values(fixGroups).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const fixRows = uniqueFixes.map(g => `
    <tr>
      <td>${sevBadge(g.severity)}</td>
      <td>
        <strong>${esc(g.package)}</strong>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">
          fixes ${g.cveCount} CVE${g.cveCount > 1 ? 's' : ''}
        </div>
      </td>
      <td style="color:var(--code-c)"><code>${esc(g.current)}</code></td>
      <td style="color:var(--green)"><code>${esc(g.fixedIn)}</code></td>
      <td><div class="fix-cmd" style="margin:0">${esc(g.fixCommand || '')}<button onclick="copyCmd(this,'${esc(g.fixCommand || '')}')">Copy</button></div></td>
    </tr>`).join('');

  // Packages tab
  const pkgRows = svc.packages.slice(0, 800).map((p, pi) => `
    <tr class="pkg-row" data-type="${p.dev ? 'dev' : 'prod'}" data-name="${esc(p.name.toLowerCase())}">
      <td><a href="${esc(p.registry)}" target="_blank" rel="noopener">${esc(p.name)}</a></td>
      <td><code>${esc(p.version)}</code></td>
      <td><span class="pkg-tag" style="${p.dev ? 'background:var(--tag-dev-bg);color:var(--tag-dev-c)' : 'background:var(--tag-prod-bg);color:var(--tag-prod-c)'}">${p.dev ? 'dev' : 'prod'}</span></td>
      <td>${esc(p.ecosystem)}</td>
      ${p.isDirect !== undefined ? `<td>${p.isDirect ? '✓' : ''}</td>` : ''}
    </tr>`).join('');

  // Severity filter buttons
  const sevFilterButtons = ['critical', 'high', 'moderate', 'low']
    .filter(s => sev[s] > 0)
    .map(s => `<button class="fb sev-filter" data-sev="${s}" onclick="filterVulns(${i},'${s}',this)" style="color:${SEV_COLOR[s]}">● ${capitalize(s)} (${sev[s]})</button>`)
    .join('');

  return `
<div class="svc-panel ${i === 0 ? 'active' : ''}" id="svc-${i}">
  <div class="svc-header" style="margin-bottom:20px">
    <span class="svc-title">${esc(svc.name)}</span>
    ${ecoBadges}
    <span style="font-size:11px;color:var(--muted)">${manifestInfo}</span>
  </div>

  <div class="stats-grid">
    <div class="sc"><div class="v">${svc.totalPackages.toLocaleString()}</div><div class="l">Packages</div></div>
    <div class="sc"><div class="v" style="color:var(--green)">${svc.directCount}</div><div class="l">Direct</div></div>
    <div class="sc"><div class="v" style="color:var(--red)">${sev.critical}</div><div class="l">Critical</div></div>
    <div class="sc"><div class="v" style="color:var(--orange)">${sev.high}</div><div class="l">High</div></div>
    <div class="sc"><div class="v" style="color:var(--yellow)">${sev.moderate}</div><div class="l">Moderate</div></div>
    <div class="sc"><div class="v" style="color:var(--blue)">${sev.low}</div><div class="l">Low</div></div>
  </div>

  <div class="risk-card">
    <div class="risk-row">
      <span style="font-weight:600">Risk score</span>
      <span style="font-size:15px;font-weight:700;color:${rc}">${svc.riskScore}/100</span>
    </div>
    <div class="risk-track">
      <div class="risk-fill" data-score="${svc.riskScore}" style="width:0;background:${rc}"></div>
    </div>
  </div>

  <div class="charts">
    <div class="cc">
      <div class="ct">Severity breakdown</div>
      <div class="donut-wrap">
        <svg width="120" height="120" viewBox="0 0 120 120" id="donut-sev-${i}"></svg>
        <div class="donut-legend">
          ${['critical', 'high', 'moderate', 'low'].filter(s => sev[s]).map(s =>
    `<div class="leg-item"><div class="dot" style="background:${SEV_COLOR[s]}"></div>${capitalize(s)}: ${sev[s]}</div>`
  ).join('')}
        </div>
      </div>
    </div>
    <div class="cc">
      <div class="ct">Fix availability</div>
      <div class="donut-wrap">
        <svg width="120" height="120" viewBox="0 0 120 120" id="donut-fix-${i}"></svg>
        <div class="donut-legend">
          <div class="leg-item"><div class="dot" style="background:var(--success-c)"></div>Has fix: ${svc.vulns.filter(v => v.fixedIn).length}</div>
          <div class="leg-item"><div class="dot" style="background:var(--red)"></div>No fix: ${svc.vulns.filter(v => !v.fixedIn).length}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="vulns" onclick="showTab(${i},'vulns')">🚨 Vulnerabilities (${svc.vulns.length})</div>
    <div class="tab" data-tab="fixes" onclick="showTab(${i},'fixes')">💊 Upgrade guide (${uniqueFixes.length} direct)</div>
    <div class="tab" data-tab="packages" onclick="showTab(${i},'packages')">📦 Packages (${svc.totalPackages})</div>
  </div>

  <!-- VULNERABILITIES TAB -->
  <div class="tab-content active" data-tab="vulns">
    ${svc.vulns.length === 0
      ? `<div class="tbl-wrap"><div class="empty"><div class="icon">✅</div><div style="font-size:16px;font-weight:600">No vulnerabilities found</div><div style="color:var(--muted);margin-top:4px">${svc.totalPackages} packages all clean</div></div></div>`
      : `<div class="filters-row">
            <div class="filters">
              <button class="fb sev-filter active" data-sev="all" onclick="filterVulns(${i},'all',this)">All (${svc.vulns.length})</button>
              ${sevFilterButtons}
            </div>
            <input class="search vuln-search" placeholder="Search package..." oninput="applyVulnFilters(${i})">
            <div style="font-size:11px;color:var(--muted);white-space:nowrap">↓ Click any row to expand details · Data from OSV.dev</div>
          </div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Severity</th><th>Package</th><th>Description</th><th>Affected</th><th>Type</th><th>Fix in</th></tr></thead>
            <tbody>${vulnRows}</tbody>
          </table>
        </div>`
    }
  </div>

  <!-- FIX GUIDE TAB (Dependabot-style) -->
  <div class="tab-content" data-tab="fixes">
    ${uniqueFixes.length === 0
      ? `<div class="tbl-wrap"><div class="empty"><div class="icon">${svc.vulns.length === 0 ? '✅' : '⚠'}</div><div style="font-size:14px;font-weight:600">${svc.vulns.length === 0 ? 'No vulnerabilities!' : 'No auto-fixable vulnerabilities found'}</div><div style="color:var(--muted);font-size:12px;margin-top:4px">${svc.vulns.length > 0 ? 'Transitive deps may need upstream fixes.' : ''}</div></div></div>`
      : `<div class="upgrade-card">
          <div class="uc-header">💊 ${uniqueFixes.length} direct ${uniqueFixes.length === 1 ? 'package' : 'packages'} can be upgraded to fix CVEs</div>
          <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Severity</th><th>Package</th><th>Current</th><th>Safe version</th><th>Command</th></tr></thead>
            <tbody>${fixRows}</tbody>
          </table>
          </div>
        </div>
        ${svc.vulns.filter(v => v.fixedIn && !v.isDirect).length > 0
        ? `<div class="tbl-wrap" style="background:var(--warn-bg);border-color:var(--warn-border)">
              <div style="padding:10px 14px;font-size:12px;color:var(--warn-c);font-weight:600">⚠ Transitive dependency fixes</div>
              <div style="padding:0 14px 12px;font-size:12px;color:var(--warn-c)">
                ${svc.ecosystem === 'npm' ? 'Run <code>npm audit fix</code> or <code>npm audit fix --force</code> to attempt automatic resolution of transitive vulnerabilities.' :
          'For Python transitive deps: check if top-level packages have newer versions that pull in safe sub-versions.'}
              </div>
            </div>` : ''}
        <div style="font-size:11px;color:var(--muted);margin-top:8px">Fix commands are generated based on OSV.dev "fixed in" data. Always test in staging first.</div>`
    }
  </div>

  <!-- PACKAGES TAB -->
  <div class="tab-content" data-tab="packages">
    <div class="filters-row">
      <div class="filters">
        <button class="fb pkg-filter active" data-type="all" onclick="filterPkgs(${i},'all',this)">All (${svc.totalPackages})</button>
        <button class="fb pkg-filter" data-type="prod" onclick="filterPkgs(${i},'prod',this)">Production</button>
        <button class="fb pkg-filter" data-type="dev" onclick="filterPkgs(${i},'dev',this)">Dev only</button>
      </div>
      <input class="search pkg-search" placeholder="Search..." oninput="searchPkgs(${i},this.value)">
    </div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>Package</th><th>Version</th><th>Env</th><th>Ecosystem</th><th>Direct</th></tr></thead>
        <tbody>${pkgRows}</tbody>
      </table>
      ${svc.packages.length > 800 ? `<div style="padding:8px 14px;font-size:11px;color:var(--muted)">Showing first 800 of ${svc.packages.length}</div>` : ''}
    </div>
  </div>

</div>`;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
