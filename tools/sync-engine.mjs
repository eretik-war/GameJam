import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { git, ancestor, head, dirty, changes, changedPaths, commits, ensureMain,
  readJSON, writeJSON, acquireLock, snapshotFiles, runChecks, workingChanges,
  resolveProfile, environmentFingerprint } from './sync-support.mjs';

/**
 * One publication protocol, split into reusable steps.
 *
 *   prepare -> candidate -> verify -> apply -> publish
 *
 * Verification evidence is bound to an exact commit/tree, the check profile, the
 * tool fingerprint and the local environment, and is only reused inside the same
 * operation chain (a conflict and its continuation). Nothing is shared across
 * machines or across unrelated tasks.
 */

export const capabilities = { continue: true, verification: 1, plans: true, tasks: true, compact: true };

const COMMANDS = ['status', 'history', 'pause', 'resume', 'compare', 'save', 'resolve', 'pull', 'push', 'task', 'plan'];
const SUCCESS = ['current', 'updated', 'pushed', 'saved', 'compared', 'history', 'resumed', 'registered', 'ready', 'planned'];

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
function label(value, fallback, { allowEmpty = false } = {}) {
  const result = value ?? fallback;
  if (typeof result !== 'string') throw new Error('Invalid actor/task label.');
  if (allowEmpty && result === '') return '';
  if (!/^[^\x00-\x1f\x7f]{1,120}$/u.test(result)) throw new Error('Invalid actor/task label.');
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

function stage(context, name, detail = {}) {
  const entry = { stage: name, at: new Date().toISOString(), ...detail };
  context.operation.stage = name;
  (context.operation.stages ??= []).push(entry);
  if (typeof context.options.onStage === 'function') {
    try { context.options.onStage(entry); } catch { /* progress reporting must never break an operation */ }
  }
}

/** Ancestor reports of an operation chain, oldest first. */
async function chainReports(directory, operationId) {
  const chain = [];
  const seen = new Set();
  let current = operationId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const report = await readJSON(path.join(directory, 'operations', current, 'report.json'));
    if (!report) break;
    chain.unshift(report);
    current = report.continues || report.resolves || null;
  }
  return chain;
}

function verificationMatches(record, { tree, profile, environment }) {
  if (!record || record.state !== 'passed' || record.tree !== tree || record.profile !== profile) return false;
  if (!record.environment || typeof record.environment !== 'object') return false;
  return Object.keys(environment).every(key => record.environment[key] === environment[key]);
}
/** Only evidence from this operation chain, for this exact tree, profile and environment. */
function findVerification(chain, criteria) {
  for (let index = chain.length - 1; index >= 0; index--) {
    for (const record of chain[index].verifications ?? []) {
      if (verificationMatches(record, criteria)) return { ...record, operationId: chain[index].operationId };
    }
  }
  return null;
}
function failedVerification(chain, criteria) {
  for (let index = chain.length - 1; index >= 0; index--) {
    for (const record of chain[index].verifications ?? []) {
      if (record.state === 'failed' && record.tree === criteria.tree && record.profile === criteria.profile) return record;
    }
  }
  return null;
}

