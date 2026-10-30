import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { root } from './build.mjs';

const manifest = JSON.parse(await fs.readFile(path.join(root, 'PROJECT_MANIFEST.json'), 'utf8'));
const output = path.join(root, 'work/domain.test.mjs');
await fs.mkdir(path.dirname(output), { recursive: true });
await build({ entryPoints: [path.join(root, manifest.activeVersionPath, 'tests/domain.test.ts')], bundle: true, platform: 'node', format: 'esm', target: 'node22', loader: { '.jpg': 'dataurl', '.png': 'dataurl' }, outfile: output });
const result = spawnSync(process.execPath, ['--test', output], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
