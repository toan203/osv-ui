import { readFileSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';

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

// ── Python: requirements.txt ─────────────────────────────────────────────────
function parseRequirementsTxt(dir) {
  const reqPath = join(dir, 'requirements.txt');
  if (!existsSync(reqPath)) return null;
  const lines = readFileSync(reqPath, 'utf8').split('\n');
  const packages = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('-r') || line.startsWith('--')) continue;
    // strip inline comments
    line = line.split('#')[0].trim();
    // parse: package==1.2.3 or package>=1.0,<2.0 etc.
    const match = line.match(/^([A-Za-z0-9_.\-]+)\s*([=<>!~^].*)$/);
    if (!match) continue;
    const name = match[1];
    const spec  = match[2].trim();
    // Extract pinned version (==x.y.z) or best-guess from >= 
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
  // Parse TOML-like blocks: [[package]] ... name = "..." version = "..."
  const blocks = content.split(/\[\[package\]\]/g).slice(1);
  for (const block of blocks) {
    const name    = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || !version) continue;
    packages.push({
      name,
      version,
      ecosystem: 'PyPI',
      isDirect: false, // need pyproject.toml to know direct deps
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
  // Extract project.dependencies or tool.poetry.dependencies
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
  if (!existsSync(sumPath)) return null;

  const sumContent = readFileSync(sumPath, 'utf8');
  const modContent = existsSync(modPath) ? readFileSync(modPath, 'utf8') : '';

  const packages = [];
  const seen = new Set();
  
  // Parse go.sum
  // format: <module> <version>[/go.mod] <hash>
  const lines = sumContent.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    
    const name = parts[0];
    let version = parts[1];
    if (version.endsWith('/go.mod')) continue; // skip go.mod entries in go.sum

    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Is it direct? check go.mod
    const isDirect = modContent.includes(`\t${name} `) || modContent.includes(` ${name} `);

    packages.push({
      name,
      version,
      ecosystem: 'Go',
      isDirect,
      dev: false,
      registry: 'https://pkg.go.dev/' + name,
    });
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
  
  // Basic Cargo.toml parsing for direct dependencies
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

  // Parse [[package]] blocks
  const blocks = content.split(/\[\[package\]\]/g).slice(1);
  for (const block of blocks) {
    const name    = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || !version) continue;
    
    packages.push({
      name,
      version,
      ecosystem: 'crates.io',
      isDirect: directDeps.has(name),
      dev: false,
      registry: 'https://crates.io/crates/' + name,
    });
  }
  return packages;
}

// ── Main parser: detect ecosystem ─────────────────────────────────────────────
export function parseManifests(dir) {
  const results = [];

  // npm
  const npm = parseNpm(dir);
  if (npm) results.push({ type: 'npm', ...npm });

  // Go
  const goPackages = parseGo(dir);
  if (goPackages && goPackages.length > 0) {
    let goName = basename(resolve(dir)) || 'go-project';
    try {
      const modPath = join(dir, 'go.mod');
      if (existsSync(modPath)) {
        const modContent = readFileSync(modPath, 'utf8');
        const match = modContent.match(/^module\s+([^\s]+)/m);
        if (match) goName = match[1].split('/').pop();
      }
    } catch {}

    results.push({
      type: 'go',
      name: goName,
      version: '',
      ecosystem: 'Go',
      source: 'go.sum',
      packages: goPackages,
      directCount: goPackages.filter(p => p.isDirect).length
    });
  }

  // Rust
  const rustPackages = parseCargoLock(dir);
  if (rustPackages && rustPackages.length > 0) {
    let rustName = basename(resolve(dir)) || 'rust-project';
    try {
      const tomlPath = join(dir, 'Cargo.toml');
      if (existsSync(tomlPath)) {
        const tomlContent = readFileSync(tomlPath, 'utf8');
        const match = tomlContent.match(/^name\s*=\s*"([^"]+)"/m);
        if (match) rustName = match[1];
      }
    } catch {}

    results.push({
      type: 'rust',
      name: rustName,
      version: '',
      ecosystem: 'crates.io',
      source: 'Cargo.lock',
      packages: rustPackages,
      directCount: rustPackages.filter(p => p.isDirect).length
    });
  }

  // Python (try all, prefer lock files over requirements.txt)
  const pipfile  = parsePipfileLock(dir);
  const poetry   = parsePoetryLock(dir);
  const reqs     = parseRequirementsTxt(dir);
  const pyproj   = parsePyproject(dir);

  let pyPackages = null;
  let pySource   = null;
  if (pipfile)  { pyPackages = pipfile;  pySource = 'Pipfile.lock'; }
  else if (poetry) { pyPackages = poetry; pySource = 'poetry.lock'; }
  else if (reqs)   { pyPackages = reqs;   pySource = 'requirements.txt'; }
  else if (pyproj) { pyPackages = pyproj; pySource = 'pyproject.toml'; }

  if (pyPackages && pyPackages.length > 0) {
    // Try to get project name from pyproject.toml
    let pyName = basename(resolve(dir)) || 'python-project';
    try {
      const pjPath = join(dir, 'pyproject.toml');
      if (existsSync(pjPath)) {
        const pjContent = readFileSync(pjPath, 'utf8');
        pyName = pjContent.match(/^name\s*=\s*"([^"]+)"/m)?.[1]
          || pjContent.match(/\[tool\.poetry\][\s\S]*?^name\s*=\s*"([^"]+)"/m)?.[1]
          || pyName;
      }
      const setupPath = join(dir, 'setup.py');
      if (existsSync(setupPath)) {
        const sc = readFileSync(setupPath, 'utf8');
        pyName = sc.match(/name\s*=\s*["']([^"']+)/)?.[1] || pyName;
      }
    } catch {}
    results.push({ type: 'python', name: pyName, version: '', ecosystem: 'PyPI', source: pySource, packages: pyPackages, directCount: pyPackages.filter(p => p.isDirect).length });
  }

  return results;
}
