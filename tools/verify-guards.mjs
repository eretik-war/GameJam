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
    for (const step of ['intro','fight-1','fight-2','interlude','fight-2-repeat','outro']) {
      await stable(); assert.equal(await evaluate("document.querySelector('#app').dataset.step"),step);
      if (step === 'outro') {
        await key('Enter');
        assert.equal(await evaluate("document.querySelector('.cutscene-text').textContent"),'Что же мне делать теперь');
        await key('Enter');
        assert.equal(await evaluate("document.querySelector('#app').dataset.step"),'outro');
        await screenshot('campaign-choice.png');
        if (process.argv.includes('--restart')) {
          await evaluate("window.restartDocument = document; document.querySelector('[data-choice=restart]').click()");
          assert.equal(await evaluate("document.querySelector('.scene-transition').hidden"),false);
          await stable();
          assert.equal(await evaluate("window.restartDocument === document"),true);
          await until(()=>evaluate("document.querySelector('#app')?.dataset.ready === 'true' && document.querySelector('#app').dataset.step === 'intro'"));
          assert.equal(await evaluate("document.querySelectorAll('.inventory-slot[data-item-id]').length"),0);
          continue;
        }
        await evaluate("document.querySelector('[data-choice=continue]').click()"); await stable();
        assert.equal(await evaluate("document.querySelector('#app').dataset.step"),'finale');
        assert.equal(await evaluate("document.querySelector('.cutscene-dialog').hidden"),true);
        await screenshot('campaign-finale.png');
        continue;
      }
      if (['intro','interlude'].includes(step)) {
        assert.match(await evaluate("document.querySelector('.cutscene-hint').textContent"),/^1/);
        await key('Enter'); await key('Enter');
        assert.match(await evaluate("document.querySelector('.cutscene-hint').textContent"),/^3/);
        assert.equal(await evaluate("document.querySelector('#app').dataset.step"),step);
        if(step==='intro')await screenshot('campaign-intro.png');
        await key('Enter');
        assert.equal(await evaluate("document.querySelector('.scene-transition').hidden"),false);
        await stable();
      } else {
        if(step==='fight-1') {
          await key('KeyD'); await evaluate("document.querySelector('#open-cutscene').click()"); await stable();
          await key('KeyD'); assert.equal(await evaluate("document.querySelector('.cutscene .debug').hidden"),false);
          await evaluate("document.querySelector('.cutscene .debug button').click()");await stable();
          assert.equal(await evaluate("document.querySelector('#app').dataset.step"),step);
        }
        if(step==='fight-2')await screenshot('guards-tracks.png');
        if(step==='fight-1') {
          await screenshot('guards-chair-intact.png');
          const before = await evaluate("document.querySelector('#turn').textContent");
          await click(678,190);
          assert.equal(await evaluate("document.querySelector('#turn').textContent"),before);
          for(let hit=0;hit<6;hit++) await click(678,490);
          await screenshot('guards-chair-broken.png');
          await evaluate("document.querySelector('#save').click()");
          const snapshot = await evaluate("JSON.parse(localStorage.getItem('gamejam.enemies.v2'))");
          const guard = snapshot.enemies.find(e=>e.typeId==='enemy.guard.chair');
          assert.ok(guard.Parameters.find(p=>p.Type==='shield').Value <= 3);assert.ok([-1,1].includes(guard.guardRecoveryTurns));
          await click(678,190);
          assert.notEqual(await evaluate("document.querySelector('#turn').textContent"),before);
        }
        combat: for(let round=0;round<30;round++) for(const [x,y] of [[678,190],[678,490],[960,190],[960,490]]){await click(x,y);if(await evaluate("document.querySelector('#reward-dialog').open"))break combat;}
        await screenshot('campaign-combat-check.png'); console.log(step,await evaluate("document.querySelector('#turn').textContent")); await until(()=>evaluate("document.querySelector('#reward-dialog').open"));
        const count=await evaluate("document.querySelectorAll('.inventory-slot[data-item-id]').length");
        await evaluate("document.querySelector('.reward-option').click()");
        assert.equal(await evaluate("document.querySelectorAll('.inventory-slot[data-item-id]').length"),count+1);
        await pause(2200);assert.equal(await evaluate("document.querySelector('#app').dataset.step"),step);
        assert.equal(await evaluate("document.querySelector('.scene-transition').hidden"),true);
        await until(()=>evaluate("!document.querySelector('.scene-transition').hidden"));await stable();
      }
    }
    if (process.argv.includes('--restart')) continue;
    assert.equal(await evaluate("document.querySelector('.cutscene').style.backgroundImage.includes('data:image/png')"),true);
    await key('Enter'); await key('KeyD');
    assert.equal(await evaluate("document.querySelector('#app').dataset.step"),'finale');
  }
  assert.equal(errors.length,0);console.log('Guards: taunt blocked air target, shield broke, air target unlocked; route passed HTTP/file');
} finally {ws?.close();chrome.kill();server.kill();}


