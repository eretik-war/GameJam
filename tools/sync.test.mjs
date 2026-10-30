import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { sync, parseArguments } from './sync.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, name, text) => fs.writeFile(path.join(root, name), text);
const sha = root => git(root, 'rev-parse', 'HEAD');
const cleanCheck = () => {};
function commit(root, message) { git(root, 'add', '--all'); git(root, 'commit', '-m', message); return sha(root); }
function identity(root, name) {
  git(root, 'config', 'user.name', name); git(root, 'config', 'user.email', `${name.toLowerCase()}@sync-test.invalid`);
  git(root, 'config', 'core.autocrlf', 'false');
}
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'GameJam-sync-tests-'));
  t.after(async () => {
    assert.equal(path.dirname(base), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('GameJam-sync-tests-'));
    await fs.rm(base, { recursive: true, force: true });
  });
  const remote = path.join(base, 'remote.git'), alice = path.join(base, 'alice workspace'), bob = path.join(base, 'bob workspace');
  await fs.mkdir(remote); git(remote, 'init', '--bare', '--initial-branch=main'); git(base, 'clone', remote, alice); identity(alice, 'Alice');
  await write(alice, '.gitignore', '.env\nnode_modules/\n');
  await write(alice, '.gitattributes', '* text=auto eol=lf\n*.bin binary\n');
  await write(alice, 'a.txt', 'a initial\n'); await write(alice, 'b.txt', 'b initial\n');
  await write(alice, 'image.bin', Buffer.from([0, 1, 2]));
  commit(alice, 'Initial'); git(alice, 'push', '-u', 'origin', 'main');
  git(base, 'clone', remote, bob); identity(bob, 'Bob');
  const common = git(alice, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return { base, remote, alice, bob, common, directory: path.join(common, 'gamejam-sync') };
}
async function publishBob(f, name = 'b.txt', text = 'from Bob\n') {
  await write(f.bob, name, text); const id = commit(f.bob, 'Bob changes'); git(f.bob, 'push'); return id;
}
const pushOptions = files => ({ taskId: 'npc-art', message: 'Update NPC art', files, check: cleanCheck });

test('compare records the entire incoming/outgoing packet and authors without changing source files', async t => {
  const f = await fixture(t); await publishBob(f);
  await write(f.alice, 'a.txt', 'from Alice\n'); commit(f.alice, 'Alice work');
  await write(f.alice, 'notes.txt', 'unfinished'); const before = sha(f.alice);
  const result = await sync(f.alice, 'compare'); const report = JSON.parse(await fs.readFile(result.report, 'utf8'));
  assert.equal(result.state, 'compared'); assert.equal(result.incomingFiles, 1); assert.equal(result.outgoingCommits, 1);
  assert.equal(report.before.incoming.commits[0].author, 'Bob'); assert.equal(report.before.outgoing.commits[0].author, 'Alice');
  assert.deepEqual(report.before.incoming.files.map(({ status, path }) => ({ status, path })), [{ status: 'M', path: 'b.txt' }]);
  assert.notEqual(report.before.incoming.files[0].beforeBlob, report.before.incoming.files[0].afterBlob);
  assert.ok(report.before.working.some(x => x.path === 'notes.txt')); assert.equal(sha(f.alice), before);
  assert.equal(await fs.readFile(path.join(f.alice, 'notes.txt'), 'utf8'), 'unfinished');
});

test('pull checks the isolated fast-forward result before updating the source', async t => {
  const f = await fixture(t); const remote = await publishBob(f); const before = sha(f.alice); let checked = 0;
  const result = await sync(f.alice, 'pull', { check: async working => {
    assert.notEqual(working, f.alice); assert.equal(sha(f.alice), before);
    assert.equal(await fs.readFile(path.join(working, 'b.txt'), 'utf8'), 'from Bob\n'); checked++;
  } });
  assert.equal(result.state, 'updated'); assert.equal(sha(f.alice), remote); assert.equal(checked, 1);
});

