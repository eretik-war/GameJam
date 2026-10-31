import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { root } from './build.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function until(fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await fn()) return; await pause(50); }
  throw new Error('Dialogue browser verification timed out');
}
const out = path.join(root, 'versions/0.1.0/builds');
const scratch = process.env.GAMEJAM_QA_SCRATCH || os.tmpdir();
await fs.mkdir(scratch, { recursive: true }); await fs.mkdir(out, { recursive: true });
const profile = await fs.mkdtemp(path.join(scratch, 'gamejam-dialogue-chrome-'));
const browserPort = await freePort(), httpPort = await freePort();
const server = spawn(process.execPath, ['tools/dev-server.mjs'], { cwd: root, env: { ...process.env, GAMEJAM_PORT: String(httpPort) }, stdio: 'ignore', windowsHide: true });
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
let ws;
const evidence = [];
try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${httpPort}/`)).ok; } catch { return false; } });
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${browserPort}/json/version`)).ok; } catch { return false; } });
  const target = await (await fetch(`http://127.0.0.1:${browserPort}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 0; const pending = new Map(), errors = [], requests = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const task = pending.get(message.id); if (!task) return; pending.delete(message.id); clearTimeout(task.timer); if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  });
  ws.addEventListener('close', () => {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('QA browser disconnected')); }
    pending.clear();
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const key = async code => { await call('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code === 'KeyD' ? 'd' : 'Enter' }); await call('Input.dispatchKeyEvent', { type: 'keyUp', code }); };
  const click = async (x, y, button = 'left') => { await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 }); };
  const stable = () => until(() => evaluate("document.querySelector('.scene-transition').hidden"));
  const read = () => evaluate(`({step:document.querySelector('#app').dataset.step, turn:document.querySelector('#turn').textContent,
    messages:[...document.querySelectorAll('.battle-message')].map(e=>{const r=e.getBoundingClientRect();return {kind:e.dataset.kind,speaker:e.dataset.speakerId,name:e.querySelector('.battle-message-name').textContent,text:e.querySelector('.battle-message-text').textContent,index:e.dataset.index,opacity:+getComputedStyle(e).opacity,x:r.x,y:r.y,width:r.width,height:r.height};}),
    canvas:(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})(),
    scroll:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight})`);
  const shot = async name => { const r = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, name), Buffer.from(r.data, 'base64')); };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  // Deterministic misses/status rolls keep lifetime checks independent of combat RNG.
  await call('Page.addScriptToEvaluateOnNewDocument', { source: 'Math.random = () => 0.99;' });
  for (const [mode, url] of [['http', `http://127.0.0.1:${httpPort}/`], ['file', pathToFileURL(path.join(root, 'versions/gamejam_0.1.0-offline.html')).href]]) {
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    const firstRequest = requests.length;
    await call('Page.navigate', { url });
    try { await until(() => evaluate("document.querySelector('#app')?.dataset.ready === 'true'"), 60000); }
    catch (error) {
      console.error('Startup diagnostic', { mode, url, errors, page: await evaluate("({step:document.querySelector('#app')?.dataset.step,ready:document.querySelector('#app')?.dataset.ready,status:document.querySelector('#status')?.textContent,body:document.body.innerText.slice(0,600)})") });
      throw error;
    }
    await stable();
    if ((await read()).step === 'intro') {
      assert.equal((await read()).messages.length, 0, 'Battle bubbles must not replace the existing campaign cutscene');
      await key('Enter'); await key('Enter'); await key('Enter'); await stable();
    }
    console.log(`${mode}: battle ready; checking intro and desktop resize`);
    const first = await read();
    assert.equal(first.step, 'fight-1');
    assert.equal(first.messages.length, 1, 'First battle must show a dialogue bubble');
    assert.equal(first.messages[0].kind, 'intro');
    assert.match(first.messages[0].name, /^(Бирюзовый|Розовый|Голубой|Жёлтый) младший брат$/);
    assert.match(first.messages[0].text, /старший брат/i);
    const turn = first.turn, canvas = first.canvas;
    await shot(`battle-dialogue-${mode}-npc.png`);
    await click(678, 490, 'right');
    assert.equal((await read()).messages[0].index, '1');
    await click(678, 490);
    const second = await read();
    assert.equal(second.messages.length, 1); assert.equal(second.messages[0].name, 'Герой'); assert.equal(second.turn, turn);
    await shot(`battle-dialogue-${mode}-hero.png`);
    await click(678, 490);
    assert.equal((await read()).messages[0].index, '3'); assert.equal((await read()).turn, turn);
    // Resize the persistent intro, not an expiring hit bubble. CDP/OS latency
    // must not be mistaken for broken placement or premature disappearance.
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await pause(150);
    const resized = await read(); assert.equal(resized.messages.length, 1); assert.equal(resized.scroll, false);
    for (const m of resized.messages) assert.ok(m.x >= 0 && m.y >= 0 && m.x + m.width <= 1440 && m.y + m.height <= 900);
    await shot(`battle-dialogue-${mode}-1440.png`);
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }); await pause(150);
    await click(678, 490);
    assert.equal((await read()).messages.length, 0); assert.equal((await read()).turn, turn, 'Closing click must not attack');
    // Observe the real renderer from the browser's own monotonic clock. Samples
    // run on each animation frame, including frames whose opacity stays at 1.
    await evaluate(`(() => {
      const life = { started: 0, lastOpaque: 0, fade: null, removed: 0 };
      window.__hitLifetime = life;
      life.done = new Promise(resolve => {
        const sample = () => {
          const node = document.querySelector('.battle-message[data-kind=hit]');
          const now = performance.now();
          if (node) {
            if (!life.started) life.started = now;
            const opacity = +getComputedStyle(node).opacity, at = now - life.started;
            if (opacity === 1) life.lastOpaque = at;
            else if (opacity > 0 && opacity < 1 && (!life.fade || Math.abs(opacity - 0.5) < Math.abs(life.fade.opacity - 0.5))) life.fade = { at, opacity };
          } else if (life.started) {
            life.removed = now - life.started;
            cancelAnimationFrame(frame); clearTimeout(timer);
            resolve({ lastOpaque: life.lastOpaque, fade: life.fade, removed: life.removed });
            return;
          }
          frame = requestAnimationFrame(sample);
        };
        let frame = requestAnimationFrame(sample);
        const timer = setTimeout(() => { cancelAnimationFrame(frame); resolve({ timeout: true }); }, 8000);
      });
      return true;
    })()`);
    await click(678, 490);
    const hit = await read();
    assert.equal(hit.messages.length, 1); assert.equal(hit.messages[0].kind, 'hit'); assert.equal(hit.messages[0].name, first.messages[0].name);
    assert.match(hit.messages[0].text, /не бей нас, старший брат/i);
    assert.notEqual(hit.turn, turn); assert.deepEqual(hit.canvas, canvas);
    // Hit bubbles must not intercept or respond to scene clicks. The actual
    // scene hit-test above uses native mouse input; this check runs atomically.
    assert.equal(await evaluate(`(() => {
      document.querySelector('#scene').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
      return document.querySelectorAll('.battle-message[data-kind=hit]').length;
    })()`), 1);
    console.log(`${mode}: observing hit lifetime in the browser`);
    const lifetime = await evaluate('window.__hitLifetime.done');
    console.log(`${mode}: lifetime`, lifetime);
    assert.equal(lifetime.timeout, undefined);
    assert.ok(lifetime.lastOpaque >= 1750, JSON.stringify(lifetime));
    assert.ok(lifetime.fade && lifetime.fade.opacity > 0 && lifetime.fade.opacity < 1, JSON.stringify(lifetime));
    assert.ok(lifetime.fade.at >= 1950 && lifetime.fade.at < 3300, JSON.stringify(lifetime));
    assert.ok(lifetime.removed >= 2800 && lifetime.removed < 4500, JSON.stringify(lifetime));
    const faded = { ...hit, messages: [{ ...hit.messages[0], opacity: lifetime.fade.opacity }] };
    assert.equal((await read()).messages.length, 0);
    // Damage/save/load in one browser turn proves replacement clears a live
    // bubble, rather than merely checking an already-expired one.
    console.log(`${mode}: checking snapshot replacement and next encounter`);
    await key('KeyD');
    const loading = await evaluate(`(() => {
      document.querySelector('#restore').click();
      const before = document.querySelectorAll('.battle-message[data-kind=hit]').length;
      document.querySelector('#save').click(); document.querySelector('#load').click();
      return { before, after: document.querySelectorAll('.battle-message').length };
    })()`);
    assert.deepEqual(loading, { before: 1, after: 0 });
    // The opening conversation belongs only to the first battle of a playthrough.
    await key('KeyD');
    for (const x of [678, 960]) for (let i = 0; i < 35; i++) { if (await evaluate("document.querySelector('#reward-dialog').open")) break; await click(x, 490); }
    await until(() => evaluate("document.querySelector('#reward-dialog').open"));
    await evaluate("document.querySelector('.reward-option').click()");
    await until(() => evaluate("document.querySelector('#app').dataset.step === 'fight-2'")); await stable();
    const next = await read();
    assert.equal(next.messages.length, 0, 'Second battle must not repeat the opening dialogue');
    await click(678, 490);
    const nextHit = await read();
    assert.notEqual(nextHit.turn, next.turn, 'Second battle allows attacking immediately');
    assert.equal(nextHit.messages.length, 1); assert.equal(nextHit.messages[0].kind, 'hit');
    assert.match(nextHit.messages[0].name, /младший брат$/);
    assert.notEqual(nextHit.messages[0].speaker, first.messages[0].speaker);
    if (mode === 'file') assert.equal(requests.slice(firstRequest).filter(u => /^https?:/.test(u)).length, 0, 'Offline game must make no HTTP requests');
    evidence.push({ mode, first, second, hit, faded, lifetime, resized, next, nextHit, runtimeErrors: errors.length });
    console.log(`${mode}: passed`);
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await fs.writeFile(path.join(out, 'battle-dialogue-verification.json'), JSON.stringify(evidence, null, 2));
  console.log('Battle dialogue: three lines, names, LMB-only, blocked attacks, hit lifetime/fade, resize, load, next encounter: HTTP/file passed; runtime errors 0');
} finally { ws?.close(); chrome.kill(); server.kill(); }
