import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { root } from './build.mjs';

// Preview uses the same layout and DOM compositor as the game, including sockets.
const result = await build({ stdin: { contents: `
  import { enemyCatalog } from './versions/0.1.0/src/enemies/enemy';
  import { createEnemyVisualLayout } from './versions/0.1.0/src/enemies/visual-info';
  import { createEnemyIcon } from './versions/0.1.0/src/presentation/enemy-visual';
  for (const info of enemyCatalog) {
    const card = document.createElement('article'); card.dataset.typeId = info.typeId;
    const title = document.createElement('h2'); title.textContent = info.Name;
    card.append(title, createEnemyIcon(createEnemyVisualLayout(info)));
    document.querySelector('main').append(card);
  }
  document.body.dataset.ready = 'true';
`, resolveDir: root }, bundle: true, write: false, format: 'iife', target: 'es2022', minify: true,
  loader: { '.jpg': 'dataurl', '.png': 'dataurl' },
  plugins: [{ name: 'unused-pixi', setup(b) {
    b.onResolve({ filter: /^pixi\.js$/ }, () => ({ path: 'pixi.js', namespace: 'preview-pixi' }));
    b.onLoad({ filter: /.*/, namespace: 'preview-pixi' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
  } }],
});
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Четыре модульные камеры</title>
<style>body{margin:0;background:#121f30;color:#eaf2ff;font:18px Arial}h1{font-size:24px;margin:24px 32px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin:0 24px}article{text-align:center;padding:16px 10px;border:1px solid #344760;border-radius:12px}h2{font-size:18px;margin:0 0 24px}.enemy-visual{position:relative;display:inline-block;height:491px}.enemy-visual img{position:absolute}p{margin:20px 32px;color:#b4c2d5}</style>
<h1>Модульные наземные стрелки</h1><main></main><p>Камера + модуль ножек · общие точки крепления · исходная прозрачность</p>
<script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></html>`;
const target = path.join(root, 'versions/0.1.0/builds/camera-catalog.html');
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.writeFile(target, html);
console.log(target);