test('diverged nonconflicting history merges automatically and preserves both authors', async t => {
  const f = await fixture(t); await write(f.alice, 'a.txt', 'Alice\n'); const own = commit(f.alice, 'Alice work');
  const theirs = await publishBob(f); const result = await sync(f.alice, 'pull', { check: cleanCheck });
  assert.equal(result.state, 'updated'); git(f.alice, 'merge-base', '--is-ancestor', own, 'HEAD'); git(f.alice, 'merge-base', '--is-ancestor', theirs, 'HEAD');
  assert.equal(git(f.alice, 'show', '-s', '--format=%an', theirs), 'Bob');
  assert.equal(await fs.readFile(path.join(f.alice, 'a.txt'), 'utf8'), 'Alice\n');
  assert.equal(await fs.readFile(path.join(f.alice, 'b.txt'), 'utf8'), 'from Bob\n');
});

for (const binary of [false, true]) test(`${binary ? 'binary' : 'text'} conflict retains a report/workspace and leaves original files intact`, async t => {
  const f = await fixture(t); const file = binary ? 'image.bin' : 'a.txt';
  const own = binary ? Buffer.from([0, 4, 5]) : 'Alice only\n'; const theirs = binary ? Buffer.from([0, 8, 9]) : 'Bob only\n';
  await write(f.alice, file, own); commit(f.alice, 'Alice version'); await publishBob(f, file, theirs);
  const before = sha(f.alice); const result = await sync(f.alice, 'pull', { check() { assert.fail('Conflicts must precede checks'); } });
  assert.equal(result.state, 'conflict'); assert.deepEqual(result.conflicts, [file]); assert.ok(result.workspace);
  assert.equal(sha(f.alice), before); assert.deepEqual(await fs.readFile(path.join(f.alice, file)), Buffer.from(own));
  assert.equal(git(f.alice, 'diff', '--cached', '--name-only'), '');
});

test('dirty pull preserves tracked, staged and untracked work', async t => {
  const f = await fixture(t); await publishBob(f); await write(f.alice, 'a.txt', 'unfinished'); git(f.alice, 'add', 'a.txt');
  await write(f.alice, 'notes.txt', 'untracked'); const before = sha(f.alice);
  const result = await sync(f.alice, 'pull', { check() { assert.fail('Dirty pull must not run checks'); } });
  assert.equal(result.state, 'dirty'); assert.equal(sha(f.alice), before); assert.equal(git(f.alice, 'diff', '--cached', '--name-only'), 'a.txt');
  assert.equal(await fs.readFile(path.join(f.alice, 'notes.txt'), 'utf8'), 'untracked');
});

test('publication checkpoints only approved paths and preserves unrelated staging and literal messages', async t => {
  const f = await fixture(t); await write(f.alice, 'a.txt', 'approved'); await write(f.alice, 'новый файл.txt', 'new');
  await write(f.alice, 'b.txt', 'another task'); git(f.alice, 'add', 'b.txt');
  const message = 'Literal $(echo unsafe) `text` "quotes"'; let checks = 0;
  const result = await sync(f.alice, 'push', { ...pushOptions(['a.txt', 'новый файл.txt']), message, check: async working => {
    assert.equal(await fs.readFile(path.join(working, 'b.txt'), 'utf8'), 'b initial\n'); checks++;
  } });
  assert.equal(result.state, 'pushed'); assert.equal(checks, 1); assert.equal(git(f.remote, 'rev-parse', 'main'), result.commit);
  assert.equal(git(f.alice, 'log', '-1', '--format=%s'), message); assert.match(git(f.alice, 'log', '-1', '--format=%B'), /Task: npc-art/);
  assert.equal(git(f.alice, 'diff', '--cached', '--name-only'), 'b.txt');
  assert.equal(git(f.remote, 'show', 'main:b.txt'), 'b initial');
});

test('approved deletions, additions and staged deletions are published as one packet', async t => {
  const f = await fixture(t); await fs.unlink(path.join(f.alice, 'a.txt')); git(f.alice, 'add', 'a.txt');
  await write(f.alice, 'renamed a.txt', 'a initial\n');
  const result = await sync(f.alice, 'push', pushOptions(['a.txt', 'renamed a.txt']));
  assert.equal(result.state, 'pushed'); assert.equal(git(f.remote, 'ls-tree', 'main', '--', 'a.txt'), '');
  assert.equal(git(f.remote, 'show', 'main:renamed a.txt'), 'a initial');
});

