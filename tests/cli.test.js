import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('CLI writes JSON, HTML, Markdown, and SBOM reports offline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'osv-ui-test-'));
  try {
    const jsonFile = join(dir, 'report.json');
    const htmlFile = join(dir, 'report.html');
    const markdownFile = join(dir, 'report.md');
    const cdxFile = join(dir, 'sbom.cdx.json');
    const spdxFile = join(dir, 'sbom.spdx.json');

    execFileSync(process.execPath, [
      join(root, 'bin/cli.js'),
      join(root, 'test-fixture/javascript-npm'),
      '--offline',
      `--json=${jsonFile}`,
      `--html=${htmlFile}`,
      `--markdown=${markdownFile}`,
      `--cyclonedx=${cdxFile}`,
      `--spdx=${spdxFile}`,
      '--fail-on=critical',
    ], { cwd: root, stdio: 'pipe' });

    const report = JSON.parse(readFileSync(jsonFile, 'utf8'));
    assert.equal(report.services.length, 1);
    assert.equal(report.services[0].ecosystem, 'npm');
    assert.match(readFileSync(htmlFile, 'utf8'), /osv-ui/);
    assert.match(readFileSync(markdownFile, 'utf8'), /osv-ui CVE report/);
    assert.equal(JSON.parse(readFileSync(cdxFile, 'utf8')).bomFormat, 'CycloneDX');
    assert.equal(JSON.parse(readFileSync(spdxFile, 'utf8')).spdxVersion, 'SPDX-2.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