/** Verify one frozen candidate. Returns a reusable record; never reuses a failure. */
async function verifyCandidate(context, { working, candidate, tree, changedFiles, attempt, logName }) {
  const { operation, operationDir, options, chain, verifiedTrees } = context;
  const profile = await resolveProfile(working, changedFiles);
  const environment = await environmentFingerprint(working);
  const criteria = { tree, profile: profile.name, environment };
  const failed = failedVerification(chain, criteria);
  if (failed) {
    const error = new Error(`This exact tree already failed ${profile.name}; fix the cause instead of repeating the run. Log: ${failed.log}`);
    throw Object.assign(error, { checksFailed: true });
  }
  const reused = findVerification(chain, criteria);
  if (reused) {
    const record = { schemaVersion: 1, operationId: operation.operationId, commit: candidate, tree, profile: profile.name,
      composition: profile.composition, environment, toolVersion: environment.toolVersion,
      toolFingerprint: environment.toolFingerprint, state: 'passed', reused: true,
      reusedFrom: reused.operationId, reusedAt: reused.verifiedAt, log: reused.log, verifiedAt: new Date().toISOString() };
    operation.verifications.push(record);
    operation.checks.push({ tree, commit: candidate, state: 'reused-chain', reusedFrom: reused.operationId, log: reused.log });
    verifiedTrees.set(tree, record);
    stage(context, 'verified', { attempt, tree, reusedFrom: reused.operationId });
    return { record, reused: true };
  }
  const logFile = path.join(operationDir, logName ?? `checks-${attempt}.log`);
  const record = { schemaVersion: 1, operationId: operation.operationId, commit: candidate, tree, profile: profile.name,
    composition: profile.composition, environment, toolVersion: environment.toolVersion,
    toolFingerprint: environment.toolFingerprint, state: 'passed', log: logFile, verifiedAt: new Date().toISOString() };
  stage(context, 'checking', { attempt, tree, profile: profile.name });
  const started = Date.now();
  try {
    const result = await (options.check
      ? options.check(working, { attempt, commit: candidate, tree, logFile, profile: profile.name })
      : runChecks(working, logFile, changedFiles, profile));
    if (result === false) throw new Error('Check returned false.');
  } catch (error) {
    record.state = 'failed';
    record.error = String(error.message);
    record.durationMs = Date.now() - started;
    operation.verifications.push(record);
    operation.checks.push({ tree, commit: candidate, state: 'failed', log: logFile, error: String(error.message) });
    throw Object.assign(new Error(String(error.message)), { checksFailed: true });
  }
  operation.verifications.push(record);
  operation.checks.push({ tree, commit: candidate, state: 'passed', log: logFile });
  verifiedTrees.set(tree, record);
  stage(context, 'verified', { attempt, tree, profile: profile.name, reused: false, ms: Date.now() - started });
  return { record, reused: false };
}

function commitOwnedByChain(root, id, chainIds) {
  const body = git(root, ['show', '-s', '--format=%B', id]);
  const match = /^Sync-Operation:\s*(.+)$/m.exec(body);
  return Boolean(match && chainIds.includes(match[1].trim()));
}

/** A failed run is not repeated for the identical tree; the cause must change first. */
function repeatedFailure(previousFailure, root, tree) {
  if (!previousFailure?.commit) return null;
  try { return git(root, ['rev-parse', `${previousFailure.commit}^{tree}`]) === tree ? previousFailure : null; }
  catch { return null; }
}

/**
 * Locate the reviewed resolution inside a retained workspace.
 * A previous failed verification may already have committed it, so an existing
 * merge commit of the same two parents is accepted as the same reviewed result.
 */
function resolutionSource(workspace, original) {
  const mergeHead = (() => { try { return git(workspace, ['rev-parse', 'MERGE_HEAD']); } catch { return null; } })();
  if (mergeHead) {
    if (mergeHead !== original.remote) throw new Error('Conflict merge identity changed; inspect workspace.');
    return { source: null, committed: false };
  }
  const headCommit = head(workspace);
  if (headCommit === original.local) throw new Error('Conflict merge identity changed; inspect workspace.');
  const first = (() => { try { return git(workspace, ['rev-parse', `${headCommit}^1`]); } catch { return null; } })();
  const second = (() => { try { return git(workspace, ['rev-parse', `${headCommit}^2`]); } catch { return null; } })();
  if (first !== original.local || second !== original.remote) throw new Error('Conflict merge identity changed; inspect workspace.');
  return { source: headCommit, committed: true };
}

