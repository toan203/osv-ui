import test from 'node:test';
import assert from 'node:assert/strict';
import { queryOSV, OsvQueryError } from '../src/osv.js';
import { scanService } from '../src/scanner.js';
import { createProject, npmFixture, removeProject } from './helpers.js';

const originalFetch = globalThis.fetch;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installSuccessfulOsvMock() {
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/querybatch')) {
      const queries = JSON.parse(options.body).queries;
      return response({ results: queries.map(() => ({ vulns: [{ id: 'OSV-TEST-1' }] })) });
    }
    return response({
      id: 'OSV-TEST-1',
      aliases: ['CVE-2026-0001'],
      summary: 'critical vector test',
      severity: [{
        type: 'CVSS_V3',
        score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
      }],
      affected: [{
        package: { ecosystem: 'npm', name: 'lodash' },
        ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }],
      }],
      references: [],
    });
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('queryOSV calculates severity from an OSV CVSS v3 vector', async () => {
  installSuccessfulOsvMock();
  const results = await queryOSV([{ ecosystem: 'npm', name: 'lodash', version: '4.17.20', isDirect: true }]);
  const vuln = results.get('npm:lodash@4.17.20')[0];
  assert.equal(vuln.cvssScore, 9.8);
  assert.equal(vuln.severity, 'critical');
});

test('queryOSV fails closed when a batch request fails', async () => {
  globalThis.fetch = async () => { throw new Error('network down'); };
  await assert.rejects(
    queryOSV([{ ecosystem: 'npm', name: 'lodash', version: '4.17.20' }]),
    OsvQueryError,
  );
});

test('queryOSV fails closed when vulnerability details are incomplete', async () => {
  globalThis.fetch = async (url) => String(url).endsWith('/querybatch')
    ? response({ results: [{ vulns: [{ id: 'OSV-MISSING' }] }] })
    : response({ error: 'unavailable' }, 503);
  await assert.rejects(
    queryOSV([{ ecosystem: 'npm', name: 'lodash', version: '4.17.20' }]),
    OsvQueryError,
  );
});

test('queryOSV fails closed when batch results are truncated', async () => {
  globalThis.fetch = async () => response({ results: [] });
  await assert.rejects(
    queryOSV([{ ecosystem: 'npm', name: 'lodash', version: '4.17.20' }]),
    OsvQueryError,
  );
});

test('scanService retains the same advisory for distinct installed versions', async () => {
  installSuccessfulOsvMock();
  const dir = createProject(npmFixture);
  try {
    const result = await scanService(dir);
    const lodash = result.vulns.filter(vuln => vuln.packageName === 'lodash');
    assert.deepEqual(lodash.map(vuln => vuln.packageVersion).sort(), ['4.17.19', '4.17.20']);
  } finally {
    removeProject(dir);
  }
});
