import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { git, head, snapshotFiles, readJSON, writeJSON, resolveProfile } from './sync-support.mjs';

/**
 * Local task registry and immutable publication plans.
 *
 * Everything lives in the shared Git directory, is never committed and is never
 * shared between machines. A plan is a frozen statement of "these exact files,
 * these exact hashes, these task-owned commits" and becomes stale as soon as the
 * source or the selected files move.
 */

const TASK_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PLAN_PATTERN = /^[a-f0-9]{16}$/;

export function assertTaskId(value) {
  if (typeof value !== 'string' || !TASK_PATTERN.test(value)) {
    throw new Error('Invalid task ID: use 1..64 characters of letters, digits, dot, dash or underscore.');
  }
  return value;
}
export function assertPlanId(value) {
  if (typeof value !== 'string' || !PLAN_PATTERN.test(value)) throw new Error('Invalid plan ID: expected 16 hexadecimal characters.');
  return value;
}

const taskFile = (directory, id) => path.join(directory, 'tasks', `${assertTaskId(id)}.json`);
const planFile = (directory, id) => path.join(directory, 'plans', `${assertPlanId(id)}.json`);
const remoteHead = root => git(root, ['rev-parse', 'refs/remotes/origin/main']);

export async function readTask(directory, id) {
  return readJSON(taskFile(directory, id));
}
async function writeTask(directory, task) {
  await fs.mkdir(path.join(directory, 'tasks'), { recursive: true });
  await writeJSON(taskFile(directory, task.taskId), task);
}
export async function listTasks(directory) {
  const names = await fs.readdir(path.join(directory, 'tasks')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const tasks = [];
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const task = await readJSON(path.join(directory, 'tasks', name));
    if (task) tasks.push(task);
  }
  return tasks;
}

/** Files still claimed by another unfinished task, so nothing is published twice. */
export async function ownershipConflicts(directory, taskId, files) {
  const owners = [];
  for (const task of await listTasks(directory)) {
    if (task.taskId === taskId || task.state === 'published') continue;
    for (const file of files) if (task.files?.includes(file)) owners.push({ file, taskId: task.taskId, state: task.state });
  }
  return owners;
}

/** Commits that explicitly carry this task's trailer, and the ones that do not. */
export function taskCommits(root, taskId) {
  const ids = git(root, ['rev-list', '--reverse', 'refs/remotes/origin/main..HEAD']).split('\n').filter(Boolean);
  const owned = [], foreign = [];
  for (const id of ids) {
    const body = git(root, ['show', '-s', '--format=%B', id]);
    const match = /^Task:\s*(.+)$/m.exec(body);
    (match && match[1].trim() === taskId ? owned : foreign).push(id);
  }
  return { owned, foreign };
}

export async function registerTask({ root, directory, actor, taskId, files }) {
  const id = assertTaskId(taskId);
  if (!Array.isArray(files) || !files.length) throw new Error('Register a task with at least one exact --file path.');
  // snapshotFiles validates exactness, ignores and traversal before anything is written.
  await snapshotFiles(root, files);
  const conflicts = await ownershipConflicts(directory, id, files);
  if (conflicts.length) return { state: 'ownership-conflict', taskId: id, owners: conflicts,
    message: 'These files belong to another unfinished task; agree on ownership before publishing.' };
  const existing = await readTask(directory, id);
  const task = existing ?? { schemaVersion: 1, taskId: id, createdAt: new Date().toISOString(), baseCommit: head(root),
    actor, files: [], state: 'open', checkpoints: [], plans: [], publishedCommit: null };
  if (task.state === 'published') { task.state = 'open'; task.publishedCommit = null; }
  task.actor = actor;
  task.files = [...new Set([...task.files, ...files])];
  task.updatedAt = new Date().toISOString();
  await writeTask(directory, task);
  return { state: 'registered', taskId: id, files: task.files, baseCommit: task.baseCommit, message: 'Task ownership recorded locally.' };
}

