/**
 * OSV.dev API client
 * Docs: https://google.github.io/osv.dev/api/
 * 
 * Free, no API key, updated DAILY from:
 *   - NVD (NIST National Vulnerability Database)
 *   - GitHub Security Advisory (GHSA)
 *   - PyPI Advisory Database
 *   - npm Advisory Database
 *   - RustSec, Go Vuln DB, OSS-Fuzz, etc.
 */

const OSV_BASE = 'https://api.osv.dev/v1';
const BATCH_SIZE = 1000; // OSV allows up to 1000 per batch request

// Map our ecosystem names to OSV ecosystem identifiers
const ECOSYSTEM_MAP = {
  npm: 'npm',
  PyPI: 'PyPI',
  Go: 'Go',
  'crates.io': 'crates.io',
};

/**
 * Query OSV.dev for vulnerabilities in a list of packages.
 * Returns Map<"name@version", VulnInfo[]>
 */
export async function queryOSV(packages) {
  const filtered = packages.filter(p => p.version && p.version !== 'unknown');
  if (filtered.length === 0) return new Map();

  const results = new Map();
  const packageVulns = []; // Array of { pkg, vulnIds: [] }

  // Process in batches to get vulnerable IDs
  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE);
    const queries = batch.map(p => ({
      package: {
        name: p.name,
        ecosystem: ECOSYSTEM_MAP[p.ecosystem] || p.ecosystem,
      },
      version: p.version,
    }));

    try {
      const res = await fetch(`${OSV_BASE}/querybatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) throw new Error(`OSV API returned ${res.status}`);
      const data = await res.json();

      (data.results || []).forEach((result, idx) => {
        const pkg = batch[idx];
        if (result.vulns && result.vulns.length > 0) {
          packageVulns.push({ pkg, vulnIds: result.vulns.map(v => v.id) });
        }
      });
    } catch (e) {
      process.stderr.write(`    ⚠ OSV.dev querybatch failed: ${e.message}\n`);
    }
  }

  // Fetch full vulnerability details for all unique IDs
  const uniqueIds = new Set();
  packageVulns.forEach(pv => pv.vulnIds.forEach(id => uniqueIds.add(id)));

  const fullVulnsMap = new Map();
  const fetchPromises = Array.from(uniqueIds).map(async (id) => {
    try {
      const r = await fetch(`${OSV_BASE}/vulns/${id}`, { signal: AbortSignal.timeout(10000) });
      if (r.ok) fullVulnsMap.set(id, await r.json());
    } catch (e) {
      process.stderr.write(`    ⚠ OSV.dev fetch detail failed for ${id}: ${e.message}\n`);
    }
  });
  
  // Wait for all detail fetches to complete
  await Promise.allSettled(fetchPromises);

  // Map full vulnerability data back to packages
  packageVulns.forEach(pv => {
    const key = `${pv.pkg.ecosystem}:${pv.pkg.name}@${pv.pkg.version}`;
    const vulns = pv.vulnIds
      .map(id => fullVulnsMap.get(id))
      .filter(v => v) // drop if fetch failed
      .map(v => parseOsvVuln(v, pv.pkg));
    
    if (vulns.length > 0) results.set(key, vulns);
  });

  return results;
}
/**
 * Check if a version string is considered "stable" for production use.
 * Excludes alpha, beta, rc, canary, dev, next, pre-releases.
 */
function isStableVersion(ver) {
  if (!ver) return false;
  return !/alpha|beta|canary|rc|dev|next|pre|preview/i.test(ver);
}

function parseOsvVuln(v, pkg) {
  // Extract severity (CVSS)
  let severity = 'unknown';
  let cvssScore = null;
  
  // Check database_specific or severity array
  if (v.severity?.length > 0) {
    const cvss = v.severity.find(s => s.type === 'CVSS_V3' || s.type === 'CVSS_V2');
    if (cvss?.score) {
      cvssScore = parseFloat(cvss.score);
      if (cvssScore >= 9.0) severity = 'critical';
      else if (cvssScore >= 7.0) severity = 'high';
      else if (cvssScore >= 4.0) severity = 'moderate';
      else severity = 'low';
    }
  }
  
  // Fallback to aliases/database_specific
  if (severity === 'unknown' && v.database_specific?.severity) {
    severity = v.database_specific.severity.toLowerCase();
    if (severity === 'medium') severity = 'moderate';
  }
  if (severity === 'unknown') severity = 'moderate'; // safe default

  // Extract fix version from ranges
  let fixedIn = null;
  let affectedRange = null;
  for (const aff of v.affected || []) {
    if (aff.package?.name?.toLowerCase() !== pkg.name.toLowerCase()) continue;
    for (const range of aff.ranges || []) {
      if (range.type === 'SEMVER' || range.type === 'ECOSYSTEM') {
        const introduced = range.events?.find(e => e.introduced)?.introduced;
        const fixed      = range.events?.find(e => e.fixed)?.fixed;
        if (introduced || fixed) {
          affectedRange = `>= ${introduced || '0'}${fixed ? `, < ${fixed}` : ''}`;
          if (fixed && isStableVersion(fixed)) {
            fixedIn = fixed;
          }
        }
      }
    }
    // versions list (for PyPI)
    if (aff.versions?.length > 0 && !fixedIn) {
      affectedRange = aff.versions.slice(0, 3).join(', ') + (aff.versions.length > 3 ? '…' : '');
    }
  }

  // Extract CVE ID
  const cveId = v.aliases?.find(a => a.startsWith('CVE-'))
    || v.id;
  const ghsaId = v.aliases?.find(a => a.startsWith('GHSA-'));

  // Build fix command
  let fixCommand = null;
  if (fixedIn) {
    if (pkg.ecosystem === 'npm') {
      fixCommand = pkg.isDirect
        ? `npm install ${pkg.name}@${fixedIn}`
        : `npm audit fix`;
    } else if (pkg.ecosystem === 'PyPI') {
      fixCommand = pkg.isDirect
        ? `pip install "${pkg.name}>=${fixedIn}"`
        : `pip install --upgrade ${pkg.name}`;
    } else if (pkg.ecosystem === 'Go') {
      fixCommand = pkg.isDirect
        ? `go get ${pkg.name}@v${fixedIn.replace(/^v/, '')}`
        : `go get ${pkg.name}@v${fixedIn.replace(/^v/, '')}`; // go get works for transitive too
    } else if (pkg.ecosystem === 'crates.io') {
      fixCommand = `cargo update -p ${pkg.name} --precise ${fixedIn}`;
    }
  }

  return {
    id: v.id,
    cveId,
    ghsaId,
    title: v.summary || v.details?.slice(0, 120) || 'No description',
    details: v.details || '',
    severity,
    cvssScore,
    affectedRange: affectedRange || `== ${pkg.version}`,
    fixedIn,
    fixCommand,
    isDirect: pkg.isDirect,
    published: v.published,
    modified: v.modified,
    references: (v.references || []).slice(0, 5).map(r => r.url),
    nvdUrl: cveId?.startsWith('CVE-') ? `https://nvd.nist.gov/vuln/detail/${cveId}` : null,
    ghsaUrl: ghsaId ? `https://github.com/advisories/${ghsaId}` : null,
    osvUrl: `https://osv.dev/vulnerability/${v.id}`,
  };
}

// Query a single package (for drill-down)
export async function queryPackage(name, version, ecosystem) {
  try {
    const res = await fetch(`${OSV_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name, ecosystem: ECOSYSTEM_MAP[ecosystem] || ecosystem },
        version,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return (data.vulns || []);
  } catch { return []; }
}
