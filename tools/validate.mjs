import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root } from './build.mjs';

const errors = [];
function check(condition, message) { if (!condition) errors.push(message); }
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
const manifest = JSON.parse(await fs.readFile(path.join(root, 'PROJECT_MANIFEST.json'), 'utf8'));
const versionRoot = path.join(root, manifest.activeVersionPath);
check(manifest.gitWorkflow === true, 'gitWorkflow must be true');
check(manifest.repository === 'https://github.com/eretik-war/GameJam', 'Unexpected source repository');
for (const file of ['.gitignore', '.gitattributes', '.github/workflows/check.yml', 'tools/sync.mjs', 'tools/sync-engine.mjs', 'tools/sync-support.mjs', 'tools/sync-auto.ps1', 'SYNC_TOOL.md']) {
  check(await exists(path.join(root, file)), `Missing Git workflow file: ${file}`);
}
check(path.resolve(versionRoot) === path.join(root, 'versions', manifest.activeVersion), 'Active version pointer mismatch');
check(manifest.foundationLock === null, 'Portable starter must not require an external Foundation lock');
const index = await fs.readFile(path.join(versionRoot, 'dev-support/DOCUMENTATION_INDEX.md'), 'utf8');
check(index.includes('root_file: `AGENTS.md`'), 'Index must expose AGENTS');
for (const match of index.matchAll(/^file:\s*`([^`]+)`/gm)) {
  check(await exists(path.join(versionRoot, match[1])), `Broken index entry: ${match[1]}`);
}
const lock = JSON.parse(await fs.readFile(path.join(root, 'ENGINE_LOCK.json'), 'utf8'));
check(lock.version === '7.4.3', 'Unreviewed engine version');
for (const file of lock.files) {
  const bytes = await fs.readFile(path.join(root, file.path));
  check(createHash('sha256').update(bytes).digest('hex') === file.sha256, `Engine hash mismatch: ${file.path}`);
}
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const npmLock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  check(/^\d+\.\d+\.\d+$/.test(version), `Dependency is not exact: ${name}`);
  check(npmLock.packages[`node_modules/${name}`]?.version === version, `npm lock mismatch: ${name}`);
}
for (const name of ['AGENTS.md', 'READ_FIRST_LATEST_PROJECT.md', 'START_HERE.md']) check(await exists(path.join(root, name)), `Missing ${name}`);
for (const name of ['AGENTS.md', 'READ_FIRST_LATEST_PROJECT.md']) {
  check((await fs.readFile(path.join(root, name), 'utf8')).includes('[SYNC_TOOL.md](SYNC_TOOL.md)'), `Missing mandatory sync instruction link in ${name}`);
}

// Follow local Markdown links without traversing dependency trees or external drives.
async function verifyMarkdown(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'vendor', 'backups', 'work', 'builds'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await verifyMarkdown(file); continue; }
    if (!entry.name.endsWith('.md')) continue;
    const text = await fs.readFile(file, 'utf8');
    check(!/\{\{[A-Z0-9_]+\}\}/.test(text), `Unresolved template: ${file}`);
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
      check(resolved.startsWith(root + path.sep) || resolved === root, `Nonportable local link: ${file} -> ${target}`);
      check(await exists(resolved), `Broken Markdown link: ${file} -> ${target}`);
    }
  }
}
await verifyMarkdown(root);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Valid: pointers, engine SHA-256, exact npm locks, index and local documentation links.');
