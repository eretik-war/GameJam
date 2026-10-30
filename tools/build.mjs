import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function buildGame(offline = false) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'PROJECT_MANIFEST.json'), 'utf8'));
  const versionRoot = path.join(root, manifest.activeVersionPath);
  const lock = JSON.parse(await fs.readFile(path.join(root, 'ENGINE_LOCK.json'), 'utf8'));
  for (const file of lock.files) {
    if (hash(await fs.readFile(path.join(root, file.path))) !== file.sha256) throw new Error(`Engine hash mismatch: ${file.path}`);
  }
  const result = await build({
    entryPoints: [path.join(versionRoot, 'src/main.ts')], bundle: true, write: false,
    format: 'iife', target: 'es2022', minify: true, legalComments: 'inline',
    loader: { '.jpg': 'dataurl' },
    plugins: [{ name: 'local-pixi-global', setup(builder) {
      builder.onResolve({ filter: /^pixi\.js$/ }, () => ({ path: 'pixi.js', namespace: 'local-pixi' }));
      builder.onLoad({ filter: /.*/, namespace: 'local-pixi' }, () => ({ contents: 'module.exports = globalThis.PIXI;', loader: 'js' }));
    } }],
  });
  const game = result.outputFiles[0].text;
  const engine = (await fs.readFile(path.join(root, lock.runtime), 'utf8')).replace(/^\/\/# sourceMappingURL=.*$/gm, '');
  const license = await fs.readFile(path.join(root, lock.license), 'utf8');
  let html = await fs.readFile(path.join(versionRoot, 'src/index.html'), 'utf8');
  const css = await fs.readFile(path.join(versionRoot, 'src/style.css'), 'utf8');
  for (const [token, content] of [
    ['/*__STYLE__*/', css], ['/*__ENGINE__*/', `/*\n${license}\n*/\n${engine}`], ['/*__GAME__*/', game],
  ]) {
    if (!html.includes(token)) throw new Error(`Template token missing: ${token}`);
    html = html.replace(token, () => content.replace(/<\/script/gi, '<\\/script'));
  }
  const preview = path.join(versionRoot, 'builds/preview.html');
  await fs.mkdir(path.dirname(preview), { recursive: true });
  await fs.writeFile(preview, html);
  const outputs = [preview];
  if (offline) {
    const target = path.join(root, 'versions', `${manifest.projectId}_${manifest.activeVersion}-offline.html`);
    await fs.writeFile(target, html);
    outputs.push(target);
  }
  const report = {
    projectId: manifest.projectId, version: manifest.activeVersion,
    outputs: outputs.map(file => ({ path: path.relative(root, file).replaceAll('\\', '/'), bytes: Buffer.byteLength(html), sha256: hash(html) })),
    engineVersion: lock.version,
    runtimeBytes: { engine: Buffer.byteLength(engine), game: Buffer.byteLength(game), css: Buffer.byteLength(css) },
    externalRuntimeRequests: 0, sdk: null,
  };
  const reportName = offline ? 'build-manifest.json' : 'preview-manifest.json';
  await fs.writeFile(path.join(versionRoot, 'dev-support', reportName), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildGame(process.argv.includes('--offline')), null, 2));
}