test('private unpublished ancestry requires explicit commit approval', async t => {
  const f = await fixture(t); await write(f.alice, 'a.txt', 'private earlier work'); const privateCommit = commit(f.alice, 'Private local only');
  const blocked = await sync(f.alice, 'push', { taskId: 'reviewed-history', check() { assert.fail('Unapproved ancestry must stop'); } });
  assert.equal(blocked.state, 'approval-required'); assert.deepEqual(blocked.unapprovedCommits, [privateCommit]);
  const result = await sync(f.alice, 'push', { taskId: 'reviewed-history', commits: [privateCommit], check: cleanCheck });
  assert.equal(result.state, 'pushed'); assert.equal(git(f.remote, 'rev-parse', 'main'), privateCommit);
});

test('failed checks never publish; the local checkpoint remains recoverable', async t => {
  const f = await fixture(t); const beforeRemote = git(f.remote, 'rev-parse', 'main'); await write(f.alice, 'a.txt', 'bad change');
  const result = await sync(f.alice, 'push', { ...pushOptions(['a.txt']), check() { throw new Error('Check failed'); } });
  assert.equal(result.state, 'checks-failed'); assert.ok(result.checkpoint); assert.equal(sha(f.alice), result.checkpoint);
  assert.equal(git(f.remote, 'rev-parse', 'main'), beforeRemote);
  assert.equal(git(f.alice, 'rev-parse', `refs/gamejam-sync/operations/${result.operationId}`), result.commit);
});

test('source edits during checks are retained and stop publication', async t => {
  const f = await fixture(t); const remote = git(f.remote, 'rev-parse', 'main'); await write(f.alice, 'a.txt', 'packet');
  const result = await sync(f.alice, 'push', { ...pushOptions(['a.txt']), check: async () => write(f.alice, 'a.txt', 'new edit while checking') });
  assert.equal(result.state, 'changed'); assert.equal(git(f.remote, 'rev-parse', 'main'), remote);
  assert.equal(await fs.readFile(path.join(f.alice, 'a.txt'), 'utf8'), 'new edit while checking');
});

test('new unrelated source work during pull checks stops local integration without overwriting it', async t => {
  const f = await fixture(t); await publishBob(f); const before = sha(f.alice);
  const result = await sync(f.alice, 'pull', { check: async () => write(f.alice, 'other-task.txt', 'started during checks') });
  assert.equal(result.state, 'changed'); assert.equal(sha(f.alice), before);
  assert.equal(await fs.readFile(path.join(f.alice, 'other-task.txt'), 'utf8'), 'started during checks');
  assert.equal(await fs.readFile(path.join(f.alice, 'b.txt'), 'utf8'), 'b initial\n');
});

test('checks which modify the candidate cannot publish that unverified change', async t => {
  const f = await fixture(t); const remote = git(f.remote, 'rev-parse', 'main'); await write(f.alice, 'a.txt', 'packet');
  const result = await sync(f.alice, 'push', { ...pushOptions(['a.txt']), check: async working => write(working, 'a.txt', 'changed by checker') });
  assert.equal(result.state, 'changed'); assert.ok(result.workspace); assert.equal(git(f.remote, 'rev-parse', 'main'), remote);
});

test('simultaneous collaborator push triggers bounded merge and recheck instead of overwrite', async t => {
  const f = await fixture(t); await write(f.alice, 'a.txt', 'Alice packet'); let checks = 0, theirs;
  const result = await sync(f.alice, 'push', { ...pushOptions(['a.txt']), check: async () => {
    if (++checks === 1) theirs = await publishBob(f);
  } });
  assert.equal(result.state, 'pushed'); assert.equal(result.attempts, 2); assert.equal(checks, 2);
  git(f.remote, 'merge-base', '--is-ancestor', theirs, 'main');
  assert.equal(git(f.remote, 'show', 'main:a.txt'), 'Alice packet'); assert.equal(git(f.remote, 'show', 'main:b.txt'), 'from Bob');
});

