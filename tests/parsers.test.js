import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseManifests } from '../src/parsers.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const fixtureExpectations = [
  ['javascript-npm', 'npm', 'package-lock.json', 4],
  ['javascript-pnpm', 'npm', 'pnpm-lock.yaml', 4],
  ['javascript-yarn', 'npm', 'yarn.lock', 4],
  ['python-pip', 'PyPI', 'requirements.txt', 5],
  ['python-pipenv', 'PyPI', 'Pipfile.lock', 5],
  ['python-poetry', 'PyPI', 'poetry.lock', 5],
  ['python-uv', 'PyPI', 'uv.lock', 5],
  ['go-service', 'Go', 'go.sum', 3],
  ['rust-service', 'crates.io', 'Cargo.lock', 3],
  ['java-maven', 'Maven', 'pom.xml', 3],
  ['php-composer', 'Packagist', 'composer.lock', 3],
  ['ruby-bundler', 'RubyGems', 'Gemfile.lock', 3],
];

test('parseManifests parses all ecosystem fixtures', () => {
  for (const [fixture, ecosystem, source, packageCount] of fixtureExpectations) {
    const manifests = parseManifests(join(root, 'test-fixture', fixture));
    assert.equal(manifests.length, 1, fixture);
    assert.equal(manifests[0].ecosystem, ecosystem, fixture);
    assert.equal(manifests[0].source, source, fixture);
    assert.equal(manifests[0].packages.length, packageCount, fixture);
  }
});

test('parseManifests ignores directories without supported manifests at that level', () => {
  const manifests = parseManifests(join(root, 'test-fixture'));
  assert.equal(manifests.length, 0);
});
