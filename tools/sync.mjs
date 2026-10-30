import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sync, isSuccessState } from './sync-engine.mjs';
import { readJSON } from './sync-support.mjs';

export { sync } from './sync-engine.mjs';
const ownRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Measurements and tests may point the CLI at a temporary clone; the engine still
// verifies that the directory is a main branch tracking origin/main.
export const projectRoot = process.env.GAMEJAM_SYNC_ROOT ? path.resolve(process.env.GAMEJAM_SYNC_ROOT) : ownRoot;

export async function parseArguments(args) {
  const rawCommand = args.shift();
  const command = ({ sync: 'pull', publish: 'push', inspect: 'status' })[rawCommand] || rawCommand;
  const options = {};
  if (command === 'task') {
    const action = args.shift();
    if (!['register', 'ready'].includes(action)) throw new Error('Task actions: register | ready');
    options.action = action;
  }
  let requestFile = null;
  while (args.length) {
    const flag = args.shift();
    if (flag === '--background') { options.background = true; continue; }
    if (flag === '--json') { options.json = true; continue; }
    if (flag === '--events') { options.events = true; continue; }
    if (flag === '--quiet') { options.quiet = true; continue; }
    if (flag === '--request') { requestFile = args.shift(); if (!requestFile) throw new Error('--request needs a JSON file.'); continue; }
    const field = { '--task': 'taskId', '--actor': 'actor', '--message': 'message', '--operation': 'operationId',
      '--continue': 'continueOperation', '--plan': 'planId', '--expected-head': 'expectedHead', '--expected-remote': 'expectedRemote',
      '--expected-files': 'expectedFiles', '--attempts': 'maxAttempts', '--limit': 'limit' }[flag];
    if (field) {
      const value = args.shift();
      if (value === undefined) throw new Error(`Missing value for ${flag}`);
      options[field] = ['maxAttempts', 'limit'].includes(field) ? Number(value) : value;
    } else if (flag === '--file' || flag === '--commit') {
      const value = args.shift();
      if (value === undefined) throw new Error(`Missing value for ${flag}`);
      (options[flag === '--file' ? 'files' : 'commits'] ??= []).push(value);
    } else throw new Error(`Unknown argument: ${flag}. Use explicit --task/--message/--file or --request JSON; implicit add --all is disabled.`);
  }
  if (requestFile) {
    const request = await readJSON(path.resolve(requestFile));
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Request file must contain a JSON object.');
    const allowed = new Set(['taskId', 'actor', 'message', 'operationId', 'continueOperation', 'planId', 'files', 'commits',
      'expectedHead', 'expectedRemote', 'expectedFiles', 'maxAttempts', 'limit']);
    for (const key of Object.keys(request)) if (!allowed.has(key)) throw new Error(`Unknown request field: ${key}`);
    if (Object.keys(options).some(key => !['background', 'json', 'events', 'quiet'].includes(key))) throw new Error('Use either a request file or packet flags, not both.');
    Object.assign(options, request);
  }
  return { command, options };
}

const NEXT = {
  pushed: () => 'nothing; the commit is present on the observed remote',
  updated: () => 'nothing; local main contains the verified result',
  current: () => 'nothing; nothing unpublished',
  saved: () => 'local checkpoint only; publication is a separate request',
  compared: () => 'review the report, then publish the agreed packet',
  registered: result => `npm run sync -- task ready --task ${result.taskId}`,
  ready: result => `npm run sync -- plan --task ${result.taskId}`,
  planned: result => `npm run sync -- publish --plan ${result.planId}`,
  history: () => 'nothing; read the listed operations if needed',
  conflict: result => `edit the listed files, then: npm run sync -- publish --continue ${result.operationId}`,
  'checks-failed': () => 'read the check log, fix the cause, then publish again',
  'verification-failed': () => 'the same result already failed; change the cause first',
  'approval-required': () => 'review the listed commits and pass them explicitly with --commit',
  'scope-required': () => 'pass exact --file paths for the agreed packet',
  'ownership-conflict': () => 'agree on the file owner with the other task first',
  'plan-stale': () => 'npm run sync -- plan --task TASK to freeze a new packet',
  changed: () => 're-run compare/plan, then repeat the publication',
  dirty: () => 'commit or discard the local edits first',
  paused: () => 'resume requires a direct user instruction',
  busy: () => 'wait for the active operation to finish',
  'remote-busy': () => 'retry explicitly after reviewing the report',
  'foreign-operation': () => 'start a new operation in this checkout',
  'not-resumable': () => 'start a new publication',
  diverged: () => 'request an explicit sync',
  error: () => 'read the failed stage and the report',
};
const short = value => (typeof value === 'string' && value.length > 12 ? value.slice(0, 7) : value);
const oneLine = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
const FAILURE_STAGES = new Set(['checks-failed', 'error', 'verification-failed', 'changed', 'dirty', 'remote-busy']);

