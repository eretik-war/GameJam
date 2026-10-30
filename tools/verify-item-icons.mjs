import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { root } from './build.mjs';

const out = path.join(root, process.argv.includes('--local') ? 'versions/0.1.0/builds/item-icons' : 'versions/0.1.0/dev-support/qa');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function until(fn) {
  const start = Date.now();
  while (Date.now() - start < 20000) { try { if (await fn()) return; } catch {} await pause(100); }
  throw new Error('Item icon browser verification timed out');
}
await fs.mkdir(out, { recursive: true });
await fs.mkdir(path.join(root, 'work'), { recursive: true });
const profile = await fs.mkdtemp(path.join(root, 'work/item-chrome-'));
const httpPort = await freePort(), browserPort = await freePort();
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
  let nextId = 0; const pending = new Map(), errors = [], requests = [], results = [];
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
  const bounds = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);
  const click = async selector => {
    const rect = await bounds(selector); const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
  };
  const key = async (key, code, windowsVirtualKeyCode) => {
    for (const type of ['keyDown', 'keyUp']) await call('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
  };
  const shot = async name => {
    const result = await call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(out, name), Buffer.from(result.data, 'base64'));
  };
  const iconState = selector => evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(i => ({tag:i.tagName, loaded:i.complete, naturalWidth:i.naturalWidth, naturalHeight:i.naturalHeight, width:i.getBoundingClientRect().width, height:i.getBoundingClientRect().height, text:i.textContent, opacity:getComputedStyle(i).opacity, background:getComputedStyle(i).backgroundColor, source:i.currentSrc.startsWith('data:image/png'), draggable:i.draggable}))`);
  const assertIcons = icons => {
    assert.ok(icons.length);
    for (const icon of icons) {
      assert.equal(icon.tag, 'IMG'); assert.equal(icon.loaded, true); assert.equal(icon.naturalWidth, 128); assert.equal(icon.naturalHeight, 128);
      assert.equal(icon.text, ''); assert.equal(icon.source, true); assert.equal(icon.draggable, false); assert.equal(icon.opacity, '1');
      assert.equal(icon.background, 'rgba(0, 0, 0, 0)'); assert.ok(icon.width >= 40 && icon.width <= 78); assert.equal(icon.width, icon.height);
    }
  };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  for (const [protocol, width, height] of [['http', 1440, 900], ['file', 1280, 720]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const url = protocol === 'http' ? `http://127.0.0.1:${httpPort}/` : pathToFileURL(path.join(root, 'versions/gamejam_0.1.0-offline.html')).href;
    await call('Page.navigate', { url });
    await until(() => evaluate(`document.querySelector('#scene canvas') && document.querySelectorAll('.inventory-slot').length === 15`));
    await pause(500);
    assert.equal(await evaluate(`document.querySelector('.debug').hidden`), true);
    await key('d', 'KeyD', 68);
    assert.equal(await evaluate(`document.querySelector('.debug').hidden`), false);
    await key('d', 'KeyD', 68);
    assert.equal(await evaluate(`document.querySelector('.debug').hidden`), true);
    const before = await bounds('#scene canvas');
    const offeredSources = new Map();
    for (let index = 0; index < 4; index++) {
      const typeId = `item.0${index + 1}`;
      await evaluate(`globalThis.__itemRandom = Math.random; Math.random = () => ${[0, 0.34, 0.67, 0.99][index]}`);
      await click('#phase-action');
      await evaluate('Math.random = globalThis.__itemRandom; delete globalThis.__itemRandom');
      await until(() => evaluate(`document.querySelector('#reward-dialog').open && [...document.querySelectorAll('.reward-option img')].every(i=>i.complete&&i.naturalWidth===128)`));
      const offers = await evaluate(`[...document.querySelectorAll('.reward-option')].map(b=>b.dataset.typeId)`);
      assert.equal(new Set(offers).size, 3); assert.ok(offers.includes(typeId)); assert.ok(offers.every(id => /^item\.0[1-4]$/.test(id)));
      assertIcons(await iconState('.reward-option .item-icon'));
      offeredSources.set(typeId, await evaluate(`document.querySelector('.reward-option[data-type-id="${typeId}"] img').src`));
      if (index === 0) await shot(`item-icons-${protocol}-reward.png`);
      await click(`.reward-option[data-type-id="${typeId}"]`);
      await until(() => evaluate(`!document.querySelector('#reward-dialog').open && document.querySelectorAll('#storage-slots img').length===${index + 1}`));
      assert.equal(await evaluate(`document.querySelector('#storage-slots [data-type-id="${typeId}"] img').src`), offeredSources.get(typeId));
      if (index < 3) await click('#phase-action');
    }
    const preparation = await bounds('#scene canvas'); assert.deepEqual(preparation, before);
    const storageIcons = await iconState('#storage-slots .item-icon'); assertIcons(storageIcons);
    assert.equal(new Set(offeredSources.values()).size, 4);
    const slotSizes = await evaluate(`[...document.querySelectorAll('.inventory-slot')].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))`);
    assert.ok(slotSizes.every(s => s.width >= 64 && s.height >= 64));
    await shot(`item-icons-${protocol}-preparation.png`);
    // Keyboard moves the first item; the same PNG follows the instance.
    await evaluate(`document.querySelector('#storage-slots [data-index="0"]').focus()`); await key('Enter', 'Enter', 13);
    await evaluate(`document.querySelector('#equipment-slots [data-index="0"]').focus()`); await key('Enter', 'Enter', 13);
    assert.equal(await evaluate(`document.querySelector('#equipment-slots [data-index="0"] img').src`), offeredSources.get('item.01'));
    const source = await bounds('#storage-slots [data-index="1"]'), targetSlot = await bounds('#equipment-slots [data-index="1"]');
    const x = source.x + source.width / 2, y = source.y + source.height / 2;
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 12, y: y + 12, button: 'left', buttons: 1 });
    await until(() => evaluate(`!!document.querySelector('.drag-ghost img')`));
    assert.equal(await evaluate(`document.querySelector('.drag-ghost img').src`), offeredSources.get('item.02'));
    assertIcons(await iconState('.drag-ghost .item-icon'));
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: targetSlot.x + targetSlot.width / 2, y: targetSlot.y + targetSlot.height / 2, button: 'left', buttons: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: targetSlot.x + targetSlot.width / 2, y: targetSlot.y + targetSlot.height / 2, button: 'left', clickCount: 1 });
    assert.equal(await evaluate(`document.querySelector('#equipment-slots [data-index="1"] img').src`), offeredSources.get('item.02'));
    assert.equal(await evaluate(`document.querySelectorAll('.drag-ghost').length`), 0);
    const hover = await bounds('#equipment-slots [data-index="0"]');
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hover.x + hover.width / 2, y: hover.y + hover.height / 2 });
    await until(() => evaluate(`document.querySelector('.hover-card:not([hidden]) h3')?.textContent === 'Предмет 01'`));
    await key('Escape', 'Escape', 27);
    await click('#phase-action');
    assertIcons(await iconState('#equipment-slots .item-icon'));
    const combat = await bounds('#scene canvas'); assert.deepEqual(combat, before);
    await shot(`item-icons-${protocol}-combat.png`);
    results.push({ protocol, width, height, fourDistinctTypes: true, storageIcons, slotSizes, rewardAndEquipmentShareSources: true, keyboardMove: true, dragGhostAndDrop: true, hoverCard: true, before, preparation, combat });
  }
  assert.deepEqual(errors, []);
  const externalRequests = requests.filter(url => /^https?:/.test(url) && !url.startsWith('http://127.0.0.1:'));
  assert.deepEqual(externalRequests, []);
  await fs.writeFile(path.join(out, 'item-icons-results.json'), JSON.stringify({ results, errors, externalRequests }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: results.length, desktop: ['1440x900 HTTP', '1280x720 file'], errors: errors.length, externalRequests: externalRequests.length }));
} finally { ws?.close(); chrome.kill(); server.kill(); }
