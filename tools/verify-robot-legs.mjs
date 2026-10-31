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
  const setDebug = async visible => {
    if (await evaluate('document.querySelector(".debug").hidden') === !visible) return;
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
    assert.equal(await evaluate('document.querySelector(".debug").hidden'), !visible);
  };
  const clickId = async id => {
    await escape();
    await setDebug(await evaluate(`!!document.getElementById(${JSON.stringify(id)}).closest('.debug')`));
    return clickSelector(`#${id}`);
  };
  const parameter = type => evaluate(`document.querySelector('[data-parameter="${type}"]').textContent`);
  const sceneBounds = async () => {
    await setDebug(false);
    await evaluate('document.getElementById("scene").scrollIntoView({block:"start"})');
    return evaluate('document.querySelector("#scene canvas").getBoundingClientRect().toJSON()');
  };
  const applyEffect = async random => {
    await evaluate(`globalThis.__qaRandom = Math.random; Math.random = () => ${random}`);
    try { await clickId('burn'); } finally { await evaluate('Math.random = globalThis.__qaRandom; delete globalThis.__qaRandom'); }
  };
  const geometry = () => evaluate(`({rects:[...document.querySelectorAll('#scene,#scene canvas,.debug')].map(e=>e.getBoundingClientRect().toJSON()), width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,scrollX,scrollY})`);


  await resize(1440,900);
  await navigate(pathToFileURL(path.join(out,'camera-catalog.html')).href, "document.body.dataset.ready === 'true' && [...document.images].every(i=>i.complete && i.naturalWidth>0)");
  await evaluate("document.querySelectorAll('article').forEach(e=>{if(!e.dataset.typeId.startsWith('enemy.camera.') && e.dataset.typeId!=='enemy.trainee')e.remove()}); document.querySelector('main').style.gridTemplateColumns='repeat(4,minmax(0,1fr))'; document.querySelectorAll('.enemy-visual').forEach(e=>e.style.height='340px')");
  const cards=await evaluate('[...document.querySelectorAll("article")].filter(e=>e.dataset.typeId.startsWith("enemy.camera.") || e.dataset.typeId==="enemy.trainee").map(e=>({typeId:e.dataset.typeId,rect:e.getBoundingClientRect().toJSON()}))');
  assert.equal(cards.length,4);
  for(const card of cards) await screenshot('robot-legs-'+card.typeId+'.png',card.rect);
  await screenshot('robot-legs-catalog.png');
  assert.equal(errors.length,0);console.log('Four robot leg variants rendered with shared compositor');
} finally {ws?.close();chrome.kill();server.kill();}
