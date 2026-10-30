import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { root } from './build.mjs';

const out = path.join(root, 'versions/0.1.0/builds');
const requireItemIcons = process.argv.includes('--with-item-icons');
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
  const clickSelector = async selector => {
    const r = await evaluate(`{ const e=document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'nearest'}); e.getBoundingClientRect().toJSON(); }`);
    await click(r.x + r.width / 2, r.y + r.height / 2);
  };
  const escape = async () => {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  };
  const clickId = async id => { await escape(); return clickSelector(`#${id}`); };
  const parameter = type => evaluate(`document.querySelector('[data-parameter="${type}"]').textContent`);
  const sceneBounds = async () => {
    await evaluate('document.getElementById("scene").scrollIntoView({block:"start"})');
    return evaluate('document.querySelector("#scene canvas").getBoundingClientRect().toJSON()');
  };
  const applyEffect = async random => {
    await evaluate(`globalThis.__qaRandom = Math.random; Math.random = () => ${random}`);
    try { await clickId('burn'); } finally { await evaluate('Math.random = globalThis.__qaRandom; delete globalThis.__qaRandom'); }
  };
  const geometry = () => evaluate(`({rects:[...document.querySelectorAll('#scene,#scene canvas,.debug')].map(e=>e.getBoundingClientRect().toJSON()), width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,scrollX,scrollY})`);

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
    // The latest shared UI hides debug until D; exercise it without changing the product default.
    if (await evaluate('document.querySelector(".debug").hidden')) {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
      assert.equal(await evaluate('document.querySelector(".debug").hidden'), false);
    }
    const initialGeometry = await geometry();
    await clickId('phase-action');
    assert.equal(await evaluate('document.getElementById("reward-dialog").open'), true);
    assert.deepEqual(await geometry(), initialGeometry);
    assert.equal(await evaluate('new Set([...document.querySelectorAll(".reward-option")].map(e=>e.dataset.typeId)).size'), 3);
    if (requireItemIcons) {
      await until(() => evaluate('[...document.querySelectorAll(".reward-option img.item-icon")].filter(i=>i.complete && i.naturalWidth===128 && i.naturalHeight===128).length === 3'));
    }
    await clickSelector('.reward-option');
    assert.equal(await evaluate('document.getElementById("storage-panel").hidden'), false);
    assert.deepEqual(await geometry(), initialGeometry);
    await screenshot(`camera-inventory-${mode}.png`);
    await clickSelector('#storage-slots [data-item-id]'); await clickSelector('#equipment-slots [data-index="0"]');
    assert.equal(await evaluate('document.querySelectorAll("#equipment-slots [data-item-id]").length'), 1);
    if (requireItemIcons) assert.equal(await evaluate('document.querySelector("#equipment-slots img.item-icon").naturalWidth'), 128);
    await clickId('phase-action');
    assert.equal(await evaluate('document.getElementById("storage-panel").hidden'), true);
    assert.deepEqual(await geometry(), initialGeometry);
    let scene = await sceneBounds();
    // Select the lower-left enemy at the leg, then the camera of the lower-right one.
    await click(scene.x + scene.width * .53, scene.y + scene.height * .75 + 12);
    assert.match(await evaluate('document.querySelector("#parameters h2").textContent'), /enemy-4/);
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    await clickId('restore');
    assert.match(await parameter('health'), /26/); assert.match(await parameter('shield'), /0/);
    await applyEffect(0); await clickId('end-turn');
    assert.match(await parameter('health'), /23/);
    await applyEffect(.3); await applyEffect(.6); await applyEffect(.9);
    for (const effect of ['burning','blindness','stun','regeneration']) assert.ok(await parameter(effect));
    await clickId('save');
    const save = await evaluate('localStorage.getItem("gamejam.enemies.v2")');
    const data = JSON.parse(save);
    assert.equal(data.enemies.length, 3);
    assert.deepEqual(data.enemies.map(e => e.spawnPointId), ['spawn-3', 'spawn-4', 'spawn-5']);
    assert.equal(data.enemies.find(e=>e.id==='enemy-4').statuses.length, 4);
    await clickId('restore'); await clickId('load');
    assert.equal(await evaluate('localStorage.getItem("gamejam.enemies.v2")'), save);
    assert.match(await parameter('health'), /23/);
    await resize(1280, 720); await pause(250);
    scene = await sceneBounds();
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
    scene = await sceneBounds();
    await click(scene.x + scene.width * .91, scene.y + scene.height * .50 - 140);
    assert.match(await evaluate('document.querySelector("#parameters h2").textContent'), /Жёлтая камера/);
    await escape();
    await screenshot(`camera-gold-${mode}.png`);
    await clickId('end-turn'); await clickId('end-turn');
    scene = await sceneBounds();
    await click(scene.x + scene.width * .53, scene.y + scene.height * .75 + 12);
    assert.equal(await evaluate('document.querySelector("[data-parameter=burning]") === null'), true);
    console.log(`${mode}: modular NPCs, all four statuses, inventory overlay/reward/equipment without scene shifts, save/load and desktop resize passed`);
  }
  assert.deepEqual(errors, []);
  const external = requests.filter(url => /^https?:/.test(url) && !url.startsWith(`http://127.0.0.1:${httpPort}/`));
  assert.deepEqual(external, []);
  const report = { checkedAt: new Date().toISOString(), browser: 'Chrome headless / SwiftShader', desktop: ['1440x900', '1280x720'], modes: ['HTTP', 'file://'], pageErrors: errors.length, externalRequests: external.length, variants: 4, statusTypes: 4, inventoryOverlayGeometryUnchanged: true, itemIconsInSameBuild: requireItemIcons };
  await fs.writeFile(path.join(out, 'camera-browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await call('Browser.close').catch(() => {});
} finally { ws?.close(); chrome.kill(); server.kill(); }
