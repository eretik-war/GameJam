import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { root } from './build.mjs';

const out = path.join(root, 'versions/0.1.0/builds');
const results = [];
const requestedItems = process.argv.find(arg=>arg.startsWith('--items='))?.slice(8).split(',');
const requestedProtocol = process.argv.find(arg=>arg.startsWith('--protocol='))?.slice(11);
const resultName = requestedItems || requestedProtocol ? `combat-items-browser-${requestedProtocol??'both'}-${requestedItems?.join('-')??'all'}.json` : 'combat-items-browser-results.json';
assert.ok(!requestedProtocol || ['http','file'].includes(requestedProtocol));
assert.ok(!requestedItems || requestedItems.every(id=>['item.09','item.10','item.11','item.12'].includes(id)));
const iconSources = Object.fromEntries(await Promise.all([['item.09','blue'],['item.10','magenta'],['item.11','gold'],['item.12','teal']].map(async ([typeId,color])=>[typeId, 'data:image/png;base64,'+(await fs.readFile(path.join(root,`assets/images/items/item-combat-${color}.png`))).toString('base64')])));
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
      if(!request) return;
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timed out: ${method}`));},20000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
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


  const points = JSON.parse(await fs.readFile(path.join(root, 'assets/enemies/spawn-points.json'), 'utf8'));
  const clickAt = async (x,y) => {
    for (const type of ['mouseMoved','mousePressed','mouseReleased'])
      await call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',clickCount:1});
  };
  const rect = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);
  const click = async selector => {const b=await rect(selector);await clickAt(b.x+b.width/2,b.y+b.height/2);};
  const hover = async selector => { const b=await rect(selector); await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:b.x+b.width/2,y:b.y+b.height/2}); };
  const stable = () => until(() => evaluate("document.querySelector('.scene-transition').hidden && !document.querySelector('#app').inert"));
  const dismissIntro = async () => {
    for(let guard=0;guard<5;guard++) {
      if(!await evaluate("!!document.querySelector('.battle-message[data-kind=intro]')")) break;
      await clickAt(400,300);
    }
    assert.equal(await evaluate("!!document.querySelector('.battle-message[data-kind=intro]')"),false);
  };
  const save = async () => {
    await evaluate("document.querySelector('#save').click()");
    return evaluate("JSON.parse(localStorage.getItem('gamejam.enemies.v2'))");
  };
  const attack = async saved => {
    const point = points.find(p => p.id === saved.enemies.find(e=>e.id===saved.selectedId).spawnPointId);
    const b=await rect('#scene canvas'); await clickAt(b.x+b.width*point.x,b.y+b.height*point.y);
  };
  const randomQueue = values => evaluate(`window.__originalRandom ??= Math.random; window.__qaRolls=${JSON.stringify(values)}; Math.random=()=>window.__qaRolls.length?window.__qaRolls.shift():.9`);
  const value = (enemy,type) => enemy.Parameters.find(p=>p.Type===type).Value;
  for(const [protocol,width,height] of [['http',1440,900],['file',1280,720]]) {
    if(process.argv.includes('--http-only')&&protocol!=='http') continue;
    if(requestedProtocol&&protocol!==requestedProtocol) continue;
    const url=protocol==='http'?`http://127.0.0.1:${httpPort}/`:pathToFileURL(path.join(root,'versions/gamejam_0.1.0-offline.html')).href;
    for(const [typeId,choice] of [['item.09',8],['item.10',9],['item.11',10],['item.12',11]]) {
      if(requestedItems&&!requestedItems.includes(typeId)) continue;
      console.log('Verifying',protocol,typeId);
      await resize(width,height); await navigate(url,"document.querySelector('#app')?.dataset.ready === 'true'");await stable();
      // Preserve campaign behavior; finish the actual first battle via the real canvas handler.
      for(let introGuard=0;introGuard<6&&await evaluate("document.querySelector('#app').classList.contains('showing-cutscene')");introGuard++) {
        await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}))");await pause(100);await stable();
      }
      await dismissIntro();await evaluate(`Math.random=()=>${(choice+.5)/12}`);
      const canvasBefore=await rect('#scene canvas');
      for(let guard=0;guard<25;guard++) {
        const state=await save();await attack(state);
        if(await evaluate("document.querySelector('#reward-dialog').open")) break;
      }
      await until(()=>evaluate("document.querySelector('#reward-dialog').open"));
      const offers=await evaluate("[...document.querySelectorAll('.reward-option')].map(b=>b.dataset.typeId)");
      assert.equal(new Set(offers).size,3);assert.ok(offers.includes(typeId),JSON.stringify({typeId,offers}));
      await until(()=>evaluate("[...document.querySelectorAll('.reward-option img')].every(i=>i.complete&&i.naturalWidth===128)"));
      assert.equal(await evaluate(`document.querySelector('.reward-option[data-type-id="${typeId}"] img').src`),iconSources[typeId]);
      // Focus shows the same shared hover data in rewards and equipment.
      await hover(`.reward-option[data-type-id="${typeId}"]`);
      await until(()=>evaluate("document.querySelector('.hover-card:not([hidden])')?.textContent.includes('+2')"));
      const rewardCard=await evaluate("document.querySelector('.hover-card:not([hidden])').textContent");
      assert.ok(rewardCard.includes(typeId==='item.09'?'10%':'25%'));
      await screenshot(`combat-items-${protocol}-${typeId}-reward.png`);
      await click(`.reward-option[data-type-id="${typeId}"]`);
      await until(()=>evaluate("!document.querySelector('#reward-dialog').open"));
      assert.equal(await evaluate(`document.querySelector('#storage-slots [data-type-id="${typeId}"] img').src`),iconSources[typeId]);
      await evaluate("document.querySelector('#storage-slots [data-index=\"0\"]').click(); document.querySelector('#equipment-slots [data-index=\"0\"]').click()");
      assert.equal(await evaluate("document.querySelector('#equipment-slots [data-index=\"0\"]').dataset.typeId"),typeId);
      await until(()=>evaluate("document.querySelector('#app').dataset.step==='fight-2'"));await stable();await dismissIntro();
      const original=await save();
      const target=original.enemies.find(e=>e.id===original.selectedId);
      for(const enemy of original.enemies) {
        enemy.statuses=[];
        enemy.Parameters.find(p=>p.Type==='health').Value=enemy===target?30:0;
        enemy.Parameters.find(p=>p.Type==='shield').Value=enemy===target&&typeId==='item.11'?100:0;
      }
      original.hero.statuses=typeId==='item.10'?[{typeId:'blindness',remainingTurns:4}]:[];
      original.hero.Parameters.find(p=>p.Type==='health').Value=1000;
      original.hero.Parameters.find(p=>p.Type==='shield').Value=20;
      await evaluate(`localStorage.setItem('gamejam.enemies.v2',${JSON.stringify(JSON.stringify(original))});document.querySelector('#load').click()`);
      await dismissIntro();
      await randomQueue(typeId==='item.09'?[.9,.9,.099]:typeId==='item.10'?[.9,.249,.9]:[.9,.9,.9]);
      await attack(original);
      const after=await save();const changed=after.enemies.find(e=>e.id===original.selectedId);
      assert.equal(after.turn,original.turn+1);
      if(typeId==='item.09') {assert.equal(value(changed,'health'),16);assert.equal(value(after.hero,'shield'),20);assert.deepEqual(after.hero.statuses,[]);}
      if(typeId==='item.10') {assert.equal(value(changed,'health'),16);assert.deepEqual(after.hero.statuses,[]);assert.deepEqual(changed.statuses,[{typeId:'blindness',remainingTurns:3}]);}
      if(typeId==='item.11') {assert.equal(value(changed,'shield'),82.5);assert.equal(value(changed,'health'),30);}
      if(typeId==='item.12') {assert.equal(value(changed,'shield'),0);assert.equal(value(changed,'health'),12.5);}
      await until(()=>evaluate("document.querySelector('#equipment-slots [data-index=\"0\"] img')?.complete"));
      assert.equal(await evaluate("document.querySelector('#equipment-slots [data-index=\"0\"] img').src"),iconSources[typeId]);
      await hover('#equipment-slots [data-index="0"]');
      await until(()=>evaluate("document.querySelector('.hover-card:not([hidden])')?.textContent.includes('+2')"));
      const equippedCard=await evaluate("document.querySelector('.hover-card:not([hidden])').textContent");assert.equal(equippedCard,rewardCard);
      assert.deepEqual(await rect('#scene canvas'),canvasBefore);
      await screenshot(`combat-items-${protocol}-${typeId}-equipped.png`);
      results.push({protocol,width,height,typeId,offers,rewardCard,equippedCard,after,unchangedCanvas:true});
      await fs.writeFile(path.join(out,resultName),JSON.stringify({results,errors},null,2)+'\n');
      console.log('Passed',protocol,typeId);
    }
  }
  assert.equal(results.length,(requestedItems?.length??4)*(requestedProtocol||process.argv.includes('--http-only')?1:2));
  assert.deepEqual(errors,[]);
  const externalRequests=requests.filter(url=>/^https?:/.test(url)&&!url.startsWith('http://127.0.0.1:'));assert.deepEqual(externalRequests,[]);
  await fs.writeFile(path.join(out,resultName),JSON.stringify({results,errors,externalRequests},null,2)+'\n');
  console.log(JSON.stringify({passed:results.length,protocols:[...new Set(results.map(r=>r.protocol))],items:[...new Set(results.map(r=>r.typeId))],runtimeErrors:errors.length,externalRequests:externalRequests.length}));
} finally {ws?.close();chrome.kill();server.kill();}
