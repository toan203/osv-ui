import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifests } from '../src/parsers.js';
import { createProject, npmFixture, removeProject } from './helpers.js';

const fixtureExpectations = [
  [npmFixture, 'npm', 'package-lock.json', 3],
  [{
    'package.json': { name: 'pnpm-app', dependencies: { lodash: '4.17.20' } },
    'pnpm-lock.yaml': "lockfileVersion: '6.0'\npackages:\n  /lodash@4.17.20:\n    resolution: {}\n",
  }, 'npm', 'pnpm-lock.yaml', 1],
  [{
    'package.json': { name: 'yarn-app', dependencies: { lodash: '^4.17.20' } },
    'yarn.lock': 'lodash@^4.17.20:\n  version "4.17.20"\n',
  }, 'npm', 'yarn.lock', 1],
  [{ 'requirements.txt': 'requests==2.25.1\ndjango==3.2.0\n' }, 'PyPI', 'requirements.txt', 2],
  [{ 'Pipfile.lock': { default: { requests: { version: '==2.25.1' } }, develop: {} } }, 'PyPI', 'Pipfile.lock', 1],
  [{ 'poetry.lock': '[[package]]\nname = "requests"\nversion = "2.25.1"\n' }, 'PyPI', 'poetry.lock', 1],
  [{ 'uv.lock': 'version = 1\n[[package]]\nname = "requests"\nversion = "2.25.1"\n' }, 'PyPI', 'uv.lock', 1],
  [{
    'go.mod': 'module example.test/app\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.7.0\n',
    'go.sum': 'github.com/gin-gonic/gin v1.7.0 h1:test\n',
  }, 'Go', 'go.sum', 1],
  [{
    'Cargo.toml': '[package]\nname = "rust-app"\nversion = "0.1.0"\n[dependencies]\ntokio = "1.0.1"\n',
    'Cargo.lock': '[[package]]\nname = "tokio"\nversion = "1.0.1"\n',
  }, 'crates.io', 'Cargo.lock', 1],
  [{
    'pom.xml': '<project><groupId>com.example</groupId><artifactId>app</artifactId><properties><log4j.version>2.14.1</log4j.version></properties><dependencies><dependency><groupId>org.apache.logging.log4j</groupId><artifactId>log4j-core</artifactId><version>${log4j.version}</version></dependency></dependencies></project>',
  }, 'Maven', 'pom.xml', 1],
  [{
    'composer.json': { name: 'example/app', require: { 'guzzlehttp/guzzle': '6.5.5' } },
    'composer.lock': { packages: [{ name: 'guzzlehttp/guzzle', version: '6.5.5' }], 'packages-dev': [{ name: 'phpunit/phpunit', version: '9.0.0' }] },
  }, 'Packagist', 'composer.lock', 2],
  [{
    Gemfile: "source 'https://rubygems.org'\ngem 'rack', '2.2.2'\n",
    'Gemfile.lock': 'GEM\n  specs:\n    rack (2.2.2)\n',
  }, 'RubyGems', 'Gemfile.lock', 1],
];

test('parseManifests parses supported ecosystem fixtures from a clean checkout', () => {
  for (const [files, ecosystem, source, packageCount] of fixtureExpectations) {
    const dir = createProject(files);
    try {
      const manifests = parseManifests(dir);
      assert.equal(manifests.length, 1, source);
      assert.equal(manifests[0].ecosystem, ecosystem, source);
      assert.equal(manifests[0].source, source, source);
      assert.equal(manifests[0].packages.length, packageCount, source);
    } finally {
      removeProject(dir);
    }
  }
});

test('parseNpm keeps nested package identities and versions distinct', () => {
  const dir = createProject(npmFixture);
  try {
    const packages = parseManifests(dir)[0].packages;
    assert.deepEqual(
      packages.map(pkg => `${pkg.name}@${pkg.version}`).sort(),
      ['@scope/child@2.0.0', 'lodash@4.17.19', 'lodash@4.17.20'],
    );
  } finally {
    removeProject(dir);
  }
});

test('parseManifests ignores directories without supported manifests', () => {
  const dir = createProject({ 'README.md': '# empty' });
  try {
    assert.equal(parseManifests(dir).length, 0);
  } finally {
    removeProject(dir);
  }
});
