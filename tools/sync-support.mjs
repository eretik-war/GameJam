import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

const environment = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_LITERAL_PATHSPECS: '1' };
export function git(root, args, { trim = true } = {}) {
  const output = execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', env: environment, timeout: 90_000, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
  });
  return trim ? output.trim() : output;
}
export function ancestor(root, older, newer) {
  const result = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', older, newer], {
    encoding: 'utf8', env: environment, timeout: 90_000, windowsHide: true,
  });
  if (result.error || ![0, 1].includes(result.status)) throw result.error || new Error(result.stderr);
  return result.status === 0;
}
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const head = root => git(root, ['rev-parse', 'HEAD']);
export const dirty = root => git(root, ['status', '--porcelain', '--untracked-files=all']) !== '';
export const changedPaths = (root, from, to) => git(root, ['diff', '--no-renames', '--name-only', '-z', from, to], { trim: false }).split('\0').filter(Boolean);
export function changes(root, from, to) {
  const parts = git(root, ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', from, to], { trim: false }).split('\0');
  const records = [];
  for (let i = 0; parts[i]; i += 2) {
    const [beforeMode, afterMode, beforeBlob, afterBlob, status] = parts[i].slice(1).split(' ');
    records.push({ status, path: parts[i + 1], beforeMode, afterMode, beforeBlob, afterBlob });
  }
  return records;
}
export function workingChanges(root) {
  const parts = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { trim: false }).split('\0');
  const records = [];
  for (let i = 0; parts[i]; i++) {
    const status = parts[i].slice(0, 2), file = parts[i].slice(3);
    records.push({ status, path: file, ...(/[RC]/.test(status) ? { from: parts[++i] } : {}) });
  }
  return records;
}
export function commits(root, from, to) {
  return git(root, ['rev-list', '--reverse', `${from}..${to}`]).split('\n').filter(Boolean).map(sha => {
    const [id, author, email, date, subject] = git(root, ['show', '-s', '--format=%H%x00%an%x00%ae%x00%aI%x00%s', sha]).split('\0');
    return { id, author, email, date, subject };
  });
}
export function ensureMain(root) {
  if (git(root, ['branch', '--show-current']) !== 'main') throw new Error('Sync only runs on main; no branch was changed.');
  if (git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) !== 'origin/main') throw new Error('Expected main to track origin/main.');
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG']) {
    if (existsSync(git(root, ['rev-parse', '--path-format=absolute', '--git-path', marker]))) throw new Error(`Finish the active Git operation first: ${marker}`);
  }
}
export async function readJSON(file, fallback = null) {
  try { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function writeJSON(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(temp, file);
}
export async function acquireLock(directory) {
  const file = path.join(directory, 'lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(file, 'wx');
      await handle.writeFile(String(process.pid));
      return async () => { await handle.close(); await fs.unlink(file); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await fs.readFile(file, 'utf8'));
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid sync lock; inspect gamejam-sync/lock.');
      try { process.kill(pid, 0); return null; }
      catch (probe) { if (probe.code !== 'ESRCH') return null; }
      await fs.unlink(file);
    }
  }
  return null;
}
export async function snapshotFiles(root, files, allowMissing = false) {
  const result = [];
  for (const name of files) {
    if (typeof name !== 'string' || !name || name.includes('\0') || name.includes('\\') || /^[A-Za-z]:/.test(name) || path.isAbsolute(name)
      || name.split('/').some(part => !part || ['.', '..', '.git'].includes(part))) throw new Error(`Invalid exact file path: ${name}`);
    let missing = false;
    const parts = name.split('/');
    for (let i = 0; i < parts.length; i++) {
      try {
        const stat = await fs.lstat(path.join(root, ...parts.slice(0, i + 1)));
        if (stat.isSymbolicLink() || (i === parts.length - 1 && !stat.isFile())) throw new Error(`Not a regular file: ${name}`);
      } catch (error) { if (error.code !== 'ENOENT') throw error; missing = true; break; }
    }
    if (missing) {
      if (!allowMissing && !git(root, ['ls-files', '--', name]) && !git(root, ['ls-tree', 'HEAD', '--', name])) throw new Error(`Unknown deleted file: ${name}`);
      result.push({ path: name, content: null });
    } else {
      // Refuse ignored/untracked secrets and generated files rather than forcing add.
      const ignoreEnvironment = { ...environment }; delete ignoreEnvironment.GIT_LITERAL_PATHSPECS;
      const ignored = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', name], { env: ignoreEnvironment, windowsHide: true, encoding: 'utf8' });
      if (ignored.error || ![0, 1].includes(ignored.status)) throw ignored.error || new Error(`check-ignore failed: ${ignored.stderr}`);
      if (ignored.status === 0) throw new Error(`Ignored file is outside the packet: ${name}`);
      const stat = await fs.stat(path.join(root, name));
      result.push({ path: name, content: hash(await fs.readFile(path.join(root, name))), mode: stat.mode & 0o111 });
    }
  }
  return hash(JSON.stringify(result));
}
export async function runChecks(root, logFile, changedFiles) {
  const bundledNpm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const npmCli = process.env.npm_execpath || (existsSync(bundledNpm) ? bundledNpm : null);
  if (!npmCli) throw new Error('npm CLI not found; install the locked Node/npm environment.');
  const pkg = await readJSON(path.join(root, 'package.json'), {});
  const affectsSync = !changedFiles || changedFiles.some(file => /^(?:tools\/sync|tools\/validate\.|package(?:-lock)?\.json$|\.github\/|SYNC_TOOL\.md$)/.test(file));
  const profile = !affectsSync && pkg.scripts?.['check:game'] ? 'check:game' : 'check';
  const result = spawnSync(process.execPath, [npmCli, 'run', profile], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GAMEJAM_SYNC_CHECK_COMMON: git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']) },
  });
  await fs.writeFile(logFile, `npm run ${profile}\n` + (result.stdout || '') + (result.stderr || ''));
  if (result.error || result.status !== 0) throw new Error(`Project checks failed: ${result.error?.message || result.status}; log: ${logFile}`);
  return { profile };
}
