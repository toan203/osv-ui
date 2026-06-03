import { readFileSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';

/**
 * Parser for Java Maven (pom.xml)
 * Uses regex to avoid a full XML parser dependency.
 */
function parseMaven(dir) {
  const pomPath = join(dir, 'pom.xml');
  const content = readFileSync(pomPath, 'utf8');
  const packages = [];
  const properties = {};

  const props = content.match(/<properties>([\s\S]*?)<\/properties>/)?.[1] || '';
  for (const prop of props.matchAll(/<([A-Za-z0-9_.-]+)>([^<]+)<\/\1>/g)) {
    properties[prop[1]] = prop[2].trim();
  }
  
  // Extract name/groupId for project name
  const group = content.match(/<groupId>([^<]+)<\/groupId>/)?.[1];
  const artifact = content.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
  const name = group && artifact ? `${group}:${artifact}` : basename(dir);

  // Match dependencies
  const depRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
  let match;
  while ((match = depRegex.exec(content)) !== null) {
    const depStr = match[1];
    const g = depStr.match(/<groupId>([^<]+)<\/groupId>/)?.[1];
    const a = depStr.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
    const rawVersion = depStr.match(/<version>([^<]+)<\/version>/)?.[1];
    const v = resolveMavenVersion(rawVersion, properties);
    const scope = depStr.match(/<scope>([^<]+)<\/scope>/)?.[1];
    
    if (g && a && v) {
      packages.push({
        name: `${g}:${a}`,
        version: v,
        ecosystem: 'Maven',
        isDirect: true,
        dev: scope === 'test',
        registry: `https://central.sonatype.com/artifact/${g}/${a}`,
      });
    }
  }
  return packages;
}

function resolveMavenVersion(version, properties) {
  if (!version) return null;
  const prop = version.match(/^\$\{([^}]+)\}$/)?.[1];
  return prop ? properties[prop] || version : version;
}

/**
 * Parser for PHP Composer (composer.lock)
 */
function parseComposer(dir) {
  const lock = JSON.parse(readFileSync(join(dir, 'composer.lock'), 'utf8'));
  const packages = [];
  
  const allPkgs = [...(lock.packages || []), ...(lock['packages-dev'] || [])];
  allPkgs.forEach(pkg => {
    packages.push({
      name: pkg.name,
      version: pkg.version.replace(/^v/, ''),
      ecosystem: 'Packagist',
      isDirect: false, // will cross-check with composer.json
    });
  });

  // Cross-check with composer.json for direct deps
  const jsonPath = join(dir, 'composer.json');
  if (existsSync(jsonPath)) {
    const config = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const direct = new Set([...Object.keys(config.require || {}), ...Object.keys(config['require-dev'] || {})]);
    packages.forEach(p => { if (direct.has(p.name)) p.isDirect = true; });
  }

  return packages;
}

function normalizeVersionSpec(spec) {
  const version = String(spec || '').match(/[0-9]+(?:\.[0-9A-Za-z-]+)+/)?.[0];
  return version || 'unknown';
}

function parseComposerJson(dir) {
  const jsonPath = join(dir, 'composer.json');
  if (!existsSync(jsonPath)) return null;
  const config = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const packages = [];
  for (const [section, isDev] of [['require', false], ['require-dev', true]]) {
    for (const [name, spec] of Object.entries(config[section] || {})) {
      if (name === 'php' || name.startsWith('ext-')) continue;
      packages.push({
        name,
        version: normalizeVersionSpec(spec),
        versionSpec: spec,
        ecosystem: 'Packagist',
        isDirect: true,
        dev: isDev,
        registry: 'https://packagist.org/packages/' + name,
      });
    }
  }
  return packages;
}

/**
 * Parser for Ruby Bundler (Gemfile.lock)
 */
function parseGemfileLock(dir) {
  const content = readFileSync(join(dir, 'Gemfile.lock'), 'utf8');
  const packages = [];
  
  // Specs section format: "    package (version)"
  const specLines = content.match(/^\s{4}([a-z0-9\-_.]+) \(([0-9a-z.]+)\)/gim) || [];
  specLines.forEach(line => {
    const m = line.trim().match(/^([a-z0-9\-_.]+) \(([0-9a-z.]+)\)/i);
    if (m) {
      packages.push({
        name: m[1],
        version: m[2],
        ecosystem: 'RubyGems',
        isDirect: false,
      });
    }
  });

  // Cross-check Gemfile for direct dependencies
  const gemfilePath = join(dir, 'Gemfile');
  if (existsSync(gemfilePath)) {
    const gemfileContent = readFileSync(gemfilePath, 'utf8');
    const directRegex = /gem\s+['"]([^'"]+)['"]/g;
    const direct = new Set();
    let m;
    while ((m = directRegex.exec(gemfileContent)) !== null) direct.add(m[1]);
    packages.forEach(p => { if (direct.has(p.name)) p.isDirect = true; });
  }

  return packages;
}

