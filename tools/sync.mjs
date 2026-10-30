import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', env: gitEnv, timeout: 90_000, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const dirty = root => git(root, ['status', '--porcelain', '--untracked-files=all']) !== '';
function ensureMain(root) {
  if (git(root, ['branch', '--show-current']) !== 'main') {
    throw new Error('Sync only runs on main. Finish work on the current branch first.');
  }
  if (git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) !== 'origin/main') {
    throw new Error('Expected main to track origin/main.');
  }
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG']) {
    const file = git(root, ['rev-parse', '--path-format=absolute', '--git-path', marker]);
    if (existsSync(file)) throw new Error(`Finish the active Git operation first: ${marker}`);
  }
}

function counts(root) {
  const [ahead, behind] = git(root, ['rev-list', '--left-right', '--count', 'HEAD...origin/main']).split(/\s+/).map(Number);
  return { ahead, behind };
}

async function record(directory, result) {
  const entry = { ...result, checkedAt: new Date().toISOString() };
  await fs.writeFile(path.join(directory, 'status.json'), JSON.stringify(entry, null, 2) + '\n');
  return entry;
}

// All project sync commands share a lock. Never steal it from a live process.
async function acquireLock(directory) {
  const file = path.join(directory, 'lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(file, 'wx');
      await handle.writeFile(String(process.pid));
      return async () => { await handle.close(); await fs.unlink(file); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await fs.readFile(file, 'utf8'));
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid sync lock; inspect .git/gamejam-sync/lock.');
      try { process.kill(pid, 0); return null; }
      catch (probe) { if (probe.code !== 'ESRCH') return null; }
      await fs.unlink(file);
    }
  }
  return null;
}

export async function sync(root, command, { message, check = () => runChecks(root) } = {}) {
  const directory = git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'gamejam-sync']);
  await fs.mkdir(directory, { recursive: true });
  if (command === 'status') {
    let lastRun = null;
    try { lastRun = JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return { branch: git(root, ['branch', '--show-current']), dirty: dirty(root), ...counts(root), lastRun };
  }
  if (!['pull', 'push'].includes(command)) throw new Error('Usage: sync.mjs status | pull | push "Commit message"');
  if (command === 'push' && !message?.trim()) throw new Error('Provide a commit message: npm run sync:push -- "Describe changes"');
  const release = await acquireLock(directory);
  if (!release) return { state: 'busy', message: 'Another sync command is running.' };
  try {
    ensureMain(root);
    // Fetch even when dirty: source files stay untouched, remote progress is visible.
    git(root, ['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
    const progress = counts(root);
    if (progress.ahead && progress.behind) {
      return await record(directory, { state: 'diverged', ...progress, message: 'Both sides have commits. Merge origin/main manually; no files changed.' });
    }
    if (dirty(root) && command === 'pull') {
      return await record(directory, { state: 'dirty', ...progress, message: 'Local edits present. Automatic update paused; save and commit your work first.' });
    }
    if (progress.behind) {
      if (dirty(root)) return await record(directory, { state: 'dirty', ...progress, message: 'Remote changed while you were editing. Commit your work, then merge origin/main manually.' });
      git(root, ['merge', '--ff-only', '--no-edit', 'origin/main']);
    }
    if (command === 'push') {
      await check();
      // Checks may take time; refuse to stage if the branch changed meanwhile.
      ensureMain(root);
      git(root, ['add', '--all']);
      if (git(root, ['diff', '--cached', '--name-only'])) git(root, ['commit', '-m', message.trim()]);
      // A concurrent push is safely rejected by Git; never force-push.
      git(root, ['push', 'origin', 'HEAD:refs/heads/main']);
    }
    return await record(directory, {
      state: command === 'push' ? 'pushed' : progress.behind ? 'updated' : 'current',
      ...counts(root), commit: git(root, ['rev-parse', '--short', 'HEAD']),
      message: progress.behind ? 'Sources updated. If package-lock changed, run npm ci; rebuild offline HTML when needed.' : 'Sync complete.',
    });
  } catch (error) {
    await record(directory, { state: 'error', message: String(error.stderr || error.message).trim() });
    throw error;
  } finally { await release(); }
}

function runChecks(root) {
  // Run npm's JS entrypoint directly on Windows; no shell interpolation of messages.
  const bundledNpm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const npmCli = process.env.npm_execpath || (existsSync(bundledNpm) ? bundledNpm : null);
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, 'run', 'check'], { cwd: root, stdio: 'inherit', windowsHide: true, timeout: 600_000 })
    : spawnSync('npm', ['run', 'check'], { cwd: root, stdio: 'inherit', windowsHide: true, timeout: 600_000 });
  if (result.error || result.status !== 0) throw new Error(`Project checks failed: ${result.error?.message || result.status}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await sync(projectRoot, process.argv[2], { message: process.argv.slice(3).join(' ') });
    if (!process.argv.includes('--background') || !['current', 'dirty', 'busy'].includes(result.state)) console.log(JSON.stringify(result, null, 2));
    if (result.state === 'diverged' || (['dirty', 'busy'].includes(result.state) && !process.argv.includes('--background'))) process.exitCode = 2;
  } catch (error) { console.error(String(error.stderr || error.message).trim()); process.exitCode = 1; }
}
