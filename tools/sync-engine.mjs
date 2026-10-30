import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { git, ancestor, head, dirty, changes, changedPaths, commits, ensureMain,
  readJSON, writeJSON, acquireLock, snapshotFiles, runChecks, workingChanges } from './sync-support.mjs';

const remoteHead = root => git(root, ['rev-parse', 'refs/remotes/origin/main']);
function networkGate(directory) {
  if (existsSync(path.join(directory, 'paused.json'))) throw Object.assign(new Error('Synchronization was paused during the operation.'), { code: 'SYNC_PAUSED' });
}
function fetchMain(root, directory) { networkGate(directory); git(root, ['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main']); }
function progress(root) {
  const [ahead, behind] = git(root, ['rev-list', '--left-right', '--count', 'HEAD...origin/main']).split(/\s+/).map(Number);
  return { ahead, behind };
}
function packet(root) {
  const local = head(root), remote = remoteHead(root);
  const base = git(root, ['merge-base', local, remote]);
  return { base, local, remote, working: workingChanges(root), incoming: { commits: commits(root, local, remote), files: changes(root, base, remote) },
    outgoing: { commits: commits(root, remote, local), files: changes(root, base, local) } };
}
function label(value, fallback) {
  const result = value ?? fallback;
  if (typeof result !== 'string' || !/^[^\x00-\x1f\x7f]{1,120}$/u.test(result)) throw new Error('Invalid actor/task label.');
  return result;
}
function selectedDirty(root, files) {
  return files.length > 0 && git(root, ['status', '--porcelain', '--untracked-files=all', '--', ...files]) !== '';
}
function checkpoint(root, files, message, taskId, operationId) {
  if (!selectedDirty(root, files)) return null;
  const toStage = files.filter(file => existsSync(path.join(root, file)) || git(root, ['ls-files', '--', file]));
  if (toStage.length) git(root, ['add', '--all', '--', ...toStage]);
  if (!git(root, ['diff', '--cached', '--name-only', 'HEAD', '--', ...files])) return null;
  const before = head(root);
  git(root, ['commit', '--only', '-m', message.trim(), '-m', `Task: ${taskId}\nSync-Operation: ${operationId}`, '--', ...files]);
  const commit = head(root);
  if (changedPaths(root, before, commit).some(file => !files.includes(file))) throw new Error('Commit hook changed files outside the approved packet; inspect the local checkpoint.');
  return commit;
}
async function history(directory, limit = 10) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('History limit must be 1..100.');
  try {
    const file = await fs.open(path.join(directory, 'journal.jsonl'), 'r');
    try {
      const { size } = await file.stat();
      const start = Math.max(0, size - 256 * 1024);
      const buffer = Buffer.alloc(size - start);
      await file.read(buffer, 0, buffer.length, start);
      const lines = buffer.toString('utf8').split('\n');
      if (start > 0) lines.shift();
      const latest = new Map();
      for (const line of lines.filter(Boolean)) { const entry = JSON.parse(line); latest.set(entry.operationId, entry); }
      return [...latest.values()].slice(-limit);
    } finally { await file.close(); }
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

/** Explicit requests only. The scheduler retains its conservative fast-forward path. */
export async function sync(root, command, options = {}) {
  root = path.resolve(root);
  command = ({ sync: 'pull', publish: 'push', inspect: 'status' })[command] || command;
  if (!['status', 'history', 'pause', 'resume', 'compare', 'save', 'resolve', 'pull', 'push'].includes(command)) throw new Error('Commands: status | history | pause | resume | compare | save | resolve | pull | push');
  const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const directory = path.join(common, 'gamejam-sync');
  await fs.mkdir(directory, { recursive: true });
  const pause = await readJSON(path.join(directory, 'paused.json'));
  if (command === 'status') return {
    branch: git(root, ['branch', '--show-current']), dirty: dirty(root), ...progress(root),
    local: head(root), remoteObserved: remoteHead(root), networkChecked: false,
    paused: pause !== null, pause, lock: await fs.readFile(path.join(directory, 'lock'), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; }),
    lastRun: await readJSON(path.join(directory, 'status.json')),
  };
  if (command === 'history') return { state: 'history', networkChecked: false, operations: await history(directory, options.limit) };
  if (process.env.GAMEJAM_SYNC_CHECK_COMMON && path.resolve(process.env.GAMEJAM_SYNC_CHECK_COMMON) === path.resolve(common)) throw new Error('Sync mutation/network operations on this clone are disabled inside project checks.');
  if (command === 'pause' || command === 'resume') {
    const entry = { operationId: randomUUID(), command, actor: { name: git(root, ['config', 'user.name']), email: git(root, ['config', 'user.email']) },
      taskId: options.taskId || 'network-mode', state: command === 'pause' ? 'paused' : 'resumed', networkChecked: false, checkedAt: new Date().toISOString() };
    if (command === 'pause') await writeJSON(path.join(directory, 'paused.json'), { reason: options.message || 'Local work only; resume requires explicit user instruction.', pausedAt: entry.checkedAt });
    else {
      const unlock = await acquireLock(directory);
      if (!unlock) return { state: 'busy', message: 'Cannot resume during an active operation.' };
      try { await fs.rm(path.join(directory, 'paused.json'), { force: true }); } finally { await unlock(); }
    }
    await fs.appendFile(path.join(directory, 'journal.jsonl'), JSON.stringify(entry) + '\n');
    return entry;
  }
  if (pause && !['save', 'resolve'].includes(command)) return { state: 'paused', message: pause.reason || 'GitHub synchronization is paused locally.' };
  const release = await acquireLock(directory);
  if (!release) return { state: 'busy', message: 'Another sync operation owns the shared clone lock.' };

  const operationId = randomUUID();
  const operationDir = path.join(directory, 'operations', operationId);
  await fs.mkdir(operationDir, { recursive: true });
  const reportFile = path.join(operationDir, 'report.json');
  const operation = { schemaVersion: 1, operationId, command, root, startedAt: new Date().toISOString(),
    actor: null, taskId: null, before: null, attempts: [], checkpoints: [], files: [], checks: [] };
  let workspace = null;
  async function finish(result) {
    if (workspace) {
      // Cleanup only our clean temporary worktree. Keep every unresolved result.
      try {
        if (['current', 'updated', 'pushed', 'saved', 'compared'].includes(result.state) && !dirty(workspace)) { git(root, ['worktree', 'remove', workspace]); workspace = null; }
      } catch { /* report retained workspace; never force-remove it */ }
    }
    const summary = { ...result, operationId, actor: operation.actor, taskId: operation.taskId,
      checkpoint: operation.checkpoints.at(-1) || null, report: reportFile,
      ...(workspace ? { workspace } : {}), checkedAt: new Date().toISOString() };
    operation.result = summary;
    operation.finishedAt = summary.checkedAt;
    await writeJSON(reportFile, operation);
    await fs.appendFile(path.join(directory, 'journal.jsonl'), JSON.stringify({
      operationId, command, actor: operation.actor, taskId: operation.taskId,
      startedAt: operation.startedAt, finishedAt: operation.finishedAt,
      before: operation.before && { local: operation.before.local, remote: operation.before.remote },
      state: summary.state, commit: summary.commit || null, remoteObserved: summary.remoteObserved || null,
      checkpoints: operation.checkpoints, fileCount: operation.files.length, report: reportFile,
    }) + '\n');
    await writeJSON(path.join(directory, 'status.json'), summary);
    return summary;
  }

  try {
    ensureMain(root);
    const actualName = git(root, ['config', 'user.name']);
    operation.actor = { label: label(options.actor, actualName), name: actualName, email: git(root, ['config', 'user.email']) };
    operation.taskId = label(options.taskId, command === 'push' || command === 'save' ? '' : 'synchronization');
    if (command === 'resolve') {
      if (typeof options.operationId !== 'string' || !/^[a-f0-9-]{36}$/.test(options.operationId)) throw new Error('resolve requires a valid --operation ID.');
      const previousDir = path.join(directory, 'operations', options.operationId);
      const previous = await readJSON(path.join(previousDir, 'report.json'));
      const retained = previous?.result?.workspace;
      if (previous?.result?.state !== 'conflict' || path.resolve(previous.root) !== root || !retained
        || !/^workspace-\d+$/.test(path.relative(previousDir, path.resolve(retained)))) throw new Error('Not an owned conflict workspace for this checkout.');
      workspace = path.resolve(retained);
      const original = previous.attempts.at(-1);
      if (head(root) !== original.local) return await finish({ state: 'changed', message: 'Source history changed since the conflict. Compare again; retained workspace was not applied.' });
      if (git(workspace, ['rev-parse', 'MERGE_HEAD']) !== original.remote) throw new Error('Conflict merge identity changed; inspect workspace.');
      const conflicts = previous.result.conflicts;
      operation.files = [...conflicts];
      operation.taskId = options.taskId ? operation.taskId : previous.taskId;
      const extraEdits = git(workspace, ['diff', '--name-only', '-z'], { trim: false }).split('\0').filter(Boolean).filter(file => !conflicts.includes(file));
      if (extraEdits.length || git(workspace, ['ls-files', '--others', '--exclude-standard'])) throw new Error('Resolution contains edits outside the reported conflicts.');
      try { git(workspace, ['diff', '--check']); }
      catch { return await finish({ state: 'conflict', conflicts, message: 'Conflict markers or whitespace errors remain. Edit reported files in the retained workspace.' }); }
      git(workspace, ['add', '--all', '--', ...conflicts]);
      if (git(workspace, ['ls-files', '--unmerged'])) throw new Error('Unresolved index entries remain.');
      git(workspace, ['commit', '--no-edit']);
      const candidate = head(workspace), tree = git(workspace, ['rev-parse', 'HEAD^{tree}']);
      git(root, ['update-ref', `refs/gamejam-sync/operations/${operationId}`, candidate]);
      operation.before = { local: original.local, remote: original.remote };
      operation.resolves = options.operationId;
      const logFile = path.join(operationDir, 'checks-resolution.log');
      try {
        const checked = await (options.check ? options.check(workspace, { commit: candidate, tree, logFile }) : runChecks(workspace, logFile, changedPaths(workspace, git(workspace, ['merge-base', original.local, original.remote]), candidate)));
        if (checked === false) throw new Error('Check returned false.');
      }
      catch (error) { return await finish({ state: 'checks-failed', commit: candidate, message: error.message }); }
      if (dirty(workspace) || head(workspace) !== candidate || head(root) !== original.local) return await finish({ state: 'changed', message: 'Candidate or source changed during resolution checks.' });
      operation.checks.push({ state: 'passed', tree, commit: candidate, log: logFile });
      try { git(root, ['merge', '--ff-only', '--no-edit', candidate]); }
      catch { return await finish({ state: 'dirty', message: 'Local edits prevent applying the resolution; workspace retained.' }); }
      const result = await finish({ state: 'updated', commit: candidate, networkChecked: false, message: 'Conflict resolution checked and integrated locally. Publication is a separate request.' });
      previous.result.resolvedBy = operationId;
      await writeJSON(path.join(previousDir, 'report.json'), previous);
      return result;
    }
    const files = options.files ?? [];
    if (!Array.isArray(files) || new Set(files).size !== files.length) throw new Error('files must be an array of distinct exact paths.');
    operation.files = [...files];
    const fingerprint = await snapshotFiles(root, files);
    operation.fileSnapshot = fingerprint;
    if (options.expectedFiles && options.expectedFiles !== fingerprint) return await finish({ state: 'changed', message: 'Packet files changed since comparison; review the new snapshot.' });
    const initialHead = head(root);
    if (options.expectedHead && options.expectedHead !== initialHead) return await finish({ state: 'changed', message: 'Local HEAD changed since the request was prepared.' });
    operation.stage = 'starting';
    await writeJSON(reportFile, operation);
    await fs.appendFile(path.join(directory, 'journal.jsonl'), JSON.stringify({ operationId, command, actor: operation.actor,
      taskId: operation.taskId, state: 'started', startedAt: operation.startedAt, local: initialHead, report: reportFile }) + '\n');
    if (command !== 'save') fetchMain(root, directory);
    ensureMain(root);
    if (head(root) !== initialHead) return await finish({ state: 'changed', message: 'Local history changed during fetch; no checkpoint or merge was applied.' });
    operation.before = packet(root);
    await writeJSON(reportFile, operation);
    if (options.expectedRemote && options.expectedRemote !== operation.before.remote) return await finish({ state: 'changed', message: 'Remote HEAD changed since the packet was approved; compare again.' });
    if (command === 'compare') return await finish({ state: 'compared', ...progress(root),
      incomingFiles: operation.before.incoming.files.length, outgoingFiles: operation.before.outgoing.files.length,
      incomingCommits: operation.before.incoming.commits.length, outgoingCommits: operation.before.outgoing.commits.length,
      local: initialHead, remoteObserved: operation.before.remote, fileSnapshot: fingerprint, message: 'Full incoming/outgoing packet, file hashes, working edits and authors are in report.json.' });

    if (command === 'push') {
      const approved = options.commits ?? [];
      if (!Array.isArray(approved) || approved.some(id => typeof id !== 'string' || !/^[a-f0-9]{40}$/.test(id))) throw new Error('commits must contain approved full commit IDs.');
      const unknown = operation.before.outgoing.commits.filter(item => !approved.includes(item.id));
      if (unknown.length) return await finish({ state: 'approval-required', unapprovedCommits: unknown.map(item => item.id), message: 'Unpublished history needs explicit approval; private earlier work will not be sent implicitly.' });
    }
    if ((command === 'push' || command === 'save') && !files.length && dirty(root)) return await finish({ state: 'scope-required', message: 'Provide exact packet files; other local edits remain outside this operation.' });
    if (command === 'save' || (command === 'push' && files.length)) {
      if (typeof options.message !== 'string' || !options.message.trim()) throw new Error('Provide a commit message for the selected files.');
      if (await snapshotFiles(root, files) !== fingerprint) return await finish({ state: 'changed', message: 'Packet files changed before checkpoint creation; compare again.' });
      const saved = checkpoint(root, files, options.message, operation.taskId, operationId);
      if (saved) operation.checkpoints.push(saved);
      operation.stage = 'checkpointed'; await writeJSON(reportFile, operation);
      if (await snapshotFiles(root, files, true) !== fingerprint) return await finish({ state: 'changed', message: 'Selected file content changed during checkpoint creation; local checkpoint retained.' });
      if (command === 'save') return await finish({ state: saved ? 'saved' : 'current', commit: head(root), message: 'Local checkpoint only; no network or test success is implied.' });
    }
    if (command === 'pull' && dirty(root)) return await finish({ state: 'dirty', ...progress(root), message: 'Save the intended packet first; uncommitted work was not modified.' });
    if (command === 'push' && head(root) === remoteHead(root)) return await finish({ state: 'current', commit: head(root), remoteObserved: remoteHead(root), message: 'No unpublished changes; no checks or push needed.' });
    if (options.background) {
      if (command !== 'pull') throw new Error('Background mode supports only pull.');
      const counts = progress(root);
      if (counts.ahead && counts.behind) return await finish({ state: 'diverged', ...counts, message: 'Background sync never merges diverged history; request an explicit sync.' });
      if (counts.behind) git(root, ['merge', '--ff-only', '--no-edit', 'origin/main']);
      return await finish({ state: counts.behind ? 'updated' : 'current', ...progress(root), commit: head(root) });
    }

    const maxAttempts = options.maxAttempts ?? 3;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new Error('maxAttempts must be 1..5.');
    const checkedTrees = new Set();
    let expectedSource = head(root);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      ensureMain(root);
      if (head(root) !== expectedSource) return await finish({ state: 'changed', message: 'Local history changed between attempts; the new commits were not approved.' });
      const sourceHead = head(root), remote = remoteHead(root);
      operation.attempts.push({ attempt, local: sourceHead, remote,
        incoming: { commits: commits(root, sourceHead, remote), files: changes(root, git(root, ['merge-base', sourceHead, remote]), remote) } });
      if (command === 'pull' && ancestor(root, remote, sourceHead)) return await finish({ state: 'current', ...progress(root), commit: sourceHead, remoteObserved: remote });
      const working = path.join(operationDir, `workspace-${attempt}`);
      git(root, ['worktree', 'add', '--detach', working, sourceHead]);
      workspace = working;
      if (!ancestor(root, remote, sourceHead)) {
        try { git(working, ['merge', '--no-edit', '-m', `Integrate origin/main\n\nTask: ${operation.taskId}\nSync-Operation: ${operationId}`, remote]); }
        catch (error) {
          const conflicts = git(working, ['diff', '--name-only', '--diff-filter=U', '-z'], { trim: false }).split('\0').filter(Boolean);
          if (conflicts.length) return await finish({ state: 'conflict', conflicts, message: 'Resolve in the retained workspace; original working files were not merged.' });
          throw error;
        }
      }
      const candidate = head(working), tree = git(working, ['rev-parse', 'HEAD^{tree}']);
      git(root, ['update-ref', `refs/gamejam-sync/operations/${operationId}`, candidate]);
      operation.stage = 'checking'; await writeJSON(reportFile, operation);
      const checkLog = path.join(operationDir, `checks-${attempt}.log`);
      if (!checkedTrees.has(tree)) {
        try {
          const result = await (options.check ? options.check(working, { attempt, commit: candidate, tree, logFile: checkLog }) : runChecks(working, checkLog, changedPaths(working, git(working, ['merge-base', sourceHead, remote]), candidate)));
          if (result === false) throw new Error('Check returned false.');
        } catch (error) {
          operation.checks.push({ tree, commit: candidate, state: 'failed', log: checkLog, error: String(error.message) });
          return await finish({ state: 'checks-failed', message: String(error.message), commit: candidate });
        }
        if (dirty(working) || head(working) !== candidate) return await finish({ state: 'changed', message: 'Checks changed candidate files or HEAD; candidate was not published.' });
        checkedTrees.add(tree);
        operation.checks.push({ tree, commit: candidate, state: 'passed', log: checkLog });
      } else operation.checks.push({ tree, commit: candidate, state: 'reused-in-operation' });
      operation.stage = 'checked'; await writeJSON(reportFile, operation);

      ensureMain(root);
      if (head(root) !== sourceHead || selectedDirty(root, files) || (command === 'pull' && dirty(root))) return await finish({ state: 'changed', message: 'Local HEAD or packet files changed during checks; no publication attempted.' });
      if (head(root) !== candidate) {
        try { git(root, ['merge', '--ff-only', '--no-edit', candidate]); }
        catch (error) { return await finish({ state: 'dirty', message: 'Local edits prevent applying the checked result; checkpoint and report preserved.', detail: String(error.stderr || error.message) }); }
      }
      expectedSource = candidate;
      git(root, ['worktree', 'remove', working]); workspace = null;
      if (command === 'pull') return await finish({ state: 'updated', ...progress(root), commit: candidate, remoteObserved: remote, message: 'Entire incoming packet integrated and checked.' });
      let pushError = null;
      ensureMain(root);
      if (head(root) !== candidate || selectedDirty(root, files)) return await finish({ state: 'changed', message: 'Local state changed before push; approved candidate retained.' });
      networkGate(directory);
      operation.stage = 'pushing'; await writeJSON(reportFile, operation);
      try { git(root, ['push', 'origin', `${candidate}:refs/heads/main`]); }
      catch (error) { pushError = error; }
      // Read back containment, not equality: a later collaborator commit may already exist.
      fetchMain(root, directory);
      const observed = remoteHead(root);
      if (ancestor(root, candidate, observed)) return await finish({ state: 'pushed', commit: candidate,
        remoteObserved: observed, newerRemoteCommits: commits(root, candidate, observed).length, attempts: attempt,
        message: 'Published commit is present in the observed remote history.' });
      if (!pushError) return await finish({ state: 'verification-failed', commit: candidate, remoteObserved: observed, message: 'Push returned success but readback does not contain the commit; inspect report.' });
      if (observed === remote) throw pushError;
      // A competitor advanced main. Retry a bounded merge/check against that exact history.
    }
    return await finish({ state: 'remote-busy', message: 'Remote kept changing; local commits retained. Retry explicitly.' });
  } catch (error) {
    if (error.code === 'SYNC_PAUSED') return await finish({ state: 'paused', message: error.message });
    const message = String(error.stderr || error.message).trim();
    await finish({ state: 'error', message });
    throw Object.assign(new Error(message), { report: reportFile });
  } finally { await release(); }
}