test('retry reuses verification only when the tree is unchanged within that operation', async t => {
  const f = await fixture(t); await write(f.alice, 'a.txt', 'Alice packet'); let checks = 0;
  const result = await sync(f.alice, 'push', { ...pushOptions(['a.txt']), check: () => {
    checks++; git(f.bob, 'commit', '--allow-empty', '-m', 'Metadata only'); git(f.bob, 'push');
  } });
  assert.equal(result.state, 'pushed'); assert.equal(result.attempts, 2); assert.equal(checks, 1);
  const report = JSON.parse(await fs.readFile(result.report, 'utf8'));
  assert.ok(report.checks.some(x => x.state === 'reused-in-operation'));
});

test('continuous remote progress stops at the retry bound without losing local commits', async t => {
  const f = await fixture(t); await write(f.alice, 'a.txt', 'Alice packet'); let n = 0;
  const result = await sync(f.alice, 'push', { ...pushOptions(['a.txt']), maxAttempts: 2, check: async () => {
    await publishBob(f, 'b.txt', `Bob ${++n}\n`);
  } });
  assert.equal(result.state, 'remote-busy'); assert.equal(n, 2); assert.ok(result.checkpoint);
  assert.equal(git(f.alice, 'show', `${result.checkpoint}:a.txt`), 'Alice packet');
});

test('readback accepts a newer remote child containing the published commit', async t => {
  const f = await fixture(t); await write(f.alice, 'a.txt', 'Alice packet');
  const result = await sync(f.alice, 'push', { ...pushOptions(['a.txt']), check: async (_, info) => {
    const child = git(f.alice, 'commit-tree', info.tree, '-p', info.commit, '-m', 'Later collaborator commit');
    git(f.alice, 'push', 'origin', `${child}:refs/heads/after-publication`);
    const hook = path.join(f.remote, 'hooks', 'post-receive');
    await fs.writeFile(hook, '#!/bin/sh\nwhile read old_oid new_oid ref_name\ndo\n  if [ "$ref_name" = "refs/heads/main" ]; then\n    git update-ref refs/heads/main refs/heads/after-publication "$new_oid"\n  fi\ndone\n');
    await fs.chmod(hook, 0o755);
  } });
  assert.equal(result.state, 'pushed'); assert.notEqual(result.commit, result.remoteObserved); assert.equal(result.newerRemoteCommits, 1);
});

test('pause blocks network in every linked worktree, but explicit local save is available', async t => {
  const f = await fixture(t); const linked = path.join(f.base, 'linked'); git(f.alice, 'worktree', 'add', '-b', 'codex/pause-test', linked);
  await fs.mkdir(f.directory, { recursive: true }); await fs.writeFile(path.join(f.directory, 'paused.json'), JSON.stringify({ reason: 'Local only' }));
  git(f.alice, 'remote', 'set-url', 'origin', path.join(f.base, 'missing.git'));
  for (const root of [f.alice, linked]) for (const command of ['pull', 'push', 'compare']) assert.equal((await sync(root, command)).state, 'paused');
  await write(f.alice, 'a.txt', 'local checkpoint');
  assert.equal((await sync(f.alice, 'save', pushOptions(['a.txt']))).state, 'saved');
  assert.equal((await sync(f.alice, 'status')).paused, true);
});

test('common lock, active merge, background divergence and branch guards are enforced', async t => {
  const f = await fixture(t); const linked = path.join(f.base, 'linked'); git(f.alice, 'worktree', 'add', '-b', 'codex/lock-test', linked);
  await fs.mkdir(f.directory, { recursive: true }); await fs.writeFile(path.join(f.directory, 'lock'), String(process.pid));
  assert.equal((await sync(linked, 'pull')).state, 'busy'); await fs.unlink(path.join(f.directory, 'lock'));
  await assert.rejects(sync(linked, 'pull'), /only runs on main/);
  const marker = git(f.alice, 'rev-parse', '--path-format=absolute', '--git-path', 'MERGE_HEAD');
  await fs.writeFile(marker, sha(f.alice) + '\n'); await assert.rejects(sync(f.alice, 'pull'), /active Git operation/); await fs.unlink(marker);
  await write(f.alice, 'a.txt', 'local'); commit(f.alice, 'local'); await publishBob(f);
  assert.equal((await sync(f.alice, 'pull', { background: true, check() { assert.fail('Background must not merge/check'); } })).state, 'diverged');
});

