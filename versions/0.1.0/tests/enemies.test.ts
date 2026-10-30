import test from 'node:test';
import assert from 'node:assert/strict';
import visualAsset from '../../../assets/enemies/camera-visuals.json';
import spawnAssets from '../../../assets/enemies/spawn-points.json';
import { EnemyInfo, enemyCatalog, demoEnemyInfo, createEnemyFromInfo } from '../src/enemies/enemy';
import { TypeBattleLayer, TypeEnemyPlacementParameter, TypeSpawnPointParameter } from '../src/enemies/placement';
import { spawnPoints, spawnEnemy, canSpawn, createSpawnPointInfo } from '../src/enemies/spawn';
import { EnemySession, createSession, loadSession } from '../src/enemies/session';
import { createEnemyVisualCatalog, createEnemyVisualLayout, getEnemyVisualInfo } from '../src/enemies/visual-info';

test('four camera types share immutable rig data, independent entities and a shooter-only leg socket', () => {
  assert.equal(enemyCatalog.length, 4);
  assert.equal(new Set(enemyCatalog.map(info => getEnemyVisualInfo(info.typeId).image)).size, 4);
  for (const info of enemyCatalog) {
    assert.equal(info.Placement.Type, TypeEnemyPlacementParameter.Layer);
    assert.equal(info.Placement.Value, TypeBattleLayer.Ground);
    const visual = getEnemyVisualInfo(info.typeId);
    const layout = createEnemyVisualLayout(info);
    assert.ok(Object.isFrozen(visual.sockets[0]));
    assert.ok(Object.isFrozen(visual.modules[0]!.pivot));
    assert.equal(visual.sockets.length, 4);
    const leg = layout.parts.find(p => p.id === 'shooter-leg')!;
    const module = visual.modules[0]!, socket = visual.sockets.find(s => s.id === 'underside')!;
    assert.equal(leg.x + module.pivot.x * module.scale, socket.x);
    assert.equal(leg.y + module.pivot.y * module.scale, socket.y);
    assert.ok(layout.bounds.height > visual.cameraSize.height * 2.5);
    const a = createEnemyFromInfo(info.typeId, 'a'), b = createEnemyFromInfo(info.typeId, 'b');
    a.TakeDamage(12);
    assert.equal(b.GetParameter(info.Parameters[0]!.Type), 30);
    assert.equal(a.EnemyInfo, b.EnemyInfo);
  }
  for (const mutate of [
    (d: typeof visualAsset) => { d.variants[0]!.attachments[0]!.socketId = 'missing'; },
    (d: typeof visualAsset) => { d.modules[0]!.requiredRole = 'melee'; },
    (d: typeof visualAsset) => { d.modules[0]!.requiredLayer = 'air'; },
    (d: typeof visualAsset) => { d.variants[0]!.image = '../missing.png'; },
    (d: typeof visualAsset) => { d.variants[1]!.typeId = d.variants[0]!.typeId; },
  ]) {
    const data = structuredClone(visualAsset); mutate(data);
    assert.throws(() => createEnemyVisualCatalog(data));
  }
  const detached = structuredClone(visualAsset); detached.variants[3]!.attachments = [];
  const variants = createEnemyVisualCatalog(detached);
  assert.equal(variants[3]!.attachments.length, 0);
  assert.equal(variants[0]!.attachments.length, 1);
});

test('spawn points enforce layers and occupancy; no airborne enemies are fabricated', () => {
  const ground = spawnPoints.filter(p => p.Placement.Value === TypeBattleLayer.Ground);
  const air = spawnPoints.filter(p => p.Placement.Value === TypeBattleLayer.Air);
  assert.equal(ground.length, 3); assert.equal(air.length, 2);
  assert.equal(ground[0]!.Placement.Type, TypeSpawnPointParameter.Layer);
  assert.ok(Object.isFrozen(ground[0]!.Placement));
  const flyer = new EnemyInfo('test.air', 'Air test', 30, 8, TypeBattleLayer.Air);
  assert.ok(canSpawn(flyer, air[0]!));
  assert.equal(spawnEnemy(flyer, 'air-test', air[0]!, new Set()).layer, TypeBattleLayer.Air);
  assert.throws(() => spawnEnemy(flyer, 'air-test', ground[0]!, new Set()));
  assert.throws(() => spawnEnemy(demoEnemyInfo, 'ground-test', air[0]!, new Set()));
  assert.throws(() => spawnEnemy(demoEnemyInfo, 'ground-test', ground[0]!, new Set([ground[0]!.id])));
  const invalid = structuredClone(spawnAssets[0]!); invalid.placement.value = 'unknown';
  assert.throws(() => createSpawnPointInfo(invalid));
  const session = createSession();
  assert.deepEqual(session.npcs.map(e => e.id), ['enemy-3', 'enemy-4', 'enemy-5']);
  assert.equal(new Set(session.npcs.map(e => e.typeId)).size, 3);
  session.deployed.forEach(e => assert.equal(session.GetSpawnPoint(e.id)!.Placement.Value, e.layer));
});

test('save restores all four types and placements and rejects incompatible or duplicate slots atomically', () => {
  const enemies = enemyCatalog.map((info, i) => createEnemyFromInfo(info.typeId, `e-${i}`));
  const session = new EnemySession(enemies);
  const saved = session.Save();
  const restored = loadSession(saved);
  assert.equal(restored.Save(), saved);
  assert.equal(restored.npcs[3]!.EnemyInfo, enemyCatalog[3]);
  assert.equal(restored.npcs.length, 4); assert.equal(restored.deployed.length, 3);
  for (const mutate of [
    (d: any) => { d.enemies[0].spawnPointId = 'spawn-1'; },
    (d: any) => { d.enemies[1].spawnPointId = d.enemies[0].spawnPointId; },
    (d: any) => { d.enemies[0].spawnPointId = 'missing'; },
    (d: any) => { d.enemies[0].typeId = 'missing'; },
    (d: any) => { delete d.enemies[0].spawnPointId; },
    (d: any) => { d.selectedId = 'missing'; },
    (d: any) => { delete d.selectedId; },
  ]) {
    const bad = JSON.parse(saved); mutate(bad);
    assert.throws(() => loadSession(JSON.stringify(bad)));
    assert.equal(session.Save(), saved);
  }
});

test('legacy five-enemy v2 saves keep IDs, selected target, values and reserves without occupying air', () => {
  const legacy = { schemaVersion: 2, turn: 7, selectedId: 'enemy-5',
    enemies: Array.from({ length: 5 }, (_, i) => createEnemyFromInfo('enemy.trainee', `enemy-${i + 1}`).Save()) };
  legacy.enemies[4]!.Parameters[0] = { Type: legacy.enemies[4]!.Parameters[0]!.Type, Value: 18 };
  const restored = loadSession(JSON.stringify(legacy));
  assert.equal(restored.npcs.length, 5); assert.equal(restored.deployed.length, 3);
  assert.equal(restored.selectedId, 'enemy-5'); assert.equal(restored.turn, 7);
  assert.ok(restored.GetSpawnPoint('enemy-5'));
  assert.equal(restored.selected.Parameters[0]!.Value, 18);
  restored.deployed.forEach(e => assert.equal(restored.GetSpawnPoint(e.id)!.Placement.Value, TypeBattleLayer.Ground));
  assert.equal(loadSession(restored.Save()).Save(), restored.Save());
});
