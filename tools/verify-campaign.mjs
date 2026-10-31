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
  ...JSON.parse(await fs.readFile(path.join(root, 'assets/enemies/camera-enemies.json'), 'utf8')),
  ...JSON.parse(await fs.readFile(path.join(root, 'assets/enemies/healers.json'), 'utf8')),
  ...JSON.parse(await fs.readFile(path.join(root, 'assets/enemies/guards.json'), 'utf8')), ...JSON.parse(await fs.readFile(path.join(root, 'assets/enemies/bosses.json'), 'utf8'))];
const capacity = spawnPoints.filter(point => enemyTypes.some(type => type.placement.value === point.placement.value)).length;
assert.deepEqual(route.filter(step => step.type === 'battle').map(step => step.id),
  Array.from({ length: 9 }, (_, i) => i === 8 ? 'fight-2-repeat' : `fight-${i + 1}`));
assert.equal(route[0].type, 'cutscene');
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


  const key = code => call('Input.dispatchKeyEvent',{type:'keyDown',code,key:code==='KeyD'?'d':code==='Escape'?'Escape':'Enter'}).then(()=>call('Input.dispatchKeyEvent',{type:'keyUp',code}));
  const click = async (x,y) => {await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
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
          assert.equal(await evaluate("document.querySelector('.cutscene').hidden"), false);
          continue;
        }
        await evaluate("document.querySelector('[data-choice=continue]').click()"); await stable();
        assert.equal(await evaluate("document.querySelector('#app').dataset.step"),'finale');
        assert.equal(await evaluate("document.querySelector('.cutscene-dialog').hidden"),false);
        await screenshot('campaign-finale.png');
        continue;
      }
      if (['intro','memory-2','interlude'].includes(step)) {
        assert.match(await evaluate("document.querySelector('.cutscene-hint').textContent"),/^1/);
        if(step==='intro') { await key('Enter'); await pause(200); }
        for(let i=1;i<(step==='intro'?5:1);i++) await key('Enter');
        assert.match(await evaluate("document.querySelector('.cutscene-hint').textContent"),step==='intro'?/^5/:/^1/);
        assert.equal(await evaluate("document.querySelector('#app').dataset.step"),step);
        if(step==='intro')await screenshot('campaign-intro.png');
        await key('Enter');
        assert.equal(await evaluate("document.querySelector('.scene-transition').hidden"),false);
        await stable();
      } else {
        await dismissBattleDialogue();
        if (process.argv.includes('--sustain-hero')) {
          // Explicit route-only fixture: replenish HP between battles through the
          // existing validated debug loader, never changing enemy stats or combat rules.
          const refill = await snapshot();
          refill.hero.Parameters.find(p => p.Type === 'health').Value = 1000;
          await evaluate(`localStorage.setItem('gamejam.enemies.v2', ${JSON.stringify(JSON.stringify(refill))}); document.querySelector('#load').click()`);
        }
        const roster = await snapshot();
        const ordinal = checked.length + 1;
        assert.equal(roster.enemies.length, Math.min(ordinal, capacity));
        assert.equal(new Set(roster.enemies.map(e => e.spawnPointId)).size, roster.enemies.length);
        for (const enemy of roster.enemies) {
          assert.ok(enemy.id.startsWith(step + '-'));
          const type = enemyTypes.find(type => type.typeId === enemy.typeId);
          const point = spawnPoints.find(point => point.id === enemy.spawnPointId);
          assert.ok(type && point && type.placement.value === point.placement.value);
        }
        checked.push({ step, count: roster.enemies.length, types: roster.enemies.map(e => e.typeId), placements: roster.enemies.map(e => e.spawnPointId) });
        if(step==='fight-1') {
          await key('KeyD'); await evaluate("document.querySelector('#open-cutscene').click()"); await stable();
          await key('KeyD'); assert.equal(await evaluate("document.querySelector('.cutscene .debug').hidden"),false);
          await evaluate("document.querySelector('.cutscene .debug button').click()");await stable();
          assert.equal(await evaluate("document.querySelector('#app').dataset.step"),step);
          assert.deepEqual(await snapshot(), roster);
        }
        // Preview/debug panels must not intercept native combat clicks.
        if (!await evaluate("document.querySelector('.debug').hidden")) await key('KeyD');
        if(step==='fight-2')await screenshot('campaign-battle-2.png');
        if(step==='fight-3')await screenshot('campaign-battle-3.png');
        // Click each real deployment from front to back, including the third ground slot.
        const bounds = await evaluate("(() => {const r = document.querySelector('#scene canvas').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
        // Re-read the live roster after each native click: a broken guard may unlock
        // an earlier air target in the same column. Never exhaust dead/blocked targets.
        combat: for (let i = 0; i < 180; i++) {
          const current = await snapshot();
          const live = current.enemies.filter(enemy => enemy.Parameters.find(p => p.Type === 'health').Value > 0);
          const closest = Math.min(...live.map(enemy => spawnPoints.find(point => point.id === enemy.spawnPointId).x));
          const front = live.filter(enemy => spawnPoints.find(point => point.id === enemy.spawnPointId).x === closest);
          const guard = front.find(enemy => enemyTypes.find(type => type.typeId === enemy.typeId).role === 'guard' &&
            enemy.Parameters.find(p => p.Type === 'shield').Value > 0 && enemy.guardRecoveryTurns === 0);
          const target = guard ?? front[0];
          if (!target) break;
          const point = spawnPoints.find(point => point.id === target.spawnPointId);
          // A live tooltip may cover the next air target. Close it with the
          // supported Escape key rather than disabling overlays or changing CSS.
          if (await evaluate("!!document.querySelector('.hover-card:not([hidden])')")) await key('Escape');
          await click(bounds.x + bounds.width * point.x, bounds.y + bounds.height * point.y - 10);
          await until(() => evaluate("document.querySelector('#app').dataset.combatBusy !== 'true'"));
          if (await evaluate("document.querySelector('#reward-dialog').open")) break combat;
          const after = await snapshot();
          if (after.turn === current.turn) {
            console.error('Blocked native attack', JSON.stringify({step,target,point,current,
              dom:await evaluate(`({hit:document.elementFromPoint(${bounds.x + bounds.width * 0.53}, ${bounds.y + bounds.height * 0.30 - 10})?.outerHTML?.slice(0,300),debug:document.querySelector('.debug').hidden,status:document.querySelector('#status').textContent,inert:document.querySelector('#app').inert,dialogue:!!document.querySelector('.battle-message[data-kind=intro]')})`)}));
            throw new Error('Native click did not advance a legal target');
          }
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
    assert.deepEqual(checked.map(battle => battle.count), Array.from({ length: 9 }, (_, i) => Math.min(i + 1, capacity)));
    results.push({ mode: url.startsWith('file:') ? 'file' : 'HTTP', battles: checked });
    if (process.argv.includes('--restart')) continue;
    assert.equal(await evaluate("document.querySelector('.cutscene').style.backgroundImage.includes('data:image/png')"),true);
    await key('Enter'); await key('KeyD');
    assert.equal(await evaluate("document.querySelector('#app').dataset.step"),'finale');
  }
  assert.equal(errors.length,0);
  const report = { branch: process.argv.includes('--restart') ? 'restart' : 'continue', sustainHero: process.argv.includes('--sustain-hero'), runtimeErrors: errors.length, results };
  await fs.writeFile(path.join(out, `campaign-chain-${report.branch}.json`), JSON.stringify(report, null, 2));
  console.log('Campaign: 9 battles, random catalog rosters, 1→2→3→4→5 cap, rewards, fades and ' + report.branch + ' passed HTTP/file');
} finally {ws?.close();chrome.kill();server.kill();}
