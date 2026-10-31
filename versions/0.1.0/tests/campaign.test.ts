import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSession, battles, createBattle, validateCampaign } from '../src/domain/campaign';
import { enemyCatalog, TypeEnemyParameter } from '../src/enemies/enemy';
import { canSpawn, spawnPoints } from '../src/enemies/spawn';
test('campaign preserves voiced cutscenes, nine battles, fresh enemies and persistent hero',()=>{
 const c=new CampaignSession(); const ids:string[]=[]; const hero=c.hero; const seen=new Set<string>(); hero.TakeDamage(30);const hp=hero.GetParameter(TypeEnemyParameter.Health);
 while(!c.complete){ids.push(c.current.id);if(c.current.type==='battle'){const battle=c.createBattle();assert.equal(battle.hero,hero);assert.equal(hero.GetParameter(TypeEnemyParameter.Health),hp);for(const enemy of battle.npcs){assert.ok(enemy.alive);assert.ok(!seen.has(enemy.id));seen.add(enemy.id);enemy.TakeDamage(1000);}}c.advance(c.current.id);}
 assert.deepEqual(ids,['intro','fight-1','memory-2','fight-2','fight-3','fight-4','interlude','fight-5','fight-6','fight-7','fight-8','fight-2-repeat','outro','finale']);assert.equal(c.advance('finale'),false);c.restart();assert.equal(c.current.id,'intro');assert.notEqual(c.hero,hero);
});

test('enemy count grows across cutscenes and stays at the usable spawn capacity', () => {
 const c = new CampaignSession(() => 0.99);
 const counts: number[] = [];
 while (!c.complete) {
  if (c.current.type === 'battle') {
   const battle = c.createBattle();
   counts.push(battle.npcs.length);
   assert.equal(battle.deployed.length, battle.npcs.length);
   assert.equal(new Set(battle.deployed.map(e => battle.GetSpawnPoint(e.id)!.id)).size, battle.npcs.length);
   assert.ok(battle.CanTarget(battle.selectedId));
  }
  c.advance(c.current.id);
 }
 const capacity = spawnPoints.filter(point => enemyCatalog.some(info => canSpawn(info, point))).length;
 assert.deepEqual(counts, Array.from({ length: 9 }, (_, i) => Math.min(i + 1, capacity)));
});

test('every enemy is rolled from the existing compatible catalog, including battles after the cap', () => {
 let calls = 0;
 const c = new CampaignSession(() => ((calls++ % enemyCatalog.length) + 0.5) / enemyCatalog.length);
 const before = JSON.stringify({ battles, enemyCatalog });
 const seen = new Set<string>();
 let index = 0;
 while (!c.complete) {
  if (c.current.type === 'battle') {
   const battle = c.createBattle();
   for (const enemy of battle.npcs) {
    const eligible = enemyCatalog.filter(info => canSpawn(info, battle.GetSpawnPoint(enemy.id)!));
    const roll = ((index++ % enemyCatalog.length) + 0.5) / enemyCatalog.length;
    assert.equal(enemy.typeId, eligible[Math.floor(roll * eligible.length)]!.typeId);
    assert.equal(enemy.EnemyInfo, enemyCatalog.find(info => info.typeId === enemy.typeId));
    assert.ok(canSpawn(enemy.EnemyInfo, battle.GetSpawnPoint(enemy.id)!));
    seen.add(enemy.typeId);
   }
  }
  c.advance(c.current.id);
 }
 assert.deepEqual([...seen].sort(), enemyCatalog.map(info => info.typeId).sort());
 assert.equal(calls, index);
 assert.equal(JSON.stringify({ battles, enemyCatalog }), before);
});

test('invalid chain references and duplicate steps are rejected',()=>{
 assert.throws(()=>validateCampaign({id:'x',steps:[{id:'x',type:'battle',contentId:'missing'}]}));
 assert.throws(()=>validateCampaign({id:'x',steps:[{id:'x',type:'battle',contentId:'battle-1'},{id:'x',type:'battle',contentId:'battle-1'}]}));
 assert.throws(()=>createBattle({...battles[0]!,enemies:[...battles[0]!.enemies,...battles[0]!.enemies]},'bad',new CampaignSession().hero));
});
