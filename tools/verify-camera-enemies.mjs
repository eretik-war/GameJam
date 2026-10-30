import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { root } from './build.mjs';

const out = path.join(root, 'versions/0.1.0/builds');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function until(fn, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { try { const value = await fn(); if (value) return value; } catch {} await pause(100); }
  throw new Error('Browser verification timed out');
}
await fs.mkdir(out, { recursive: true });
const profile = await fs.mkdtemp(path.join(root, 'work/camera-chrome-'));
const browserPort = await freePort(), httpPort = await freePort();
const server = spawn(process.execPath, ['tools/dev-server.mjs'], { cwd: root, env: { ...process.env, GAMEJAM_PORT: String(httpPort) }, stdio: 'ignore', windowsHide: true });
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
let ws;
try {
  await until(async () => (await fetch(`http://127.0.0.1:${httpPort}/`)).ok);
  await until(async () => (await fetch(`http://127.0.0.1:${browserPort}/json/version`)).ok);
  const target = await (await fetch(`http://127.0.0.1:${browserPort}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 0; const pending = new Map(), errors = [], requests = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  const resize = (width, height) => call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const navigate = async (url, ready) => {
    await call('Page.navigate', { url });
    try { await until(() => evaluate(`location.href === ${JSON.stringify(url)} && (${ready})`)); }
    catch (error) { console.error(JSON.stringify({ url, errors, page: await evaluate('({url:location.href, text:document.body.innerText, images:[...document.images].map(i=>({complete:i.complete,width:i.naturalWidth}))})') })); throw error; }
    await pause(300);
  };
  const screenshot = async (name, clip) => {
    const shot = await call('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    await fs.writeFile(path.join(out, name), Buffer.from(shot.data, 'base64'));
  };
  const click = async (x, y) => {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const clickId = async id => {
    const r = await evaluate(`document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().toJSON()`);
    await click(r.x + r.width / 2, r.y + r.height / 2);
  };
  const parameter = type => evaluate(`document.querySelector('[data-parameter="${type}"]').textContent`);

  await resize(1280, 740);
  await navigate(pathToFileURL(path.join(out, 'camera-catalog.html')).href, `document.body.dataset.ready === 'true' && [...document.images].every(i => i.complete && i.naturalWidth > 0)`);
  assert.equal(await evaluate('document.querySelectorAll("article").length'), 4);
  await screenshot('camera-catalog.png');
  const cards = await evaluate('[...document.querySelectorAll("article")].map(e => ({typeId:e.dataset.typeId,rect:e.getBoundingClientRect().toJSON()}))');
  for (const card of cards) await screenshot(`${card.typeId.replaceAll('.', '-')}.png`, card.rect);

  const modes = [
    ['http', `http://127.0.0.1:${httpPort}/`],
    ['file', pathToFileURL(path.join(root, 'versions/gamejam_0.1.0-offline.html')).href],
  ];
  for (const [mode, url] of modes) {
    await resize(1440, 900);
    await navigate(url, `document.querySelector('#app')?.dataset.ready === 'true' && [...document.images].every(i => i.complete && i.naturalWidth > 0)`);
    assert.match(await parameter('enemy-layer'), /Наземный/);
    await screenshot(`camera-scene-${mode}-1440.png`);
    let scene = await evaluate('document.querySelector("#scene canvas").getBoundingClientRect().toJSON()');
    // Select the lower-left enemy at the leg, then the camera of the lower-right one.
    await click(scene.x + scene.width * .53, scene.y + scene.height * .75 + 12);
    assert.match(await evaluate('document.querySelector("#parameters h2").textContent'), /enemy-4/);
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    await clickId('restore');
    assert.match(await parameter('health'), /26/); assert.match(await parameter('shield'), /0/);
    await clickId('burn'); await clickId('end-turn');
    assert.match(await parameter('health'), /23/);
    await clickId('save');
    const save = await evaluate('localStorage.getItem("gamejam.enemies.v2")');
    const data = JSON.parse(save);
    assert.equal(data.enemies.length, 3);
    assert.deepEqual(data.enemies.map(e => e.spawnPointId), ['spawn-3', 'spawn-4', 'spawn-5']);
    await clickId('restore'); await clickId('load');
    assert.equal(await evaluate('localStorage.getItem("gamejam.enemies.v2")'), save);
    assert.match(await parameter('health'), /23/);
    await resize(1280, 720); await pause(250);
    scene = await evaluate('document.querySelector("#scene canvas").getBoundingClientRect().toJSON()');
    await click(scene.x + scene.width * .75, scene.y + scene.height * .75 - 150);
    assert.match(await evaluate('document.querySelector("#parameters h2").textContent'), /enemy-5/);
    await pause(650);
    assert.equal(await evaluate('document.querySelector(".hover-card")?.hidden'), false);
    assert.match(await evaluate('document.querySelector(".hover-card").textContent'), /Наземный/);
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await pause(150);
    await screenshot(`camera-scene-${mode}-1280.png`);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    // The fourth registered variant must render through the normal save/catalog path too.
    data.enemies[0].typeId = 'enemy.camera.gold';
    await evaluate(`localStorage.setItem('gamejam.enemies.v2', ${JSON.stringify(JSON.stringify(data))})`);
    await clickId('load'); await pause(200);
    await screenshot(`camera-gold-${mode}.png`);
    await clickId('end-turn'); await clickId('end-turn');
    await click(scene.x + scene.width * .53, scene.y + scene.height * .75 + 12);
    assert.equal(await evaluate('document.querySelector("[data-parameter=burning]") === null'), true);
    console.log(`${mode}: selection at camera/leg, damage, statuses, hover, all variants, save/load and desktop resize passed`);
  }
  assert.deepEqual(errors, []);
  const external = requests.filter(url => /^https?:/.test(url) && !url.startsWith(`http://127.0.0.1:${httpPort}/`));
  assert.deepEqual(external, []);
  const report = { checkedAt: new Date().toISOString(), browser: 'Chrome headless / SwiftShader', desktop: ['1440x900', '1280x720'], modes: ['HTTP', 'file://'], pageErrors: errors.length, externalRequests: external.length, variants: 4 };
  await fs.writeFile(path.join(out, 'camera-browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await call('Browser.close').catch(() => {});
} finally { ws?.close(); chrome.kill(); server.kill(); }