function parseGemfile(dir) {
  const gemfilePath = join(dir, 'Gemfile');
  if (!existsSync(gemfilePath)) return null;
  const content = readFileSync(gemfilePath, 'utf8');
  const packages = [];
  const regex = /^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const spec = match[2] || '';
    packages.push({
      name,
      version: normalizeVersionSpec(spec),
      versionSpec: spec || undefined,
      ecosystem: 'RubyGems',
      isDirect: true,
      dev: false,
      registry: 'https://rubygems.org/gems/' + name,
    });
  }
  return packages;
}

// ── npm: parse package-lock.json v2/v3 ──────────────────────────────────────
export function parseNpm(dir) {
  const lockPath = join(dir, 'package-lock.json');
  const pkgPath  = join(dir, 'package.json');
  if (!existsSync(lockPath)) return null;

  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const pkg  = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};

  const root = lock.packages?.[''] || {};
  const directNames = new Set([
    ...Object.keys(root.dependencies || {}),
    ...Object.keys(root.devDependencies || {}),
    ...Object.keys(root.peerDependencies || {}),
  ]);

  const packages = Object.entries(lock.packages || {})
    .filter(([k]) => k !== '' && k.startsWith('node_modules/'))
    .map(([k, v]) => {
      const name = k.replace(/^node_modules\//, '').replace(/\/node_modules\//, '/');
      return {
        name,
        version: v.version || '0.0.0',
        ecosystem: 'npm',
        isDirect: directNames.has(name),
        dev: !!v.dev,
        resolved: v.resolved || '',
        registry: 'https://www.npmjs.com/package/' + name,
      };
    })
    .filter(p => p.version !== '0.0.0');

  return {
    name: pkg.name || basename(resolve(dir)) || 'npm-project',
    version: pkg.version || '0.0.0',
    ecosystem: 'npm',
    lockVersion: lock.lockfileVersion,
    packages,
    directCount: directNames.size,
  };
}

// ── Node.js: pnpm-lock.yaml ────────────────────────────────────────────────
function parsePnpmLock(dir) {
  const path = join(dir, 'pnpm-lock.yaml');
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf8');
  const packages = [];
  const matches = content.matchAll(/^\s*\/([^@\s/]+(?:@[^@\s/]+)?|@[^@\s/]+\/[^@\s/]+)@([^\s:]+):/gm);
  const seen = new Set();

  for (const match of matches) {
    const name = match[1];
    const version = match[2];
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Cross-check with package.json for direct deps
    let isDirect = false;
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const direct = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
      if (direct.has(name)) isDirect = true;
    }

    packages.push({
      name,
      version,
      ecosystem: 'npm',
      isDirect,
      dev: false,
      registry: 'https://www.npmjs.com/package/' + name,
    });
  }
  return { packages, source: 'pnpm-lock.yaml' };
}

// ── Node.js: yarn.lock ──────────────────────────────────────────────────────
function parseYarnLock(dir) {
  const path = join(dir, 'yarn.lock');
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf8');
  const packages = [];
  const seen = new Set();

  // v1
  const v1Matches = content.matchAll(/^"?([^@\s"]+)@.+:"?\s*\n\s*version\s+"?([^"\s]+)"?/gm);
  for (const match of v1Matches) {
    const name = match[1];
    const version = match[2];
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Cross-check with package.json for direct deps
    let isDirect = false;
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const direct = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
      if (direct.has(name)) isDirect = true;
    }
    packages.push({ name, version, ecosystem: 'npm', isDirect, dev: false, registry: 'https://www.npmjs.com/package/' + name });
  }

  // v2+
  if (packages.length === 0) {
    const v2Matches = content.matchAll(/^\s*([^@\s:]+)@(?:npm|yarn):.+:\s*\n\s*version:\s*([^\s]+)/gm);
    for (const match of v2Matches) {
      const name = match[1];
      const version = match[2];
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Cross-check with package.json for direct deps
      let isDirect = false;
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        const direct = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
        if (direct.has(name)) isDirect = true;
      }
      packages.push({ name, version, ecosystem: 'npm', isDirect, dev: false, registry: 'https://www.npmjs.com/package/' + name });
    }
  }

  return { packages, source: 'yarn.lock' };
}

