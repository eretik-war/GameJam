import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sync } from './sync-engine.mjs';
import { readJSON } from './sync-support.mjs';

export { sync } from './sync-engine.mjs';
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function parseArguments(args) {
  const rawCommand = args.shift();
  const command = ({ sync: 'pull', publish: 'push', inspect: 'status' })[rawCommand] || rawCommand;
  const options = {};
  let requestFile = null;
  while (args.length) {
    const flag = args.shift();
    if (flag === '--background') { options.background = true; continue; }
    if (flag === '--request') { requestFile = args.shift(); if (!requestFile) throw new Error('--request needs a JSON file.'); continue; }
    const field = { '--task': 'taskId', '--actor': 'actor', '--message': 'message', '--operation': 'operationId', '--expected-head': 'expectedHead', '--expected-remote': 'expectedRemote', '--expected-files': 'expectedFiles', '--attempts': 'maxAttempts', '--limit': 'limit' }[flag];
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
    const allowed = new Set(['taskId', 'actor', 'message', 'operationId', 'files', 'commits', 'expectedHead', 'expectedRemote', 'expectedFiles', 'maxAttempts', 'limit']);
    for (const key of Object.keys(request)) if (!allowed.has(key)) throw new Error(`Unknown request field: ${key}`);
    if (Object.keys(options).some(key => key !== 'background')) throw new Error('Use either a request file or packet flags, not both.');
    Object.assign(options, request);
  }
  return { command, options };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { command, options } = await parseArguments(process.argv.slice(2));
    const result = await sync(projectRoot, command, options);
    const success = ['current', 'updated', 'pushed', 'saved', 'compared', 'history', 'resumed'];
    if (!options.background || !['current', 'dirty', 'busy', 'paused'].includes(result.state)) console.log(JSON.stringify(result, null, 2));
    if (!success.includes(result.state) && !['status', 'pause'].includes(command) && !(options.background && ['dirty', 'busy', 'paused'].includes(result.state))) process.exitCode = 2;
  } catch (error) { console.error(JSON.stringify({ state: 'error', message: error.message, ...(error.report ? { report: error.report } : {}) })); process.exitCode = 1; }
}
