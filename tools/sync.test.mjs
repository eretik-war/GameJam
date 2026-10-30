import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { sync } from './sync.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, name, text) => fs.writeFile(path.join(root, name), text);
function commit(root, message) { git(root, 'add', '--all'); git(root, 'commit', '-m', message); }
function identity(root) {
  git(root, 'config', 'user.name', 'Sync Test');
  git(root, 'config', 'user.email', 'sync-test@example.invalid');
  git(root, 'config', 'core.autocrlf', 'false');
}

test('two collaborators synchronize without losing edits', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'GameJam-sync-tests-'));
  t.after(async () => {
    assert.equal(path.dirname(base), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('GameJam-sync-tests-'));
    await fs.rm(base, { recursive: true, force: true });
  });
  const remote = path.join(base, 'remote.git');
  const alice = path.join(base, 'alice workspace');
  const bob = path.join(base, 'bob workspace');
  await fs.mkdir(remote);
  git(remote, 'init', '--bare', '--initial-branch=main');
  git(base, 'clone', remote, alice);
  identity(alice);
  await write(alice, '.gitattributes', '* text eol=lf\n');
  await write(alice, 'game.txt', 'initial\n');
  commit(alice, 'Initial');
  git(alice, 'push', '-u', 'origin', 'main');
  git(base, 'clone', remote, bob);
  identity(bob);

  await t.test('clean workspace receives a collaborator commit', async () => {
    await write(bob, 'game.txt', 'from bob\n');
    commit(bob, 'Bob changes'); git(bob, 'push');
    assert.equal((await sync(alice, 'pull')).state, 'updated');
    assert.equal(await fs.readFile(path.join(alice, 'game.txt'), 'utf8'), 'from bob\n');
  });

  await t.test('tracked and untracked edits pause updates', async () => {
    await write(alice, 'game.txt', 'alice unfinished\n');
    await write(alice, 'notes.txt', 'untracked work\n');
    await write(bob, 'game.txt', 'bob second\n');
    commit(bob, 'Bob second'); git(bob, 'push');
    const before = git(alice, 'rev-parse', 'HEAD');
    assert.equal((await sync(alice, 'pull')).state, 'dirty');
    assert.equal(git(alice, 'rev-parse', 'HEAD'), before);
    assert.equal(await fs.readFile(path.join(alice, 'game.txt'), 'utf8'), 'alice unfinished\n');
    assert.equal((await sync(alice, 'push', { message: 'Pause', check() { assert.fail('Must not check or stage while remote is ahead and workspace dirty'); } })).state, 'dirty');
    assert.equal(git(alice, 'rev-parse', 'HEAD'), before);
  });

  await t.test('diverged commits stay intact until manual merge', async () => {
    commit(alice, 'Alice work saved');
    const before = git(alice, 'rev-parse', 'HEAD');
    assert.equal((await sync(alice, 'pull')).state, 'diverged');
    assert.equal((await sync(alice, 'push', { message: 'Do not push', check() { assert.fail('Must not run checks on divergence'); } })).state, 'diverged');
    assert.equal(git(alice, 'rev-parse', 'HEAD'), before);
    assert.equal(git(bob, 'rev-parse', 'HEAD'), git(bob, 'rev-parse', 'origin/main'));
  });

  await t.test('another branch and active merge are untouched', async () => {
    git(bob, 'switch', '-c', 'feature');
    await assert.rejects(sync(bob, 'pull'), /only runs on main/);
    git(bob, 'switch', 'main');
    const marker = git(bob, 'rev-parse', '--path-format=absolute', '--git-path', 'MERGE_HEAD');
    await fs.writeFile(marker, git(bob, 'rev-parse', 'HEAD') + '\n');
    await assert.rejects(sync(bob, 'pull'), /active Git operation/);
    await fs.unlink(marker);
  });

  await t.test('failed checks do not stage, commit or push', async () => {
    await write(bob, 'other.txt', 'new work\n');
    const before = git(bob, 'rev-parse', 'HEAD');
    await assert.rejects(sync(bob, 'push', { message: 'Must fail', check() { throw new Error('Check failed'); } }), /Check failed/);
    assert.equal(git(bob, 'rev-parse', 'HEAD'), before);
    assert.equal(git(bob, 'diff', '--cached', '--name-only'), '');
    assert.equal(await fs.readFile(path.join(bob, 'other.txt'), 'utf8'), 'new work\n');
  });

  await t.test('one-command publication preserves literal commit messages', async () => {
    const message = 'Literal $(echo unsafe) `text` "quotes"';
    let checks = 0;
    assert.equal((await sync(bob, 'push', { message, check() { checks++; } })).state, 'pushed');
    assert.equal(checks, 1);
    assert.equal(git(bob, 'log', '-1', '--format=%s'), message);
    assert.equal(git(remote, 'rev-parse', 'main'), git(bob, 'rev-parse', 'HEAD'));
  });

  await t.test('live lock blocks a second sync; status records the last result', async () => {
    const directory = git(bob, 'rev-parse', '--path-format=absolute', '--git-path', 'gamejam-sync');
    await fs.writeFile(path.join(directory, 'lock'), String(process.pid));
    assert.equal((await sync(bob, 'pull')).state, 'busy');
    await fs.unlink(path.join(directory, 'lock'));
    assert.equal((await sync(bob, 'status')).lastRun.state, 'pushed');
    assert.equal((await sync(bob, 'pull')).state, 'current');
  });
});