// ── Python: requirements.txt ─────────────────────────────────────────────────
function parseRequirementsTxt(dir) {
  const reqPath = join(dir, 'requirements.txt');
  if (!existsSync(reqPath)) return null;
  const lines = readFileSync(reqPath, 'utf8').split('\n');
  const packages = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('-r') || line.startsWith('--')) continue;
    line = line.split('#')[0].trim();
    const match = line.match(/^([A-Za-z0-9_.\-]+)\s*([=<>!~^].*)$/);
    if (!match) continue;
    const name = match[1];
    const spec  = match[2].trim();
    const pinned = spec.match(/==\s*([^\s,;]+)/)?.[1]
      || spec.match(/~=\s*([^\s,;]+)/)?.[1]
      || null;
    packages.push({
      name,
      version: pinned || 'unknown',
      versionSpec: spec,
      ecosystem: 'PyPI',
      isDirect: true,
      dev: false,
      registry: 'https://pypi.org/project/' + name,
    });
  }
  return packages;
}

// ── Python: Pipfile.lock ──────────────────────────────────────────────────────
function parsePipfileLock(dir) {
  const path = join(dir, 'Pipfile.lock');
  if (!existsSync(path)) return null;
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  const packages = [];
  for (const [section, isDev] of [['default', false], ['develop', true]]) {
    for (const [name, info] of Object.entries(lock[section] || {})) {
      const version = (info.version || '').replace('==', '').replace('=', '').trim();
      if (!version) continue;
      packages.push({
        name,
        version,
        ecosystem: 'PyPI',
        isDirect: true,
        dev: isDev,
        registry: 'https://pypi.org/project/' + name,
      });
    }
  }
  return packages;
}

// ── Python: poetry.lock ────────────────────────────────────────────────────── 
function parsePoetryLock(dir) {
  const path = join(dir, 'poetry.lock');
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf8');
  const packages = [];
  const blocks = content.split(/\[\[package\]\]/g).slice(1);
  for (const block of blocks) {
    const name    = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || !version) continue;
    packages.push({
      name,
      version,
      ecosystem: 'PyPI',
      isDirect: false,
      dev: false,
      registry: 'https://pypi.org/project/' + name,
    });
  }
  return packages;
}

// ── Python: uv.lock ──────────────────────────────────────────────────────────
function parseUvLock(dir) {
  const path = join(dir, 'uv.lock');
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf8');
  const packages = [];
  const blocks = content.split(/\[\[package\]\]/g).slice(1);
  for (const block of blocks) {
    const name    = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || !version) continue;
    packages.push({
      name,
      version,
      ecosystem: 'PyPI',
      isDirect: false,
      dev: false,
      registry: 'https://pypi.org/project/' + name,
    });
  }
  return packages;
}

// ── Python: pyproject.toml ────────────────────────────────────────────────────
function parsePyproject(dir) {
  const path = join(dir, 'pyproject.toml');
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf8');
  const depSection = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([^\]]+)\]/)?.[1]
    || content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[)/)?.[1]
    || '';
  const packages = [];
  const lines = depSection.split('\n');
  for (let line of lines) {
    line = line.trim().replace(/[",]/g, '').split('#')[0].trim();
    if (!line || line.startsWith('[') || line === 'python') continue;
    const match = line.match(/^([A-Za-z0-9_.\-]+)\s*([=<>!~^].*)$/);
    if (!match) {
      if (/^[A-Za-z0-9_.\-]+$/.test(line)) {
        packages.push({ name: line, version: 'unknown', ecosystem: 'PyPI', isDirect: true, dev: false, registry: 'https://pypi.org/project/' + line });
      }
      continue;
    }
    const name = match[1];
    const spec  = match[2];
    const version = spec.match(/[=~]=\s*([^\s,;]+)/)?.[1] || 'unknown';
    packages.push({ name, version, versionSpec: spec, ecosystem: 'PyPI', isDirect: true, dev: false, registry: 'https://pypi.org/project/' + name });
  }
  return packages;
}

// ── Go: go.mod & go.sum ──────────────────────────────────────────────────────
function parseGo(dir) {
  const sumPath = join(dir, 'go.sum');
  const modPath = join(dir, 'go.mod');
  if (!existsSync(sumPath) && !existsSync(modPath)) return null;
  const sumContent = existsSync(sumPath) ? readFileSync(sumPath, 'utf8') : '';
  const modContent = existsSync(modPath) ? readFileSync(modPath, 'utf8') : '';
  const packages = [];
  const seen = new Set();

  if (sumContent) {
    const lines = sumContent.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const name = parts[0];
      let version = parts[1];
      if (version.endsWith('/go.mod')) continue;
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isDirect = modContent.includes(`\t${name} `) || modContent.includes(` ${name} `);
      packages.push({ name, version, ecosystem: 'Go', isDirect, dev: false, registry: 'https://pkg.go.dev/' + name });
    }
  } else {
    for (const match of modContent.matchAll(/^\s*([^\s]+)\s+(v[^\s]+)(?:\s+\/\/\s+indirect)?/gm)) {
      const name = match[1];
      if (name === 'module' || name === 'go' || name === 'require') continue;
      const version = match[2];
      const line = match[0];
      packages.push({
        name,
        version,
        ecosystem: 'Go',
        isDirect: !line.includes('// indirect'),
        dev: false,
        registry: 'https://pkg.go.dev/' + name,
      });
    }
  }
  return packages;
}

