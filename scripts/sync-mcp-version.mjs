import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootPackagePath = join(root, 'package.json');
const mcpDir = join(root, 'packages', 'mcp');
const mcpPackagePath = join(mcpDir, 'package.json');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const coreVersion = readArg('--version') || readJson(rootPackagePath).version;
const requestedMcpVersion = readArg('--mcp-version');

assertVersion(coreVersion, 'osv-ui');
if (requestedMcpVersion) assertVersion(requestedMcpVersion, 'osv-ui-mcp');

const mcpPackage = readJson(mcpPackagePath);
const targetMcpVersion = requestedMcpVersion || mcpPackage.version;
const synchronized = mcpPackage.dependencies?.['osv-ui'] === coreVersion
  && mcpPackage.version === targetMcpVersion;

if (checkOnly) {
  if (!synchronized) {
    process.stderr.write(
      `MCP version mismatch: expected osv-ui=${coreVersion} and osv-ui-mcp=${targetMcpVersion}, `
      + `found osv-ui=${mcpPackage.dependencies?.['osv-ui']} and osv-ui-mcp=${mcpPackage.version}.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`MCP dependency is synchronized with osv-ui ${coreVersion}.\n`);
  process.exit(0);
}

mcpPackage.version = targetMcpVersion;
mcpPackage.dependencies = { ...mcpPackage.dependencies, 'osv-ui': coreVersion };
writeFileSync(mcpPackagePath, `${JSON.stringify(mcpPackage, null, 2)}\n`);

const install = spawnSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], {
  cwd: mcpDir,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (install.status !== 0) {
  process.stderr.write(`Unable to lock osv-ui ${coreVersion}. Publish the core package before synchronizing MCP.\n`);
  process.exit(install.status || 1);
}

process.stdout.write(`Synchronized osv-ui-mcp ${targetMcpVersion} with osv-ui ${coreVersion}.\n`);

function readArg(name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertVersion(version, packageName) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version || ''))) {
    throw new Error(`Invalid ${packageName} version: ${version}`);
  }
}
