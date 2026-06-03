import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCycloneDxSbom,
  buildDiffReport,
  buildMarkdownReport,
  buildSpdxSbom,
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
    totalPackages: 2,
    packages: [
      { name: 'lodash', version: '4.17.21', ecosystem: 'npm', isDirect: true, registry: 'https://www.npmjs.com/package/lodash' },
      { name: 'requests', version: '2.25.1', ecosystem: 'PyPI', isDirect: true, registry: 'https://pypi.org/project/requests' },
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

test('shouldFailForSeverity gates payloads and diffs', () => {
  const diff = buildDiffReport(current, baseline);
  assert.equal(shouldFailForSeverity(current, 'critical'), true);
  assert.equal(shouldFailForSeverity(diff, 'critical'), true);
  assert.equal(shouldFailForSeverity(baseline, 'critical'), false);
});

test('SBOM builders include packages and vulnerabilities', () => {
  const cdx = buildCycloneDxSbom(current);
  assert.equal(cdx.bomFormat, 'CycloneDX');
  assert.equal(cdx.components.length, 2);
  assert.equal(cdx.vulnerabilities.length, 1);
  assert.equal(cdx.components[0].purl.startsWith('pkg:npm/'), true);

  const spdx = buildSpdxSbom(current);
  assert.equal(spdx.spdxVersion, 'SPDX-2.3');
  assert.equal(spdx.packages.length, 2);
});

test('buildMarkdownReport renders PR diff details', () => {
  const markdown = buildMarkdownReport(current, buildDiffReport(current, baseline));
  assert.match(markdown, /## osv-ui CVE report/);
  assert.match(markdown, /### PR diff/);
  assert.match(markdown, /CVE-2026-0001/);
});