// ── Rust: Cargo.lock ─────────────────────────────────────────────────────────
function parseCargoLock(dir) {
  const lockPath = join(dir, 'Cargo.lock');
  const tomlPath = join(dir, 'Cargo.toml');
  if (!existsSync(lockPath)) return null;
  const content = readFileSync(lockPath, 'utf8');
  const tomlContent = existsSync(tomlPath) ? readFileSync(tomlPath, 'utf8') : '';
  const packages = [];
  const directDeps = new Set();
  if (tomlContent) {
    const depSection = tomlContent.split(/\[(?:dev-)?dependencies\]/);
    depSection.slice(1).forEach(section => {
      const lines = section.split('\n');
      for (const line of lines) {
        if (line.startsWith('[')) break;
        const match = line.match(/^\s*([A-Za-z0-9_\-]+)\s*=/);
        if (match) directDeps.add(match[1]);
      }
    });
  }
  const blocks = content.split(/\[\[package\]\]/g).slice(1);
  for (const block of blocks) {
    const name    = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || !version) continue;
    packages.push({ name, version, ecosystem: 'crates.io', isDirect: directDeps.has(name), dev: false, registry: 'https://crates.io/crates/' + name });
  }
  return packages;
}

// ── Main parser: detect ecosystem ─────────────────────────────────────────────
export function parseManifests(dir) {
  const results = [];
  const categories = [
    {
      id: 'java',
      order: [
        { file: 'pom.xml', parser: d => ({ packages: parseMaven(d), ecosystem: 'Maven', source: 'pom.xml' }) }
      ]
    },
    {
      id: 'php',
      order: [
        { file: 'composer.lock', parser: d => ({ packages: parseComposer(d), ecosystem: 'Packagist', source: 'composer.lock' }) },
        { file: 'composer.json', parser: d => ({ packages: parseComposerJson(d), ecosystem: 'Packagist', source: 'composer.json' }) }
      ]
    },
    {
      id: 'ruby',
      order: [
        { file: 'Gemfile.lock', parser: d => ({ packages: parseGemfileLock(d), ecosystem: 'RubyGems', source: 'Gemfile.lock' }) },
        { file: 'Gemfile', parser: d => ({ packages: parseGemfile(d), ecosystem: 'RubyGems', source: 'Gemfile' }) }
      ]
    },
    {
      id: 'npm',
      order: [
        { file: 'pnpm-lock.yaml', parser: d => { const r = parsePnpmLock(d); return r ? { ...r, ecosystem: 'npm' } : null; } },
        { file: 'package-lock.json', parser: d => { const r = parseNpm(d); return r ? { packages: r.packages, ecosystem: 'npm', source: 'package-lock.json' } : null; } },
        { file: 'yarn.lock', parser: d => { const r = parseYarnLock(d); return r ? { ...r, ecosystem: 'npm' } : null; } },
        { file: 'package.json', parser: d => { 
            const p = join(d, 'package.json');
            if (!existsSync(p)) return null;
            const pkg = JSON.parse(readFileSync(p, 'utf8'));
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            const pkgs = Object.entries(deps).map(([n, v]) => ({
              name: n, version: v.replace(/[~^>=<]/g, ''), ecosystem: 'npm', isDirect: true, dev: false, registry: 'https://www.npmjs.com/package/' + n
            }));
            return { packages: pkgs, ecosystem: 'npm', source: 'package.json' };
          } 
        }
      ]
    },
    {
      id: 'python',
      order: [
        { file: 'uv.lock', parser: d => ({ packages: parseUvLock(d), ecosystem: 'PyPI', source: 'uv.lock' }) },
        { file: 'poetry.lock', parser: d => ({ packages: parsePoetryLock(d), ecosystem: 'PyPI', source: 'poetry.lock' }) },
        { file: 'Pipfile.lock', parser: d => ({ packages: parsePipfileLock(d), ecosystem: 'PyPI', source: 'Pipfile.lock' }) },
        { file: 'requirements.txt', parser: d => ({ packages: parseRequirementsTxt(d), ecosystem: 'PyPI', source: 'requirements.txt' }) },
        { file: 'pyproject.toml', parser: d => ({ packages: parsePyproject(d), ecosystem: 'PyPI', source: 'pyproject.toml' }) }
      ]
    },
    {
      id: 'go',
      order: [
        { file: 'go.sum', parser: d => ({ packages: parseGo(d), ecosystem: 'Go', source: 'go.sum' }) },
        { file: 'go.mod', parser: d => ({ packages: parseGo(d), ecosystem: 'Go', source: 'go.mod' }) }
      ]
    },
    {
      id: 'rust',
      order: [
        { file: 'Cargo.lock', parser: d => ({ packages: parseCargoLock(d), ecosystem: 'crates.io', source: 'Cargo.lock' }) }
      ]
    }
  ];

  for (const cat of categories) {
    for (const entry of cat.order) {
      if (existsSync(join(dir, entry.file))) {
        try {
          const result = entry.parser(dir);
          if (result && result.packages && result.packages.length > 0) {
            let name = basename(dir);
            let version = '0.0.0';
            if (cat.id === 'npm') {
              const pPath = join(dir, 'package.json');
              if (existsSync(pPath)) {
                const pj = JSON.parse(readFileSync(pPath, 'utf8'));
                name = pj.name || name;
                version = pj.version || version;
                const direct = new Set([...Object.keys(pj.dependencies || {}), ...Object.keys(pj.devDependencies || {})]);
                result.packages.forEach(p => p.isDirect = direct.has(p.name));
              }
            } else if (cat.id === 'java') {
              const pomPath = join(dir, 'pom.xml');
              if (existsSync(pomPath)) {
                const pc = readFileSync(pomPath, 'utf8');
                const g = pc.match(/<groupId>([^<]+)<\/groupId>/)?.[1];
                const a = pc.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
                if (g && a) name = `${g}:${a}`;
              }
            } else if (cat.id === 'php') {
              const cjPath = join(dir, 'composer.json');
              if (existsSync(cjPath)) {
                const cj = JSON.parse(readFileSync(cjPath, 'utf8'));
                name = cj.name || name;
              }
            } else if (cat.id === 'ruby') {
              // Ruby projects often don't have name in Gemfile, use dir
            } else if (cat.id === 'python') {
              const pjPath = join(dir, 'pyproject.toml');
              if (existsSync(pjPath)) {
                const pjContent = readFileSync(pjPath, 'utf8');
                name = pjContent.match(/^name\s*=\s*"([^"]+)"/m)?.[1]
                  || pjContent.match(/\[tool\.poetry\][\s\S]*?^name\s*=\s*"([^"]+)"/m)?.[1]
                  || name;

                // Mark direct deps
                const direct = new Set();
                const depSection = pjContent.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([^\]]+)\]/)?.[1]
                  || pjContent.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\n\[)/)?.[1]
                  || '';
                depSection.split('\n').forEach(line => {
                  const m = line.trim().replace(/[",\s]/g, '').split(/[=<>!~^#]/)[0];
                  if (m && m !== 'python' && !m.startsWith('[')) direct.add(m);
                });
                result.packages.forEach(p => {
                  if (direct.has(p.name)) p.isDirect = true;
                });
              }
            } else if (cat.id === 'go') {
              const modPath = join(dir, 'go.mod');
              if (existsSync(modPath)) {
                const mc = readFileSync(modPath, 'utf8');
                const m = mc.match(/^module\s+([^\s]+)/m);
                if (m) name = m[1].split('/').pop();
              }
            } else if (cat.id === 'rust') {
              const tomlPath = join(dir, 'Cargo.toml');
              if (existsSync(tomlPath)) {
                const tc = readFileSync(tomlPath, 'utf8');
                const m = tc.match(/^name\s*=\s*"([^"]+)"/m);
                if (m) name = m[1];
              }
            }
            results.push({
              type: cat.id,
              name,
              ecosystem: result.ecosystem,
              version,
              source: entry.file,
              packages: result.packages,
              directCount: result.packages.filter(p => p.isDirect).length
            });
            break;
          }
        } catch (e) {
          console.error(`Error parsing ${entry.file} in ${dir}:`, e);
        }
      }
    }
  }
  return results;
}