/** Human summary of about a dozen lines; the report keeps every detail. */
export function formatSummary(result) {
  if (result.operations && result.state === 'history') {
    const lines = [`operations: ${result.operations.length}`];
    for (const entry of result.operations) {
      lines.push(`- ${short(entry.operationId)} ${entry.command} ${entry.state}${entry.taskId ? ` task=${entry.taskId}` : ''}${entry.commit ? ` commit=${short(entry.commit)}` : ''} ${entry.finishedAt ?? ''}`.trim());
    }
    return lines;
  }
  if (result.branch !== undefined && result.lastRun !== undefined) {
    const lines = [`branch: ${result.branch}`, `local: ${short(result.local)}`,
      `remote: ${short(result.remoteObserved)} observed (snapshot of the last fetch)`,
      `ahead/behind: ${result.ahead}/${result.behind}`, `working tree: ${result.dirty ? 'has local edits' : 'clean'}`,
      `paused: ${result.paused ? `yes — ${oneLine(result.pause?.reason)}` : 'no'}`, `lock: ${result.lock ?? 'none'}`];
    if (result.lastRun) lines.push(`last run: ${result.lastRun.operationId} ${result.lastRun.state}${result.lastRun.commit ? ` ${short(result.lastRun.commit)}` : ''}`);
    lines.push(`next: ${result.paused ? 'resume requires a direct user instruction' : 'publish only on a direct instruction'}`);
    return lines;
  }
  const lines = [`state: ${result.state}`];
  if (result.taskId && result.taskId !== 'synchronization') lines.push(`task: ${result.taskId}`);
  if (result.planId) lines.push(`plan: ${result.planId}`);
  if (result.operationId) lines.push(`operation: ${result.operationId}`);
  if (result.commit) lines.push(`commit: ${short(result.commit)}${result.tree ? ` (tree ${short(result.tree)})` : ''}`);
  if (result.remoteObserved) lines.push(`remote: ${short(result.remoteObserved)} observed${result.newerRemoteCommits ? `, ${result.newerRemoteCommits} newer` : ''}`);
  if (typeof result.ahead === 'number' && typeof result.behind === 'number') lines.push(`ahead/behind: ${result.ahead}/${result.behind}`);
  if (result.checkRuns || result.checksReused) lines.push(`checks: ${result.checkRuns ?? 0} run(s), ${result.checksReused ?? 0} reused`);
  if (result.conflicts?.length) lines.push(`conflicts: ${result.conflicts.join(', ')}`);
  else if (Array.isArray(result.files)) lines.push(`files: ${result.files.length}`);
  else if (typeof result.files === 'number') lines.push(`files: ${result.files}`);
  if (result.workspace) lines.push(`workspace: ${result.workspace}`);
  if (result.stage && FAILURE_STAGES.has(result.state)) lines.push(`stage: ${result.stage}`);
  if (result.message && !['pushed', 'updated', 'current', 'saved', 'compared', 'history'].includes(result.state)) lines.push(`reason: ${oneLine(result.message)}`);
  if (result.report) lines.push(`report: ${result.report}`);
  const next = NEXT[result.state];
  lines.push(`next: ${next ? next(result) : 'read the report'}`);
  return lines;
}
const formatEvent = entry => `[${entry.stage}]${entry.tree ? ` tree ${short(entry.tree)}` : ''}${entry.profile ? ` ${entry.profile}` : ''}${entry.attempt ? ` attempt ${entry.attempt}` : ''}${entry.reusedFrom ? ` reused ${short(entry.reusedFrom)}` : ''}${entry.ms ? ` ${entry.ms}ms` : ''}`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { command, options } = await parseArguments(process.argv.slice(2));
    // Progress goes to stderr only, so stdout stays a single valid document.
    if ((options.events || (!options.json && !options.quiet)) && !options.background) {
      options.onStage = entry => process.stderr.write(formatEvent(entry) + '\n');
    }
    const result = await sync(projectRoot, command, options);
    const quietBackground = options.background && ['current', 'dirty', 'busy', 'paused'].includes(result.state);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else if (!quietBackground) console.log(formatSummary(result).join('\n'));
    if (!isSuccessState(result.state) && !['status', 'pause'].includes(command) && !(options.background && ['dirty', 'busy', 'paused'].includes(result.state))) process.exitCode = 2;
  } catch (error) {
    if (process.argv.includes('--json')) console.error(JSON.stringify({ state: 'error', message: error.message, ...(error.report ? { report: error.report } : {}) }));
    else console.error([`state: error`, `reason: ${oneLine(error.message)}`, ...(error.report ? [`report: ${error.report}`] : []), 'next: read the failed stage and the report'].join('\n'));
    process.exitCode = 1;
  }
}