export async function markReady({ root, directory, actor, taskId }) {
  const id = assertTaskId(taskId);
  const task = await readTask(directory, id);
  if (!task) throw new Error(`Unknown task: ${id}. Register it first.`);
  const conflicts = await ownershipConflicts(directory, id, task.files);
  if (conflicts.length) return { state: 'ownership-conflict', taskId: id, owners: conflicts,
    message: 'These files belong to another unfinished task; agree on ownership before publishing.' };
  const commits = taskCommits(root, id);
  if (!task.files.length && !commits.owned.length) throw new Error('A task needs exact files or its own checkpoints before it can be ready.');
  task.state = 'ready';
  task.actor = actor;
  task.readyAt = new Date().toISOString();
  task.updatedAt = task.readyAt;
  await writeTask(directory, task);
  return { state: 'ready', taskId: id, files: task.files, checkpoints: commits.owned,
    unapprovedCommits: commits.foreign, message: 'Packet readiness recorded explicitly; nothing was published.' };
}

/** Freeze the current packet into an immutable plan. */
export async function createPlan({ root, directory, actor, taskId, message }) {
  const id = assertTaskId(taskId);
  const task = await readTask(directory, id);
  if (!task) throw new Error(`Unknown task: ${id}. Register it first.`);
  if (task.state !== 'ready') throw new Error(`Task ${id} is ${task.state}; mark it ready before planning.`);
  const conflicts = await ownershipConflicts(directory, id, task.files);
  if (conflicts.length) return { state: 'ownership-conflict', taskId: id, owners: conflicts,
    message: 'These files belong to another unfinished task; agree on ownership before publishing.' };
  const fileSnapshot = await snapshotFiles(root, task.files, true);
  const commits = taskCommits(root, id);
  const profile = await resolveProfile(root, task.files);
  const body = {
    schemaVersion: 1, taskId: id, actor, createdAt: new Date().toISOString(),
    baseHead: head(root), remoteObserved: remoteHead(root),
    files: [...task.files], fileSnapshot, checkpoints: commits.owned, unapprovedCommits: commits.foreign,
    profile, message: typeof message === 'string' && message.trim() ? message.trim() : null,
  };
  const planId = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  const plan = { planId, ...body };
  await fs.mkdir(path.join(directory, 'plans'), { recursive: true });
  await writeJSON(planFile(directory, planId), plan);
  task.plans = [...new Set([...(task.plans ?? []), planId])];
  task.updatedAt = plan.createdAt;
  await writeTask(directory, task);
  return { state: 'planned', planId, taskId: id, files: plan.files.length, checkpoints: plan.checkpoints.length,
    unapprovedCommits: plan.unapprovedCommits.length, profile: profile.name, baseHead: plan.baseHead,
    plan: planFile(directory, planId), message: 'Plan frozen locally; publication must name this plan ID.' };
}

export async function loadPlan(directory, planId) {
  const plan = await readJSON(planFile(directory, planId));
  if (!plan) throw new Error(`Unknown plan: ${planId}. Create it with sync plan --task ID.`);
  return plan;
}

/** Re-validate a frozen plan against the current source before publication. */
export async function preparePlan({ root, directory, planId }) {
  const plan = await loadPlan(directory, assertPlanId(planId));
  const task = await readTask(directory, plan.taskId);
  if (!task) throw new Error(`Plan ${planId} refers to an unknown task.`);
  if (task.publishedCommit && task.publishedCommit === head(root)) {
    return { state: 'current', plan, taskId: plan.taskId, message: 'This plan was already published; nothing new to send.' };
  }
  if (head(root) !== plan.baseHead) {
    return { state: 'plan-stale', plan, taskId: plan.taskId,
      message: 'Local history moved since the plan was frozen; create a new plan.' };
  }
  const snapshot = await snapshotFiles(root, plan.files, true);
  if (snapshot !== plan.fileSnapshot) {
    return { state: 'plan-stale', plan, taskId: plan.taskId,
      message: 'Selected files changed since the plan was frozen; create a new plan.' };
  }
  const conflicts = await ownershipConflicts(directory, plan.taskId, plan.files);
  if (conflicts.length) return { state: 'ownership-conflict', plan, taskId: plan.taskId, owners: conflicts,
    message: 'These files belong to another unfinished task; agree on ownership before publishing.' };
  return { state: 'prepared', plan, taskId: plan.taskId, files: plan.files, commits: plan.checkpoints,
    message: plan.message, expectedHead: plan.baseHead, expectedFiles: plan.fileSnapshot, profile: plan.profile.name };
}

export async function markPublished(directory, taskId, commit) {
  const task = await readTask(directory, taskId);
  if (!task) return;
  task.state = 'published';
  task.publishedCommit = commit;
  task.publishedAt = new Date().toISOString();
  task.updatedAt = task.publishedAt;
  await writeTask(directory, task);
}