/** Explicit requests only. The scheduler retains its conservative fast-forward path. */
export async function sync(root, command, options = {}) {
  root = path.resolve(root);
  command = ({ sync: 'pull', publish: 'push', inspect: 'status' })[command] || command;
  if (!COMMANDS.includes(command)) throw new Error('Commands: status | history | pause | resume | compare | save | resolve | pull | push | task | plan');
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
  if (command === 'task' || command === 'plan') {
    ensureMain(root);
    const actualName = git(root, ['config', 'user.name']);
    const actor = { label: label(options.actor, actualName), name: actualName, email: git(root, ['config', 'user.email']) };
    const release = await acquireLock(directory);
    if (!release) return { state: 'busy', message: 'Another sync operation owns the shared clone lock.' };
    try {
      const tasks = await import('./sync-tasks.mjs');
      if (command === 'plan') return await tasks.createPlan({ root, directory, actor, taskId: options.taskId, message: options.message });
      if (options.action === 'register') return await tasks.registerTask({ root, directory, actor, taskId: options.taskId, files: options.files ?? [] });
      if (options.action === 'ready') return await tasks.markReady({ root, directory, actor, taskId: options.taskId });
      throw new Error('Task actions: register | ready');
    } finally { await release(); }
  }
  if (pause && !['save', 'resolve'].includes(command)) return { state: 'paused', message: pause.reason || 'GitHub synchronization is paused locally.' };
  const release = await acquireLock(directory);
  if (!release) return { state: 'busy', message: 'Another sync operation owns the shared clone lock.' };

  const operationId = randomUUID();
  const operationDir = path.join(directory, 'operations', operationId);
  await fs.mkdir(operationDir, { recursive: true });
  const reportFile = path.join(operationDir, 'report.json');
  const operation = { schemaVersion: 2, operationId, command, root, startedAt: new Date().toISOString(),
    actor: null, taskId: null, before: null, attempts: [], checkpoints: [], files: [], checks: [], verifications: [], stages: [] };
  const context = { root, directory, operation, operationDir, reportFile, options, chain: [], verifiedTrees: new Map(), workspace: null };
  let workspace = null;
  const setWorkspace = value => { workspace = value; context.workspace = value; };

  async function finish(result) {
    if (workspace) {
      // Cleanup only our clean temporary worktree. Keep every unresolved result.
      try {
        if (['current', 'updated', 'pushed', 'saved', 'compared'].includes(result.state) && !dirty(workspace)) { git(root, ['worktree', 'remove', workspace]); setWorkspace(null); }
      } catch { /* report retained workspace; never force-remove it */ }
    }
    const runs = operation.checks.filter(item => ['passed', 'failed'].includes(item.state)).length;
    const reused = operation.checks.filter(item => ['reused-in-operation', 'reused-chain'].includes(item.state)).length;
    const summary = { ...result, operationId, actor: operation.actor, taskId: operation.taskId,
      checkpoint: operation.checkpoints.at(-1) || null, report: reportFile,
      ...(operation.plan ? { planId: operation.plan.planId } : {}),
      checkRuns: runs, checksReused: reused, stage: operation.stage,
      tree: operation.verifications.at(-1)?.tree ?? null,
      ...(workspace ? { workspace } : {}), checkedAt: new Date().toISOString() };
    operation.result = summary;
    operation.finishedAt = summary.checkedAt;
    await writeJSON(reportFile, operation);
    await fs.appendFile(path.join(directory, 'journal.jsonl'), JSON.stringify({
      operationId, command, actor: operation.actor, taskId: operation.taskId,
      startedAt: operation.startedAt, finishedAt: operation.finishedAt,
      before: operation.before && { local: operation.before.local, remote: operation.before.remote },
      state: summary.state, commit: summary.commit || null, remoteObserved: summary.remoteObserved || null,
      checkpoints: operation.checkpoints, fileCount: operation.files.length, checkRuns: runs, checksReused: reused,
      continues: operation.continues || null, planId: operation.plan?.planId || null, report: reportFile,
    }) + '\n');
    await writeJSON(path.join(directory, 'status.json'), summary);
    return summary;
  }

  try {
    ensureMain(root);
    const actualName = git(root, ['config', 'user.name']);
    operation.actor = { label: label(options.actor, actualName), name: actualName, email: git(root, ['config', 'user.email']) };
    operation.taskId = label(options.taskId, command === 'push' || command === 'save' ? '' : 'synchronization', { allowEmpty: true });

    if (command === 'resolve') return await resolveOperation(context, finish, setWorkspace);
    if (command === 'push' && options.continueOperation) return await continueOperation(context, finish, setWorkspace);

    if (options.planId) {
      const tasks = await import('./sync-tasks.mjs');
      const prepared = await tasks.preparePlan({ root, directory, planId: options.planId });
      if (prepared.state !== 'prepared') {
        return await finish({ state: prepared.state, planId: options.planId, message: prepared.message,
          ...(prepared.owners ? { owners: prepared.owners } : {}) });
      }
      operation.plan = { planId: prepared.plan.planId, taskId: prepared.plan.taskId, files: prepared.plan.files,
        fileSnapshot: prepared.plan.fileSnapshot, checkpoints: prepared.plan.checkpoints, profile: prepared.profile };
      operation.taskId = prepared.taskId;
      options = { ...options, files: prepared.files, commits: prepared.commits, message: prepared.message ?? options.message,
        taskId: prepared.taskId, expectedHead: prepared.expectedHead, expectedFiles: prepared.expectedFiles };
      context.options = options;
    }

    const files = options.files ?? [];
    if (!Array.isArray(files) || new Set(files).size !== files.length) throw new Error('files must be an array of distinct exact paths.');
    operation.files = [...files];
    // A frozen plan already recorded committed deletions; its snapshot is authoritative.
    const allowMissing = Boolean(operation.plan);
    const fingerprint = await snapshotFiles(root, files, allowMissing);
    operation.fileSnapshot = fingerprint;
    if (options.expectedFiles && options.expectedFiles !== fingerprint) return await finish({ state: 'changed', message: 'Packet files changed since comparison; review the new snapshot.' });
    const initialHead = head(root);
    if (options.expectedHead && options.expectedHead !== initialHead) return await finish({ state: 'changed', message: 'Local HEAD changed since the request was prepared.' });
    stage(context, 'starting', { command });
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
      if (await snapshotFiles(root, files, allowMissing) !== fingerprint) return await finish({ state: 'changed', message: 'Packet files changed before checkpoint creation; compare again.' });
      if (selectedDirty(root, files) && (typeof options.message !== 'string' || !options.message.trim())) throw new Error('Provide a commit message for the selected files.');
      const saved = selectedDirty(root, files) ? checkpoint(root, files, options.message, operation.taskId, operationId) : null;
      if (saved) operation.checkpoints.push(saved);
      stage(context, 'checkpointed', { commit: saved ?? head(root) });
      await writeJSON(reportFile, operation);
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
    return await publishLoop(context, finish, setWorkspace, {
      baseHead: head(root), source: head(root), files, approved: options.commits ?? [], maxAttempts,
    });
  } catch (error) {
    if (error.code === 'SYNC_PAUSED') return await finish({ state: 'paused', message: error.message });
    const message = String(error.stderr || error.message).trim();
    await finish({ state: 'error', message });
    throw Object.assign(new Error(message), { report: reportFile });
  } finally { await release(); }
}

