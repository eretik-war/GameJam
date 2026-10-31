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


  const key = code => call('Input.dispatchKeyEvent',{type:'keyDown',code,key:code==='KeyD'?'d':'Enter'}).then(()=>call('Input.dispatchKeyEvent',{type:'keyUp',code}));
  const click = async (x,y) => {await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
  const stable = () => until(()=>evaluate("document.querySelector('.scene-transition').hidden"));

  for (const url of ['http://127.0.0.1:'+httpPort+'/',pathToFileURL(path.join(root,'versions/gamejam_0.1.0-offline.html')).href]) {
    await resize(1280,720); await navigate(url,"document.querySelector('#app')?.dataset.ready === 'true'");
    await stable(); await key('Enter'); await key('Enter'); await key('Enter'); await stable();
    await until(()=>evaluate("document.querySelector('#app').dataset.step === 'fight-1'"));
    const before = await evaluate("document.querySelector('#turn').textContent");
    await evaluate("window.actions=[]; new MutationObserver(()=>{const a=document.querySelector('#app').dataset.combatActor;if(a && window.actions.at(-1)?.id!==a)window.actions.push({id:a,t:performance.now()});}).observe(document.querySelector('#app'),{attributes:true,attributeFilter:['data-combat-actor']})");
    await click(678,490);
    assert.equal(await evaluate("document.querySelector('#app').dataset.combatBusy"),'true');
    await click(678,490); // Repeated input must not enqueue another turn.
    await pause(50); await screenshot('combat-motion-'+(url.startsWith('http')?'http':'file')+'.png');
    await until(()=>evaluate("document.querySelector('#app').dataset.combatBusy === 'false'"));
    const actions=await evaluate('window.actions');
    assert.ok(actions.length>=2,JSON.stringify(actions));
    for(let i=1;i<actions.length;i++)assert.ok(actions[i].t-actions[i-1].t>=90 && actions[i].t-actions[i-1].t<350,JSON.stringify(actions));
    assert.notEqual(await evaluate("document.querySelector('#turn').textContent"),before);
    assert.equal(await evaluate("document.querySelector('.inventory-layout').inert"),false);
    console.log(url.startsWith('http')?'HTTP':'file',actions);
  }
  assert.equal(errors.length,0); console.log('Sequential combat passed; no runtime exceptions');
} finally {ws?.close();chrome.kill();server.kill();}
