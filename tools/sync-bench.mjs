import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sync } from './sync-engine.mjs';
import { formatSummary } from './sync.mjs';
import { readMetrics, resetMetrics } from './sync-support.mjs';
import { fixture as templateFixture, legacyFixture, git, write, commit, publishBob, gitCount, resetGitCount } from './sync-testkit.mjs';

/**
 * Reproducible local measurement of the publication protocol.
 *
 * It never touches a real remote: every scenario runs inside a temporary
 * repository. Raw data is written to the shared Git directory; stdout stays a
 * short summary that is safe to read in a chat.
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = parse(process.argv.slice(2));

function parse(args) {
  const result = { repeats: 3, fixture: 'template', out: null, json: false };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--repeats') result.repeats = Number(args.shift());
    else if (flag === '--fixture') result.fixture = args.shift();
    else if (flag === '--out') result.out = args.shift();
    else if (flag === '--json') result.json = true;
    else if (flag === '--label') result.label = args.shift();
    else if (flag === '--only') result.only = args.shift();
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!Number.isInteger(result.repeats) || result.repeats < 1 || result.repeats > 20) throw new Error('--repeats must be 1..20');
  if (!['template', 'legacy'].includes(result.fixture)) throw new Error('--fixture must be template or legacy');
  return result;
}

const cleaners = [];
const fakeTest = { after: fn => cleaners.push(fn) };
const makeFixture = () => (options.fixture === 'legacy' ? legacyFixture(fakeTest) : templateFixture(fakeTest));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const round = value => Math.round(value);

async function setupScenario() {
  resetGitCount();
  const started = performance.now();
  const repos = [];
  for (let i = 0; i < 3; i++) repos.push(await makeFixture());
  const ms = performance.now() - started;
  for (const repo of repos) await fs.rm(repo.base, { recursive: true, force: true });
  return { runs: 3, ms: round(ms), msPerRepo: round(ms / 3), gitProcesses: gitCount(), gitProcessesPerRepo: round(gitCount() / 3) };
}

async function publishScenario() {
  const f = await makeFixture();
  await write(f.alice, 'a.txt', 'bench packet\n');
  const trees = [];
  resetMetrics();
  const started = performance.now();
  const result = await sync(f.alice, 'push', {
    taskId: 'bench-publish', message: 'Bench packet', files: ['a.txt'],
    check: async (working, info) => { trees.push(info?.tree); },
  });
  const ms = performance.now() - started;
  const metrics = readMetrics();
  return { state: result.state, ms: round(ms), checkRuns: trees.length, distinctTrees: new Set(trees).size,
    gitProcesses: metrics.gitProcesses, attempts: result.attempts ?? null,
    printedBytes: Buffer.byteLength(formatSummary(result).join('\n'), 'utf8'), report: result.report };
}

async function conflictScenario() {
  const engine = await import('./sync-engine.mjs');
  const supportsContinue = Boolean(engine.capabilities?.continue);
  const f = await makeFixture();
  await write(f.alice, 'a.txt', 'Alice version\n');
  const aliceCommit = commit(f.alice, 'Alice version');
  await publishBob(f, 'a.txt', 'Bob version\n');
  const conflict = await sync(f.alice, 'pull', { check: () => { throw new Error('Conflict must precede checks'); } });
  if (conflict.state !== 'conflict') throw new Error(`Expected a conflict, received ${conflict.state}`);
  await write(conflict.workspace, 'a.txt', 'Combined by reviewer\n');
  const trees = [];
  const check = async (working, info) => { trees.push(info?.tree); };
  resetMetrics();
  const started = performance.now();
  let route = 'continue';
  let result;
  if (supportsContinue) {
    result = await sync(f.alice, 'publish', { continueOperation: conflict.operationId, taskId: 'bench-conflict', commits: [aliceCommit], check });
  } else {
    route = 'resolve+push';
    const resolved = await sync(f.alice, 'resolve', { operationId: conflict.operationId, check });
    if (resolved.state !== 'updated') throw new Error(`Resolve failed: ${resolved.state} ${resolved.message || ''}`);
    const outgoing = git(f.alice, 'rev-list', '--reverse', 'origin/main..HEAD').split('\n').filter(Boolean);
    result = await sync(f.alice, 'push', { taskId: 'bench-conflict', message: 'Bench merge', files: ['a.txt'], commits: outgoing, check });
  }
  const ms = performance.now() - started;
  const metrics = readMetrics();
  const remote = git(f.remote, 'rev-parse', 'main');
  return { route, state: result.state, message: result.message, ms: round(ms), checkRuns: trees.length, distinctTrees: new Set(trees).size,
    repeatedTreeChecks: trees.length - new Set(trees).size, gitProcesses: metrics.gitProcesses,
    published: remote === result.commit, printedBytes: Buffer.byteLength(formatSummary(result).join('\n'), 'utf8'),
    report: result.report };
}

async function cliScenario() {
  const f = await makeFixture();
  await write(f.bob, 'package.json', JSON.stringify({ private: true, type: 'module', scripts: { check: 'node check.mjs' } }));
  await write(f.bob, 'check.mjs', "console.log('Bench checker passed');\n");
  commit(f.bob, 'Bench checker');
  git(f.bob, 'push');
  await sync(f.alice, 'pull', { check: () => {} });
  await write(f.alice, 'a.txt', 'cli packet\n');
  const started = performance.now();
  const child = spawnSync(process.execPath, [path.join(projectRoot, 'tools/sync.mjs'), 'publish',
    '--task', 'bench-cli', '--message', 'Bench CLI packet', '--file', 'a.txt'],
  { cwd: f.alice, encoding: 'utf8', windowsHide: true, timeout: 300_000, env: { ...process.env, GAMEJAM_SYNC_ROOT: f.alice } });
  const ms = performance.now() - started;
  return { status: child.status, ms: round(ms), stdoutBytes: Buffer.byteLength(child.stdout || '', 'utf8'),
    stderrBytes: Buffer.byteLength(child.stderr || '', 'utf8'), stdoutLines: (child.stdout || '').split('\n').filter(Boolean).length,
    stdout: (child.stdout || '').trim().slice(0, 1200) };
}

const scenarios = { setup: setupScenario, publish: publishScenario, conflict: conflictScenario, cli: cliScenario };
const report = {
  label: options.label || null, fixture: options.fixture, recordedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, git: spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout.trim() },
  repeats: options.repeats, results: {},
};

try {
  for (const [name, run] of Object.entries(scenarios)) {
    if (options.only && options.only !== name) continue;
    const repeats = name === 'setup' || name === 'cli' ? 1 : options.repeats;
    const samples = [];
    for (let i = 0; i < repeats; i++) samples.push(await run());
    report.results[name] = { repeats, samples, first: samples[0], median: Object.fromEntries(Object.keys(samples[0])
      .filter(key => typeof samples[0][key] === 'number').map(key => [key, median(samples.map(sample => sample[key]))])) };
  }
} finally {
  for (const clean of cleaners.reverse()) { try { await clean(); } catch { /* measurement cleanup is best effort */ } }
}