/**
 * Merge incoming work, verify the resulting tree once, apply it locally and publish.
 * Shared by ordinary publications and by conflict continuations.
 */
async function publishLoop(context, finish, setWorkspace, { baseHead, source, files, approved, maxAttempts }) {
  const { root, operation, operationDir, verifiedTrees } = context;
  const command = operation.command;
  let expectedBase = baseHead, expectedSource = source;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    ensureMain(root);
    if (head(root) !== expectedBase) return await finish({ state: 'changed', message: 'Local history changed between attempts; the new commits were not approved.' });
    const remote = remoteHead(root);
    operation.attempts.push({ attempt, local: expectedSource, remote,
      incoming: { commits: commits(root, expectedSource, remote), files: changes(root, git(root, ['merge-base', expectedSource, remote]), remote) } });
    if (command === 'pull' && ancestor(root, remote, expectedSource)) return await finish({ state: 'current', ...progress(root), commit: expectedSource, remoteObserved: remote });

    const incoming = !ancestor(root, remote, expectedSource);
    const sourceTree = git(root, ['rev-parse', `${expectedSource}^{tree}`]);
    // Nothing incoming and this exact tree is already verified: no second worktree, no second run.
    if (!incoming && verifiedTrees.has(sourceTree)) {
      operation.checks.push({ tree: sourceTree, commit: expectedSource, state: 'reused-in-operation' });
      const outcome = await applyAndPublish(context, finish, setWorkspace, { baseHead: expectedBase, candidate: expectedSource, remote, attempt, files });
      if (outcome !== null) return outcome;
      expectedBase = expectedSource;
      continue;
    }

    const working = path.join(operationDir, `workspace-${attempt}`);
    git(root, ['worktree', 'add', '--detach', working, expectedSource]);
    setWorkspace(working);
    if (incoming) {
      try { git(working, ['merge', '--no-edit', '-m', `Integrate origin/main\n\nTask: ${operation.taskId}\nSync-Operation: ${operation.operationId}`, remote]); }
      catch (error) {
        const conflicts = git(working, ['diff', '--name-only', '--diff-filter=U', '-z'], { trim: false }).split('\0').filter(Boolean);
        if (conflicts.length) return await finish({ state: 'conflict', conflicts, message: 'Resolve in the retained workspace; original working files were not merged.' });
        throw error;
      }
    }
    const candidate = head(working), tree = git(working, ['rev-parse', 'HEAD^{tree}']);
    git(root, ['update-ref', `refs/gamejam-sync/operations/${operation.operationId}`, candidate]);
    const changedFiles = changedPaths(working, git(working, ['merge-base', expectedSource, remote]), candidate);
    if (!verifiedTrees.has(tree)) {
      try { await verifyCandidate(context, { working, candidate, tree, changedFiles, attempt }); }
      catch (error) {
        if (!error.checksFailed) throw error;
        return await finish({ state: 'checks-failed', message: String(error.message), commit: candidate });
      }
      if (dirty(working) || head(working) !== candidate) return await finish({ state: 'changed', message: 'Checks changed candidate files or HEAD; candidate was not published.' });
    } else {
      operation.checks.push({ tree, commit: candidate, state: 'reused-in-operation' });
    }
    stage(context, 'checked', { attempt, tree });
    await writeJSON(context.reportFile, operation);
    const outcome = await applyAndPublish(context, finish, setWorkspace, { baseHead: expectedBase, candidate, remote, attempt, files });
    if (outcome !== null) return outcome;
    // A competitor advanced main; this candidate is applied locally and the next attempt merges that history.
    expectedBase = candidate;
    expectedSource = candidate;
  }
  return await finish({ state: 'remote-busy', message: 'Remote kept changing; local commits retained. Retry explicitly.' });
}

