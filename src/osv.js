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
const DETAIL_CONCURRENCY = 25;

export class OsvQueryError extends Error {
  constructor(message, failures = []) {
    super(message);
    this.name = 'OsvQueryError';
    this.failures = failures;
  }
}

// Map our ecosystem names to OSV ecosystem identifiers
const ECOSYSTEM_MAP = {
  npm: 'npm',
  PyPI: 'PyPI',
  Go: 'Go',
  'crates.io': 'crates.io',
  Maven: 'Maven',
  Packagist: 'Packagist',
  RubyGems: 'RubyGems',
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
  const batchFailures = [];

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
      if (!Array.isArray(data.results) || data.results.length !== batch.length) {
        throw new Error(`OSV API returned ${Array.isArray(data.results) ? data.results.length : 'an invalid number of'} results for ${batch.length} queries`);
      }

      data.results.forEach((result, idx) => {
        const pkg = batch[idx];
        if (result.vulns && result.vulns.length > 0) {
          packageVulns.push({ pkg, vulnIds: result.vulns.map(v => v.id) });
        }
      });
    } catch (e) {
      process.stderr.write(`    ⚠ OSV.dev querybatch failed: ${e.message}\n`);
      batchFailures.push(e);
    }
  }

  if (batchFailures.length > 0) {
    throw new OsvQueryError(
      `OSV.dev batch scan incomplete (${batchFailures.length} request${batchFailures.length === 1 ? '' : 's'} failed)`,
      batchFailures,
    );
  }

  // Fetch full vulnerability details for all unique IDs
  const uniqueIds = new Set();
  packageVulns.forEach(pv => pv.vulnIds.forEach(id => uniqueIds.add(id)));

  const fullVulnsMap = new Map();
  const detailFailures = [];
  const ids = Array.from(uniqueIds);
  for (let i = 0; i < ids.length; i += DETAIL_CONCURRENCY) {
    const chunk = ids.slice(i, i + DETAIL_CONCURRENCY);
    await Promise.all(chunk.map(async (id) => {
      try {
        const r = await fetch(`${OSV_BASE}/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(`OSV API returned ${r.status}`);
        fullVulnsMap.set(id, await r.json());
      } catch (e) {
        process.stderr.write(`    ⚠ OSV.dev fetch detail failed for ${id}: ${e.message}\n`);
        detailFailures.push({ id, error: e });
      }
    }));
  }

  if (detailFailures.length > 0) {
    throw new OsvQueryError(
      `OSV.dev vulnerability details incomplete (${detailFailures.length} record${detailFailures.length === 1 ? '' : 's'} failed)`,
      detailFailures,
    );
  }

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
      cvssScore = parseCvssScore(cvss.type, cvss.score);
      if (cvssScore !== null) severity = severityFromScore(cvssScore);
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
    } else if (pkg.ecosystem === 'Maven') {
      fixCommand = `mvn dependency:tree (check pom.xml for ${pkg.name})`;
    } else if (pkg.ecosystem === 'Packagist') {
      fixCommand = `composer require ${pkg.name}:${fixedIn}`;
    } else if (pkg.ecosystem === 'RubyGems') {
      fixCommand = `bundle update ${pkg.name}`;
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

function parseCvssScore(type, value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 10) return numeric;
  if (type !== 'CVSS_V3') return null;
  return calculateCvssV3BaseScore(String(value));
}

function severityFromScore(score) {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'moderate';
  return 'low';
}

function calculateCvssV3BaseScore(vector) {
  if (!/^CVSS:3\.[01]\//.test(vector)) return null;
  const metrics = Object.fromEntries(
    vector.split('/').slice(1).map(part => part.split(':')).filter(parts => parts.length === 2),
  );
  const scopeChanged = metrics.S === 'C';
  const av = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[metrics.AV];
  const ac = { L: 0.77, H: 0.44 }[metrics.AC];
  const pr = scopeChanged
    ? { N: 0.85, L: 0.68, H: 0.5 }[metrics.PR]
    : { N: 0.85, L: 0.62, H: 0.27 }[metrics.PR];
  const ui = { N: 0.85, R: 0.62 }[metrics.UI];
  const confidentiality = { H: 0.56, L: 0.22, N: 0 }[metrics.C];
  const integrity = { H: 0.56, L: 0.22, N: 0 }[metrics.I];
  const availability = { H: 0.56, L: 0.22, N: 0 }[metrics.A];

  if ([av, ac, pr, ui, confidentiality, integrity, availability].some(value => value === undefined)) {
    return null;
  }

  const impactSubScore = 1 - ((1 - confidentiality) * (1 - integrity) * (1 - availability));
  const isV31 = vector.startsWith('CVSS:3.1/');
  const impact = scopeChanged
    ? isV31
      ? 7.52 * (impactSubScore - 0.029) - 3.25 * (((impactSubScore * 0.9731) - 0.02) ** 13)
      : 7.52 * (impactSubScore - 0.029) - 3.25 * ((impactSubScore - 0.02) ** 15)
    : 6.42 * impactSubScore;
  if (impact <= 0) return 0;

  const exploitability = 8.22 * av * ac * pr * ui;
  const score = scopeChanged
    ? Math.min(1.08 * (impact + exploitability), 10)
    : Math.min(impact + exploitability, 10);
  return Math.ceil((score - Number.EPSILON) * 10) / 10;
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
    if (!res.ok) throw new Error(`OSV API returned ${res.status}`);
    const data = await res.json();
    return (data.vulns || []);
  } catch (error) {
    throw new OsvQueryError(`OSV.dev package query incomplete: ${error.message}`, [error]);
  }
}
