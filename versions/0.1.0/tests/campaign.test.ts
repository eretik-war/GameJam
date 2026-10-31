import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSession, battles, createBattle, validateCampaign } from '../src/domain/campaign';
import { TypeEnemyParameter } from '../src/enemies/enemy';
test('campaign repeats content with fresh enemies and one persistent hero, completes once',()=>{
 const c=new CampaignSession(); assert.equal(c.current.id,'intro'); assert.equal(c.advance('wrong'),false);
 c.advance('intro'); const a=c.createBattle(); a.hero.TakeDamage(30); const hp=a.hero.GetParameter(TypeEnemyParameter.Health);
 c.advance('fight-1'); const b=c.createBattle(); assert.equal(b.npcs.length,2); assert.equal(b.hero,a.hero);
 b.npcs[0]!.TakeDamage(1000); c.advance('fight-2'); c.advance('interlude'); const repeat=c.createBattle();
 assert.ok(repeat.npcs.every(e=>e.alive)); assert.notEqual(repeat.npcs[0]!.id,b.npcs[0]!.id);assert.equal(repeat.hero.GetParameter(TypeEnemyParameter.Health),hp);
 assert.ok(Object.isFrozen(battles[1]!.enemies[0])); c.advance('fight-2-repeat'); c.advance('outro');assert.ok(c.complete);assert.equal(c.advance('outro'),false);
});
test('invalid chain references and duplicate steps are rejected',()=>{
 assert.throws(()=>validateCampaign({id:'x',steps:[{id:'x',type:'battle',contentId:'missing'}]}));
 assert.throws(()=>validateCampaign({id:'x',steps:[{id:'x',type:'battle',contentId:'battle-1'},{id:'x',type:'battle',contentId:'battle-1'}]}));
 assert.throws(()=>createBattle({...battles[0]!,enemies:[...battles[0]!.enemies,...battles[0]!.enemies]},'bad',new CampaignSession().hero));
});