/** Apply a verified candidate to the source checkout, then push it and read it back. */
async function applyAndPublish(context, finish, setWorkspace, { baseHead, candidate, remote, attempt, files }) {
  const { root, directory, operation, options } = context;
  ensureMain(root);
  if (head(root) !== baseHead || selectedDirty(root, files) || (operation.command === 'pull' && dirty(root))) return await finish({ state: 'changed', message: 'Local HEAD or packet files changed during checks; no publication attempted.' });
  if (head(root) !== candidate) {
    try { git(root, ['merge', '--ff-only', '--no-edit', candidate]); }
    catch (error) { return await finish({ state: 'dirty', message: 'Local edits prevent applying the checked result; checkpoint and report preserved.', detail: String(error.stderr || error.message) }); }
  }
  const working = context.workspace;
  if (working) { try { git(root, ['worktree', 'remove', working]); setWorkspace(null); } catch { /* keep for inspection */ } }
  if (operation.command === 'pull') return await finish({ state: 'updated', ...progress(root), commit: candidate, remoteObserved: remote, message: 'Entire incoming packet integrated and checked.' });

  ensureMain(root);
  if (head(root) !== candidate || selectedDirty(root, files)) return await finish({ state: 'changed', message: 'Local state changed before push; approved candidate retained.' });
  networkGate(directory);
  stage(context, 'pushing', { attempt });
  let pushError = null;
  try { git(root, ['push', 'origin', `${candidate}:refs/heads/main`]); }
  catch (error) { pushError = error; }
  // Read back containment, not equality: a later collaborator commit may already exist.
  fetchMain(root, directory);
  const observed = remoteHead(root);
  if (ancestor(root, candidate, observed)) {
    if (operation.plan?.taskId) {
      const tasks = await import('./sync-tasks.mjs');
      await tasks.markPublished(directory, operation.plan.taskId, candidate);
    }
    return await finish({ state: 'pushed', commit: candidate, remoteObserved: observed,
      newerRemoteCommits: commits(root, candidate, observed).length, attempts: attempt,
      message: 'Published commit is present in the observed remote history.' });
  }
  if (!pushError) return await finish({ state: 'verification-failed', commit: candidate, remoteObserved: observed, message: 'Push returned success but readback does not contain the commit; inspect report.' });
  if (observed === remote) throw pushError;
  // A competitor advanced main. Retry a bounded merge/check against that exact history.
  return null;
}