const directory = path.join(projectRoot, '.git', 'gamejam-sync', 'bench');
await fs.mkdir(directory, { recursive: true });
const file = options.out || path.join(directory, `bench-${report.recordedAt.replace(/[:.]/g, '-')}.json`);
await fs.writeFile(file, JSON.stringify(report, null, 2) + '\n');
report.raw = file;

if (options.json) console.log(JSON.stringify(report, null, 2));
else {
  const r = report.results;
  console.log(`baseline report: ${file}`);
  console.log(`environment: ${report.environment.node} / ${report.environment.git}`);
  console.log(`fixture: ${options.fixture}, repeats: ${options.repeats}`);
  if (r.setup) {
    const setup = r.setup.median;
    console.log(`setup: ${setup.ms} ms for 3 repos (${setup.msPerRepo} ms each), ${setup.gitProcessesPerRepo} git processes each`);
  }
  if (r.publish) {
    const publish = r.publish.median, first = r.publish.first;
    console.log(`publish: ${publish.ms} ms, ${publish.checkRuns} check run(s), ${publish.gitProcesses} git processes, ${publish.printedBytes} B summary, ${first.state}`);
  }
  if (r.conflict) {
    const conflict = r.conflict.median, first = r.conflict.first;
    console.log(`conflict: ${conflict.ms} ms via ${first.route}, ${conflict.checkRuns} check run(s) on ${conflict.distinctTrees} tree(s), ${conflict.gitProcesses} git processes, published=${first.published}`);
    if (first.state !== 'pushed') console.log(`  conflict state: ${first.state} — ${first.message}`);
  }
  if (r.cli) {
    const cli = r.cli.median;
    console.log(`cli: exit ${cli.status}, ${cli.stdoutBytes} B stdout (${cli.stdoutLines} lines), ${cli.stderrBytes} B stderr, ${cli.ms} ms`);
  }
}