test('no-op publication skips checks; local history has actor, task and result', async t => {
  const f = await fixture(t); const result = await sync(f.alice, 'push', { taskId: 'nothing-new', check() { assert.fail('No changes'); } });
  assert.equal(result.state, 'current'); const entries = (await sync(f.alice, 'history')).operations;
  assert.equal(entries.at(-1).actor.name, 'Alice'); assert.equal(entries.at(-1).taskId, 'nothing-new'); assert.equal(entries.at(-1).state, 'current');
  const status = await sync(f.alice, 'status'); assert.equal(status.networkChecked, false); assert.equal(status.lastRun.operationId, result.operationId);
});

test('unsafe paths, implicit all-files publication and stale approval are rejected', async t => {
  const f = await fixture(t); await write(f.alice, '.env', 'secret');
  for (const file of ['../escape', '.git/config', 'C:escape', '.env', '.']) await assert.rejects(sync(f.alice, 'save', pushOptions([file])), /Invalid exact file|Ignored file/);
  await write(f.alice, 'a.txt', 'pending'); assert.equal((await sync(f.alice, 'push', { taskId: 'missing-scope' })).state, 'scope-required');
  assert.equal((await sync(f.alice, 'push', { ...pushOptions(['a.txt']), expectedHead: '0'.repeat(40) })).state, 'changed');
  assert.equal((await sync(f.alice, 'push', { ...pushOptions(['a.txt']), expectedFiles: '0'.repeat(64) })).state, 'changed');
  assert.equal(git(f.alice, 'diff', '--cached', '--name-only'), '');
});

test('CLI accepts structured requests and exact repeated flags without shell interpolation', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'GameJam-sync-request-'));
  t.after(async () => { assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); await fs.rm(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'request.json'); const request = { taskId: 'npc', message: 'Literal $(unsafe)', files: ['a.txt'] };
  await fs.writeFile(file, JSON.stringify(request)); assert.deepEqual(await parseArguments(['push', '--request', file]), { command: 'push', options: request });
  assert.deepEqual((await parseArguments(['save', '--task', 'npc', '--message', '`literal`', '--file', 'a.txt', '--file', 'b.txt'])).options.files, ['a.txt', 'b.txt']);
  await assert.rejects(parseArguments(['push', 'old implicit message']), /implicit add --all is disabled/);
  await assert.rejects(parseArguments(['push', '--request', file, '--file', 'b.txt']), /not both/);
});

test('pause/resume are local, journaled and never start network or a scheduler', async t => {
  const f = await fixture(t); git(f.alice, 'remote', 'set-url', 'origin', path.join(f.base, 'unreachable.git'));
  assert.equal((await sync(f.alice, 'pause')).state, 'paused'); assert.equal((await sync(f.alice, 'compare')).state, 'paused');
  assert.equal((await sync(f.alice, 'resume')).state, 'resumed'); assert.equal((await sync(f.alice, 'status')).paused, false);
  assert.equal((await sync(f.alice, 'history')).operations.at(-1).actor.name, 'Alice');
});

test('pausing during checks prevents the subsequent push', async t => {
  const f = await fixture(t); await write(f.alice, 'a.txt', 'packet'); const before = git(f.remote, 'rev-parse', 'main');
  const result = await sync(f.alice, 'push', { ...pushOptions(['a.txt']), check: async () => { await sync(f.alice, 'pause'); } });
  assert.equal(result.state, 'paused'); assert.equal(git(f.remote, 'rev-parse', 'main'), before);
});