/** Finish an already reviewed conflict locally. Never pushes. */
async function resolveOperation(context, finish, setWorkspace) {
  const { root, directory, operation, operationDir, options } = context;
  if (typeof options.operationId !== 'string' || !/^[a-f0-9-]{36}$/.test(options.operationId)) throw new Error('resolve requires a valid --operation ID.');
  const previousDir = path.join(directory, 'operations', options.operationId);
  const previous = await readJSON(path.join(previousDir, 'report.json'));
  const retained = previous?.result?.workspace;
  if (previous?.result?.state !== 'conflict' || path.resolve(previous.root) !== root || !retained
    || !/^workspace-\d+$/.test(path.relative(previousDir, path.resolve(retained)))) throw new Error('Not an owned conflict workspace for this checkout.');
  setWorkspace(path.resolve(retained));
  const original = previous.attempts.at(-1);
  if (head(root) !== original.local) return await finish({ state: 'changed', message: 'Source history changed since the conflict. Compare again; retained workspace was not applied.' });
  const resolution = resolutionSource(context.workspace, original);
  const conflicts = previous.result.conflicts;
  operation.files = [...conflicts];
  operation.taskId = options.taskId ? operation.taskId : previous.taskId;
  operation.resolves = options.operationId;
  operation.chain = await chainReports(directory, options.operationId);
  context.chain = operation.chain;
  const extraEdits = git(context.workspace, ['diff', '--name-only', '-z'], { trim: false }).split('\0').filter(Boolean).filter(file => !conflicts.includes(file));
  if (extraEdits.length || git(context.workspace, ['ls-files', '--others', '--exclude-standard'])) throw new Error('Resolution contains edits outside the reported conflicts.');
  if (!resolution.committed) {
    try { git(context.workspace, ['diff', '--check']); }
    catch { return await finish({ state: 'conflict', conflicts, message: 'Conflict markers or whitespace errors remain. Edit reported files in the retained workspace.' }); }
    git(context.workspace, ['add', '--all', '--', ...conflicts]);
    if (git(context.workspace, ['ls-files', '--unmerged'])) throw new Error('Unresolved index entries remain.');
    git(context.workspace, ['commit', '--no-edit']);
  }
  const candidate = resolution.source ?? head(context.workspace), tree = git(context.workspace, ['rev-parse', 'HEAD^{tree}']);
  git(root, ['update-ref', `refs/gamejam-sync/operations/${operation.operationId}`, candidate]);
  operation.before = { local: original.local, remote: original.remote };
  const changedFiles = changedPaths(context.workspace, git(context.workspace, ['merge-base', original.local, original.remote]), candidate);
  try { await verifyCandidate(context, { working: context.workspace, candidate, tree, changedFiles, attempt: 1, logName: 'checks-resolution.log' }); }
  catch (error) { if (!error.checksFailed) throw error; return await finish({ state: 'checks-failed', commit: candidate, message: error.message }); }
  if (dirty(context.workspace) || head(context.workspace) !== candidate || head(root) !== original.local) return await finish({ state: 'changed', message: 'Candidate or source changed during resolution checks.' });
  try { git(root, ['merge', '--ff-only', '--no-edit', candidate]); }
  catch { return await finish({ state: 'dirty', message: 'Local edits prevent applying the resolution; workspace retained.' }); }
  const result = await finish({ state: 'updated', commit: candidate, networkChecked: false, message: 'Conflict resolution checked and integrated locally. Publication is a separate request.' });
  previous.result.resolvedBy = operation.operationId;
  await writeJSON(path.join(directory, 'operations', options.operationId, 'report.json'), previous);
  return result;
}

