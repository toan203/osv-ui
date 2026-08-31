import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCycloneDxSbom,
  buildDiffReport,
  buildMarkdownReport,
  buildSpdxSbom,
  parseSeverityThreshold,
  shouldFailForSeverity,
} from '../src/reporters.js';

const baseline = {
  scannedAt: '2026-01-01T00:00:00.000Z',
  services: [{
    name: 'api',
    totalPackages: 1,
    packages: [{ name: 'lodash', version: '4.17.20', ecosystem: 'npm', isDirect: true }],
    severity: { critical: 0, high: 1, moderate: 0, low: 0, unknown: 0 },
    vulns: [{
      id: 'GHSA-old',
      cveId: 'CVE-2020-0001',
      packageName: 'lodash',
      packageVersion: '4.17.20',
      ecosystem: 'npm',
      severity: 'high',
      title: 'old issue',
      fixedIn: '4.17.21',
      osvUrl: 'https://osv.dev/vulnerability/GHSA-old',
      references: [],
    }],
  }],
};

const current = {
  scannedAt: '2026-01-02T00:00:00.000Z',
  services: [{
    name: 'api',
    totalPackages: 3,
    packages: [
      { name: 'lodash', version: '4.17.21', ecosystem: 'npm', isDirect: true, registry: 'https://www.npmjs.com/package/lodash' },
      { name: 'requests', version: '2.25.1', ecosystem: 'PyPI', isDirect: true, registry: 'https://pypi.org/project/requests' },
      { name: 'org.example:demo', version: '1.2.3', ecosystem: 'Maven', isDirect: true, registry: 'https://central.sonatype.com/artifact/org.example/demo' },
    ],
    severity: { critical: 1, high: 0, moderate: 0, low: 0, unknown: 0 },
    vulns: [{
      id: 'PYSEC-new',
      cveId: 'CVE-2026-0001',
      packageName: 'requests',
      packageVersion: '2.25.1',
      ecosystem: 'PyPI',
      severity: 'critical',
      title: 'new issue',
      fixedIn: '2.31.0',
      osvUrl: 'https://osv.dev/vulnerability/PYSEC-new',
      references: ['https://example.test/advisory'],
    }],
  }],
};

test('buildDiffReport tracks added, resolved, and unchanged findings', () => {
  const diff = buildDiffReport(current, baseline);
  assert.equal(diff.summary.added, 1);
  assert.equal(diff.summary.resolved, 1);
  assert.equal(diff.summary.unchanged, 0);
  assert.equal(diff.added[0].vuln.cveId, 'CVE-2026-0001');
});

test('buildDiffReport keeps a persistent advisory unchanged across package upgrades', () => {
  const upgraded = structuredClone(baseline);
  upgraded.services[0].vulns[0].packageVersion = '4.17.21';
  const diff = buildDiffReport(upgraded, baseline);
  assert.equal(diff.summary.added, 0);
  assert.equal(diff.summary.resolved, 0);
  assert.equal(diff.summary.unchanged, 1);
});

test('shouldFailForSeverity gates payloads and diffs', () => {
  const diff = buildDiffReport(current, baseline);
  assert.equal(shouldFailForSeverity(current, 'critical'), true);
  assert.equal(shouldFailForSeverity(diff, 'critical'), true);
  assert.equal(shouldFailForSeverity(baseline, 'critical'), false);
});

test('SBOM builders include packages and vulnerabilities', () => {
  const cdx = buildCycloneDxSbom(current);
  assert.equal(cdx.bomFormat, 'CycloneDX');
  assert.equal(cdx.components.length, 3);
  assert.equal(cdx.vulnerabilities.length, 1);
  assert.equal(cdx.components[0].purl.startsWith('pkg:npm/'), true);
  assert.equal(cdx.components[0]['bom-ref'], cdx.components[0].purl);
  assert.equal(
    cdx.components.some(component => component.purl === 'pkg:maven/org.example/demo@1.2.3'),
    true,
  );
  assert.equal(
    cdx.components.some(component => component['bom-ref'] === cdx.vulnerabilities[0].affects[0].ref),
    true,
  );

  const spdx = buildSpdxSbom(current);
  assert.equal(spdx.spdxVersion, 'SPDX-2.3');
  assert.equal(spdx.packages.length, 3);
  assert.equal(spdx.relationships.length, spdx.packages.length);
  assert.equal(new Set(spdx.packages.map(pkg => pkg.SPDXID)).size, spdx.packages.length);
});

test('buildMarkdownReport renders PR diff details', () => {
  const markdown = buildMarkdownReport(current, buildDiffReport(current, baseline));
  assert.match(markdown, /## osv-ui CVE report/);
  assert.match(markdown, /### PR diff/);
  assert.match(markdown, /CVE-2026-0001/);
});

test('parseSeverityThreshold rejects typos instead of weakening the CI gate', () => {
  assert.throws(() => parseSeverityThreshold('hgh'), /Invalid severity threshold/);
});