test('resolved files are committed and checked by the script without publishing', async t => {
  const f = await fixture(t); await write(f.alice, 'a.txt', 'Alice\n'); commit(f.alice, 'Alice'); await publishBob(f, 'a.txt', 'Bob\n');
  const conflict = await sync(f.alice, 'pull', { check: cleanCheck }); assert.equal(conflict.state, 'conflict');
  const blocked = await sync(f.alice, 'resolve', { operationId: conflict.operationId, check: cleanCheck }); assert.equal(blocked.state, 'conflict');
  await write(conflict.workspace, 'a.txt', 'Combined by reviewer\n'); const beforeRemote = git(f.remote, 'rev-parse', 'main');
  const result = await sync(f.alice, 'resolve', { operationId: conflict.operationId, check: cleanCheck });
  assert.equal(result.state, 'updated'); assert.equal(result.networkChecked, false);
  assert.equal(await fs.readFile(path.join(f.alice, 'a.txt'), 'utf8'), 'Combined by reviewer\n'); assert.equal(git(f.remote, 'rev-parse', 'main'), beforeRemote);
});

test('the production checker executes npm check on the frozen candidate and retains its log', async t => {
  const f = await fixture(t);
  await write(f.bob, 'package.json', JSON.stringify({ private: true, type: 'module', scripts: { check: 'node check.mjs' } }));
  await write(f.bob, 'check.mjs', "import fs from 'node:fs'; import assert from 'node:assert/strict'; assert.equal(fs.readFileSync('a.txt','utf8'),'verified'); console.log('Candidate verified');\n");
  commit(f.bob, 'Add fixture checker'); git(f.bob, 'push'); await sync(f.alice, 'pull', { check: cleanCheck });
  await write(f.alice, 'a.txt', 'verified');
  const result = await sync(f.alice, 'push', { taskId: 'real-check', message: 'Checked packet', files: ['a.txt'] });
  assert.equal(result.state, 'pushed'); const report = JSON.parse(await fs.readFile(result.report, 'utf8'));
  assert.match(await fs.readFile(report.checks[0].log, 'utf8'), /Candidate verified/);
});

test('game-only packets use game checks, while sync-tool packets require the complete check profile', async t => {
  const f = await fixture(t);
  await write(f.bob, 'package.json', JSON.stringify({ private: true, type: 'module', scripts: { check: 'node full.mjs', 'check:game': 'node game.mjs' } }));
  await write(f.bob, 'full.mjs', "console.log('Full verification');\n"); await write(f.bob, 'game.mjs', "console.log('Game verification');\n");
  commit(f.bob, 'Fixture profiles'); git(f.bob, 'push'); await sync(f.alice, 'pull', { check: cleanCheck });
  await write(f.alice, 'a.txt', 'game update');
  const game = await sync(f.alice, 'push', { taskId: 'game-only', message: 'Game update', files: ['a.txt'] });
  const gameReport = JSON.parse(await fs.readFile(game.report, 'utf8'));
  assert.equal(game.state, 'pushed'); assert.match(await fs.readFile(gameReport.checks[0].log, 'utf8'), /^npm run check:game\n/);
  await fs.mkdir(path.join(f.alice, 'tools')); await write(f.alice, 'tools/sync-proof.mjs', '// tool change\n');
  const tool = await sync(f.alice, 'push', { taskId: 'tool', message: 'Tool update', files: ['tools/sync-proof.mjs'] });
  const toolReport = JSON.parse(await fs.readFile(tool.report, 'utf8'));
  assert.equal(tool.state, 'pushed'); assert.match(await fs.readFile(toolReport.checks[0].log, 'utf8'), /^npm run check\n/);
});

test('file selection refuses junction/symlink traversal before saving or fetching', async t => {
  const f = await fixture(t); const target = path.join(f.base, 'outside'); await fs.mkdir(target); await write(target, 'file.txt', 'untouched');
  try { await fs.symlink(target, path.join(f.alice, 'linked-dir'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Symlink creation unavailable'); return; } throw error; }
  const before = sha(f.alice); await assert.rejects(sync(f.alice, 'save', pushOptions(['linked-dir/file.txt'])), /Not a regular file/);
  assert.equal(sha(f.alice), before); assert.equal(await fs.readFile(path.join(target, 'file.txt'), 'utf8'), 'untouched');
});