/**
 * One continuation for "reviewed conflict -> verified result -> published".
 * Reuses the verification of an unchanged tree instead of running the full check twice.
 */
async function continueOperation(context, finish, setWorkspace) {
  const { root, directory, operation, operationDir, options } = context;
  const parentId = options.continueOperation;
  if (typeof parentId !== 'string' || !/^[a-f0-9-]{36}$/.test(parentId)) throw new Error('--continue needs a valid operation ID.');
  const parentDir = path.join(directory, 'operations', parentId);
  const parent = await readJSON(path.join(parentDir, 'report.json'));
  if (!parent) throw new Error('Unknown operation ID for this checkout.');
  if (path.resolve(parent.root) !== root) return await finish({ state: 'foreign-operation', message: 'This operation belongs to another checkout; start a new one here.' });
  if (parent.actor?.email && operation.actor.email && parent.actor.email !== operation.actor.email) {
    return await finish({ state: 'foreign-operation', message: 'This operation belongs to another actor; it cannot be continued from this identity.' });
  }
  let resolvedBy = null;
  let previousFailure = null;
  if (parent.result?.continuedBy) {
    const later = await readJSON(path.join(directory, 'operations', parent.result.continuedBy, 'report.json'));
    if (later?.result?.state === 'pushed') return await finish({ state: 'current', commit: later.result.commit, message: 'This operation was already continued and published; nothing was sent twice.' });
    if (['checks-failed', 'verification-failed'].includes(later?.result?.state)) previousFailure = later.result;
  }
  // Remember every continuation, so a repeated call can see the latest outcome.
  parent.result = { ...(parent.result ?? {}), continuedBy: operation.operationId,
    continuations: [...(parent.result?.continuations ?? []), operation.operationId] };
  await writeJSON(path.join(parentDir, 'report.json'), parent);
  operation.continues = parentId;
  operation.taskId = options.taskId ? operation.taskId : (parent.taskId || operation.taskId);

  let parentState = parent.result?.state;
  if (parentState === 'conflict' && parent.result?.resolvedBy) {
    resolvedBy = await readJSON(path.join(directory, 'operations', parent.result.resolvedBy, 'report.json'));
    if (resolvedBy) parentState = resolvedBy.result?.state === 'updated' ? 'updated' : parentState;
  }
  // The chain starts at the newest ancestor, so a local resolve contributes its evidence.
  operation.chain = await chainReports(directory, parent.result?.resolvedBy ?? parentId);
  context.chain = operation.chain;
  if (parentState === 'checks-failed' || parentState === 'verification-failed') {
    return await finish({ state: 'verification-failed', message: 'The previous run did not pass verification; fix the cause and start a new publication.' });
  }
  if (!['conflict', 'updated'].includes(parentState)) {
    return await finish({ state: 'not-resumable', message: `Operation ${parentId} is ${parent.result?.state}; only a reviewed conflict can be continued.` });
  }

  let source;
  if (parentState === 'conflict') {
    const retained = parent.result?.workspace;
    if (!retained || !/^workspace-\d+$/.test(path.relative(parentDir, path.resolve(retained)))) throw new Error('The conflict workspace is no longer owned by that operation.');
    setWorkspace(path.resolve(retained));
    const original = parent.attempts.at(-1);
    if (head(root) !== original.local) return await finish({ state: 'changed', message: 'Source history changed since the conflict; nothing was applied.' });
    const resolution = resolutionSource(context.workspace, original);
    const conflicts = parent.result.conflicts;
    operation.files = [...conflicts];
    const extraEdits = git(context.workspace, ['diff', '--name-only', '-z'], { trim: false }).split('\0').filter(Boolean).filter(file => !conflicts.includes(file));
    if (extraEdits.length || git(context.workspace, ['ls-files', '--others', '--exclude-standard'])) throw new Error('Resolution contains edits outside the reported conflicts.');
    if (!resolution.committed) {
      try { git(context.workspace, ['diff', '--check']); }
      catch { return await finish({ state: 'conflict', conflicts, message: 'Conflict markers or whitespace errors remain. Edit reported files in the retained workspace.' }); }
      git(context.workspace, ['add', '--all', '--', ...conflicts]);
      if (git(context.workspace, ['ls-files', '--unmerged'])) throw new Error('Unresolved index entries remain.');
      git(context.workspace, ['commit', '--no-edit']);
    }
    source = resolution.source ?? head(context.workspace);
    const tree = git(context.workspace, ['rev-parse', 'HEAD^{tree}']);
    git(root, ['update-ref', `refs/gamejam-sync/operations/${operation.operationId}`, source]);
    const changedFiles = changedPaths(context.workspace, git(context.workspace, ['merge-base', original.local, original.remote]), source);
    const repeated = repeatedFailure(previousFailure, root, tree);
    if (repeated) return await finish({ state: 'verification-failed', commit: source,
      message: `This exact result already failed verification in operation ${repeated.operationId}; fix the cause instead of repeating the run.` });
    try { await verifyCandidate(context, { working: context.workspace, candidate: source, tree, changedFiles, attempt: 1, logName: 'checks-continuation.log' }); }
    catch (error) { if (!error.checksFailed) throw error; return await finish({ state: 'checks-failed', commit: source, message: error.message }); }
    if (dirty(context.workspace) || head(context.workspace) !== source) return await finish({ state: 'changed', message: 'Candidate changed during verification; nothing was published.' });
    operation.before = { local: original.local, remote: original.remote };
  } else {
    const applied = resolvedBy?.result?.commit ?? parent.result?.commit;
    if (!applied || head(root) !== applied) return await finish({ state: 'changed', message: 'Local HEAD moved after the reviewed resolution; start a new publication.' });
    source = applied;
    const base = resolvedBy?.before ?? parent.before;
    const tree = git(root, ['rev-parse', `${source}^{tree}`]);
    const changedFiles = changedPaths(root, git(root, ['merge-base', base.local, base.remote]), source);
    const repeated = repeatedFailure(previousFailure, root, tree);
    if (repeated) return await finish({ state: 'verification-failed', commit: source,
      message: `This exact result already failed verification in operation ${repeated.operationId}; fix the cause instead of repeating the run.` });
    const profile = await resolveProfile(root, changedFiles);
    const environment = await environmentFingerprint(root);
    const criteria = { tree, profile: profile.name, environment };
    const known = findVerification(context.chain, criteria);
    if (known) {
      operation.verifications.push({ ...known, operationId: operation.operationId, reused: true, reusedFrom: known.operationId });
      operation.checks.push({ tree, commit: source, state: 'reused-chain', reusedFrom: known.operationId, log: known.log });
      context.verifiedTrees.set(tree, known);
      stage(context, 'verified', { tree, reusedFrom: known.operationId });
    } else {
      try { await verifyCandidate(context, { working: root, candidate: source, tree, changedFiles, attempt: 1, logName: 'checks-continuation.log' }); }
      catch (error) { if (!error.checksFailed) throw error; return await finish({ state: 'checks-failed', commit: source, message: error.message }); }
    }
    operation.before = { local: base.local, remote: base.remote };
  }

  const approved = [...(options.commits ?? [])];
  const chainIds = [parentId, operation.operationId, ...context.chain.map(report => report.operationId)];
  const unpublished = commits(root, remoteHead(root), source);
  const foreign = unpublished.filter(item => !approved.includes(item.id) && !commitOwnedByChain(root, item.id, chainIds));
  if (foreign.length) {
    return await finish({ state: 'approval-required', commit: source, unapprovedCommits: foreign.map(item => item.id),
      message: 'Unpublished history outside this operation chain needs explicit approval.' });
  }
  for (const item of unpublished) if (!approved.includes(item.id)) approved.push(item.id);

  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new Error('maxAttempts must be 1..5.');
  const outcome = await publishLoop(context, finish, setWorkspace, {
    baseHead: head(root), source, files: [], approved, maxAttempts,
  });
  if (outcome.state === 'pushed') {
    parent.result.continuedBy = operation.operationId;
    await writeJSON(path.join(directory, 'operations', parentId, 'report.json'), parent);
  }
  return outcome;
}

export const isSuccessState = state => SUCCESS.includes(state);
