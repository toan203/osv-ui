import { basename } from 'path';
import { parseManifests } from './parsers.js';
import { queryOSV } from './osv.js';

/**
 * Scan a single service directory.
 * Returns a structured result object for the dashboard.
 */
export async function scanService(dir, { noOsv = false } = {}) {
  const manifests = parseManifests(dir);
  if (manifests.length === 0) {
    throw new Error('No supported manifest files found');
  }

  // If multiple manifests (e.g. monorepo with both npm + python in same dir),
  // merge them into one service result
  const allPackages = manifests.flatMap(m => m.packages);
  const ecosystems = [...new Set(manifests.map(m => m.ecosystem))];

  // Determine display name
  const name = manifests.find(m => m.name && m.name !== 'npm-project' && m.name !== 'python-project')?.name
    || basename(dir);

  // ── Query OSV.dev ──────────────────────────────────────────────────────────
  let osvResults = new Map();
  if (!noOsv) {
    const queryable = allPackages.filter(p => p.version && p.version !== 'unknown');
    if (queryable.length > 0) {
      process.stdout.write(`    ${dim('OSV.dev: querying ' + queryable.length + ' packages...')}\n`);
      osvResults = await queryOSV(queryable);
    }
  }

  // ── Build vulnerability list ────────────────────────────────────────────────
  const vulns = [];
  const severityCounts = { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 };

  for (const pkg of allPackages) {
    const key = `${pkg.ecosystem}:${pkg.name}@${pkg.version}`;
    const pkgVulns = osvResults.get(key) || [];
    for (const vuln of pkgVulns) {
      severityCounts[vuln.severity] = (severityCounts[vuln.severity] || 0) + 1;
      vulns.push({
        ...vuln,
        packageName: pkg.name,
        packageVersion: pkg.version,
        ecosystem: pkg.ecosystem,
        isDirect: pkg.isDirect,
        dev: pkg.dev,
        registryUrl: pkg.registry,
      });
    }
  }

  // Sort: critical first, then high, moderate, low
  const SEV_ORDER = { critical: 0, high: 1, moderate: 2, low: 3, unknown: 4 };
  vulns.sort((a, b) => (SEV_ORDER[a.severity] ?? 5) - (SEV_ORDER[b.severity] ?? 5));

  // ── Risk score ──────────────────────────────────────────────────────────────
  const riskScore = Math.min(100,
    severityCounts.critical * 25 +
    severityCounts.high * 10 +
    severityCounts.moderate * 3 +
    severityCounts.low * 1
  );

  return {
    name,
    dir,
    ecosystem: ecosystems.join('+'),
    ecosystems,
    manifests: manifests.map(m => ({ type: m.type, source: m.source || m.type, lockVersion: m.lockVersion })),
    packages: allPackages,
    totalPackages: allPackages.length,
    directCount: allPackages.filter(p => p.isDirect).length,
    vulns,
    severity: severityCounts,
    riskScore,
    noOsv,
    scannedAt: new Date().toISOString(),
  };
}

function dim(s) { return `\x1b[90m${s}\x1b[0m`; }
