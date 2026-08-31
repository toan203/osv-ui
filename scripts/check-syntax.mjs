import { readdirSync, statSync } from 'fs';
import { extname, join } from 'path';
import { spawnSync } from 'child_process';

const roots = ['bin', 'src', 'tests', 'scripts', 'packages/mcp/bin', 'packages/mcp/src'];
const files = roots.flatMap(root => collect(root));

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

process.stdout.write(`Syntax check passed for ${files.length} file(s).\n`);

function collect(path) {
  const stat = statSync(path);
  if (stat.isFile()) return ['.js', '.mjs', '.cjs'].includes(extname(path)) ? [path] : [];
  return readdirSync(path)
    .filter(name => !name.startsWith('.'))
    .flatMap(name => collect(join(path, name)));
}
