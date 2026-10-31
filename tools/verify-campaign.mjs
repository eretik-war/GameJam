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
const scratch = process.env.TMPDIR ?? path.join(root, 'work');
await fs.mkdir(scratch, { recursive: true });
const profile = await fs.mkdtemp(path.join(scratch, 'gamejam-chain-chrome-'));
const route = JSON.parse(await fs.readFile(path.join(root, 'assets/campaigns/main.json'), 'utf8')).steps;
const spawnPoints = JSON.parse(await fs.readFile(path.join(root, 'assets/enemies/spawn-points.json'), 'utf8'));
const enemyTypes = [JSON.parse(await fs.readFile(path.join(root, 'assets/enemies/test-enemy.json'), 'utf8')),
  ...JSON.parse(await fs.readFile(path.join(root, 'assets/enemies/camera-enemies.json'), 'utf8'))];
assert.deepEqual(route.filter(step => step.type === 'battle').map(step => step.id),
  Array.from({ length: 9 }, (_, i) => `fight-${i + 1}`));
assert.equal(route[0].type, 'battle');
const results = [];
const browserPort = await freePort(), httpPort = await freePort();
const server = spawn(process.execPath, ['tools/dev-server.mjs'], { cwd: root, env: { ...process.env, GAMEJAM_PORT: String(httpPort) }, stdio: 'ignore', windowsHide: true });
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
let ws;
try {
  await until(async () => (await fetch(`http://127.0.0.1:${httpPort}/`, { signal: AbortSignal.timeout(5000) })).ok);
  await until(async () => (await fetch(`http://127.0.0.1:${browserPort}/json/version`, { signal: AbortSignal.timeout(5000) })).ok);
  const target = await (await fetch(`http://127.0.0.1:${browserPort}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(5000) })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 0; const pending = new Map(), errors = [], requests = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('close', () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Browser connection closed')); }
    pending.clear();
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  console.log('Browser connected');
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
  const click = async (x,y) => {await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
  const stable = () => until(()=>evaluate("document.querySelector('.scene-transition').hidden"));
  const dismissBattleDialogue = async () => {
    for (let i = 0; i < 3; i++) {
      if (!await evaluate("!!document.querySelector('.battle-message[data-kind=intro]')")) break;
      await click(40, 150);
    }
    assert.equal(await evaluate("!!document.querySelector('.battle-message[data-kind=intro]')"), false);
  };
  const snapshot = () => evaluate("(() => {document.querySelector('#save').click(); return JSON.parse(localStorage.getItem('gamejam.enemies.v2'));})()");
  for (const url of ['http://127.0.0.1:'+httpPort+'/',pathToFileURL(path.join(root,'versions/gamejam_0.1.0-offline.html')).href]) {
    console.log('Checking ' + url);
    await resize(1280,720); await navigate(url,"document.querySelector('#app')?.dataset.ready === 'true'");
    const checked = [];
    for (const { id: step } of route.filter(entry => entry.id !== 'finale')) {
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
          await until(()=>evaluate("document.querySelector('#app')?.dataset.ready === 'true' && document.querySelector('#app').dataset.step === 'fight-1'"));
          assert.equal(await evaluate("document.querySelectorAll('.inventory-slot[data-item-id]').length"),0);
          await dismissBattleDialogue();
          const restarted = await snapshot();
          assert.equal(restarted.enemies.length, 1);
          assert.equal(restarted.hero.Parameters.find(p => p.Type === 'health').Value, 1000);
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
        await dismissBattleDialogue();
        const roster = await snapshot();
        const ordinal = checked.length + 1;
        assert.equal(roster.enemies.length, Math.min(ordinal, 3));
        assert.equal(new Set(roster.enemies.map(e => e.spawnPointId)).size, roster.enemies.length);
        for (const enemy of roster.enemies) {
          assert.ok(enemy.id.startsWith(step + '-'));
          const type = enemyTypes.find(type => type.typeId === enemy.typeId);
          const point = spawnPoints.find(point => point.id === enemy.spawnPointId);
          assert.ok(type && point && type.placement.value === point.placement.value);
        }
        checked.push({ step, count: roster.enemies.length, types: roster.enemies.map(e => e.typeId) });
        if(step==='fight-1') {
          await key('KeyD'); await evaluate("document.querySelector('#open-cutscene').click()"); await stable();
          await key('KeyD'); assert.equal(await evaluate("document.querySelector('.cutscene .debug').hidden"),false);
          await evaluate("document.querySelector('.cutscene .debug button').click()");await stable();
          assert.equal(await evaluate("document.querySelector('#app').dataset.step"),step);
          assert.deepEqual(await snapshot(), roster);
        }
        if(step==='fight-2')await screenshot('campaign-battle-2.png');
        if(step==='fight-3')await screenshot('campaign-battle-3.png');
        // Click each real deployment from front to back, including the third ground slot.
        const bounds = await evaluate("(() => {const r = document.querySelector('#scene canvas').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
        const points = roster.enemies.map(enemy => spawnPoints.find(point => point.id === enemy.spawnPointId))
          .sort((a,b) => a.x - b.x || a.y - b.y);
        combat: for(const point of points) for(let i=0;i<80;i++){
          await click(bounds.x + bounds.width * point.x, bounds.y + bounds.height * point.y - 10);
          const state = await evaluate(`(() => {
            if (document.querySelector('#reward-dialog').open) return { reward: true };
            document.querySelector('#save').click();
            const enemy = JSON.parse(localStorage.getItem('gamejam.enemies.v2')).enemies.find(e => e.spawnPointId === ${JSON.stringify(point.id)});
            return { reward: false, dead: enemy.Parameters.find(p => p.Type === 'health').Value === 0 };
          })()`);
          if (state.reward) break combat;
          if (state.dead) break;
        }
        console.log(step + ': ' + roster.enemies.length + ' enemies, combat passed');
        assert.equal(await evaluate("document.querySelector('#reward-dialog').open"), true,
          step + ': reward missing after real attacks; ' + await evaluate("document.querySelector('#turn').textContent"));
        const count=await evaluate("document.querySelectorAll('.inventory-slot[data-item-id]').length");
        // Observe the full delay/fade on the browser clock: CDP round trips under
        // software WebGL rendering may take longer than the timing assertion itself.
        const timing = await evaluate(`new Promise((resolve, reject) => {
          const layer = document.querySelector('.scene-transition');
          const app = document.querySelector('#app');
          const timing = { chosen: performance.now(), fade: null, switched: null, finished: null, rewardCount: null };
          const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Reward transition did not finish')); }, 15000);
          const observer = new MutationObserver(() => {
            const now = performance.now();
            if (!layer.hidden && timing.fade === null) timing.fade = now;
            if (app.dataset.step !== ${JSON.stringify(step)} && timing.switched === null) timing.switched = now;
            if (layer.hidden && timing.fade !== null) {
              timing.finished = now;
              observer.disconnect(); clearTimeout(timeout); resolve(timing);
            }
          });
          observer.observe(layer, { attributes: true, attributeFilter: ['hidden'] });
          observer.observe(app, { attributes: true, attributeFilter: ['data-step'] });
          document.querySelector('.reward-option').click();
          timing.rewardCount = document.querySelectorAll('.inventory-slot[data-item-id]').length;
        })`);
        assert.equal(timing.rewardCount, count + 1);
        assert.ok(timing.fade - timing.chosen >= 2950, JSON.stringify(timing));
        assert.ok(timing.switched - timing.fade >= 350, JSON.stringify(timing));
        assert.ok(timing.finished - timing.fade >= 700, JSON.stringify(timing));
        checked.at(-1).rewardTiming = timing;
      }
    }
    assert.deepEqual(checked.map(battle => battle.count), [1,2,3,3,3,3,3,3,3]);
    results.push({ mode: url.startsWith('file:') ? 'file' : 'HTTP', battles: checked });
    if (process.argv.includes('--restart')) continue;
    assert.equal(await evaluate("document.querySelector('.cutscene').style.backgroundImage.includes('data:image/png')"),true);
    await key('Enter'); await key('KeyD');
    assert.equal(await evaluate("document.querySelector('#app').dataset.step"),'finale');
  }
  assert.equal(errors.length,0);
  const report = { branch: process.argv.includes('--restart') ? 'restart' : 'continue', runtimeErrors: errors.length, results };
  await fs.writeFile(path.join(out, `campaign-chain-${report.branch}.json`), JSON.stringify(report, null, 2));
  console.log('Campaign: 9 battles, random catalog rosters, 1→2→3 cap, rewards, fades and ' + report.branch + ' passed HTTP/file');
} finally {ws?.close();chrome.kill();server.kill();}
