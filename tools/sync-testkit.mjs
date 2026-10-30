import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * Shared temporary-repository fixture for sync tests and measurements.
 *
 * The immutable source repository is built once per process and copied into a
 * fresh directory per scenario. Every copy owns its refs, index, working files
 * and bare remote; only `origin` is repointed at the copy's own remote.
 */

const counters = { gitProcesses: 0 };
export const gitCount = () => counters.gitProcesses;
export function resetGitCount() { counters.gitProcesses = 0; }

export function git(root, ...args) {
  counters.gitProcesses++;
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
export const write = (root, name, text) => fs.writeFile(path.join(root, name), text);
export const sha = root => git(root, 'rev-parse', 'HEAD');
export function commit(root, message) { git(root, 'add', '--all'); git(root, 'commit', '-m', message); return sha(root); }
export function identity(root, name) {
  git(root, 'config', 'user.name', name); git(root, 'config', 'user.email', `${name.toLowerCase()}@sync-test.invalid`);
  git(root, 'config', 'core.autocrlf', 'false');
}

const TEMPLATE_PREFIX = 'GameJam-sync-template-';
const WORKSPACE_PREFIX = 'GameJam-sync-tests-';
let templatePromise = null;

function removeTemplate(directory) {
  try { execFileSync(process.execPath, ['-e', `require('fs').rmSync(${JSON.stringify(directory)},{recursive:true,force:true})`], { windowsHide: true }); }
  catch { /* leave the template for the OS to reclaim */ }
}

async function buildTemplate() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), TEMPLATE_PREFIX));
  const remote = path.join(directory, 'remote.git');
  const alice = path.join(directory, 'alice workspace');
  const bob = path.join(directory, 'bob workspace');
  await fs.mkdir(remote);
  git(remote, 'init', '--bare', '--initial-branch=main');
  git(directory, 'clone', remote, alice);
  identity(alice, 'Alice');
  await write(alice, '.gitignore', '.env\nnode_modules/\n');
  await write(alice, '.gitattributes', '* text=auto eol=lf\n*.bin binary\n');
  await write(alice, 'a.txt', 'a initial\n');
  await write(alice, 'b.txt', 'b initial\n');
  await write(alice, 'image.bin', Buffer.from([0, 1, 2]));
  commit(alice, 'Initial');
  git(alice, 'push', '-u', 'origin', 'main');
  git(directory, 'clone', remote, bob);
  identity(bob, 'Bob');
  // The template is disposable; a late exit hook only reclaims disk space.
  process.once('exit', () => removeTemplate(directory));
  return { directory, remote, alice, bob };
}

export function templateRepository() {
  templatePromise ??= buildTemplate();
  return templatePromise;
}

/** Copy the immutable template into an isolated scenario directory. */
export async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), WORKSPACE_PREFIX));
  const source = await templateRepository();
  await fs.cp(source.directory, base, { recursive: true, force: true, dereference: false });
  const remote = path.join(base, 'remote.git');
  const alice = path.join(base, 'alice workspace');
  const bob = path.join(base, 'bob workspace');
  git(alice, 'remote', 'set-url', 'origin', remote);
  git(bob, 'remote', 'set-url', 'origin', remote);
  if (t) {
    t.after(async () => {
      if (path.dirname(base) !== path.resolve(os.tmpdir())) throw new Error(`Refusing to clean a non-temporary path: ${base}`);
      if (!path.basename(base).startsWith(WORKSPACE_PREFIX)) throw new Error(`Refusing to clean an unknown directory: ${base}`);
      await fs.rm(base, { recursive: true, force: true });
    });
  }
  const common = git(alice, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return { base, remote, alice, bob, common, directory: path.join(common, 'gamejam-sync') };
}

/** The pre-existing per-scenario construction, kept only for comparable measurements. */
export async function legacyFixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), WORKSPACE_PREFIX));
  if (t) t.after(async () => { await fs.rm(base, { recursive: true, force: true }); });
  const remote = path.join(base, 'remote.git');
  const alice = path.join(base, 'alice workspace');
  const bob = path.join(base, 'bob workspace');
  await fs.mkdir(remote);
  git(remote, 'init', '--bare', '--initial-branch=main');
  git(base, 'clone', remote, alice);
  identity(alice, 'Alice');
  await write(alice, '.gitignore', '.env\nnode_modules/\n');
  await write(alice, '.gitattributes', '* text=auto eol=lf\n*.bin binary\n');
  await write(alice, 'a.txt', 'a initial\n');
  await write(alice, 'b.txt', 'b initial\n');
  await write(alice, 'image.bin', Buffer.from([0, 1, 2]));
  commit(alice, 'Initial');
  git(alice, 'push', '-u', 'origin', 'main');
  git(base, 'clone', remote, bob);
  identity(bob, 'Bob');
  const common = git(alice, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return { base, remote, alice, bob, common, directory: path.join(common, 'gamejam-sync') };
}

export async function publishBob(f, name = 'b.txt', text = 'from Bob\n') {
  await write(f.bob, name, text);
  const id = commit(f.bob, 'Bob changes');
  git(f.bob, 'push');
  return id;
}

export const cleanCheck = () => {};
export const pushOptions = files => ({ taskId: 'npc-art', message: 'Update NPC art', files, check: cleanCheck });
