import test from 'node:test';import assert from 'node:assert/strict';
import {createEnemyFromInfo,TypeEnemyParameter as P} from '../src/enemies/enemy';import {EnemySession,loadSession} from '../src/enemies/session';import {createEnemyVisualLayout} from '../src/enemies/visual-info';
test('four bosses preserve normal camera rigs and multiply only their own combat stats',()=>{
 for(const c of ['magenta','teal','blue','gold']){
 const normal=createEnemyFromInfo(c==='magenta'?'enemy.trainee':`enemy.camera.${c}`,'normal');const boss=createEnemyFromInfo(`enemy.boss.${c}`,'boss');
 assert.equal(normal.GetParameter(P.Health),30);assert.equal(normal.GetParameter(P.Shield),8);assert.equal(normal.damageMultiplier,1);
 assert.equal(createEnemyVisualLayout(normal.EnemyInfo).parts[0]!.id,'shooter-leg');
 assert.equal(boss.GetParameter(P.Health),75);assert.equal(boss.GetParameter(P.Shield),20);assert.equal(boss.damageMultiplier,2.5);assert.ok(Object.isFrozen(boss.EnemyInfo.CombatParameters[0]));
 assert.equal(createEnemyVisualLayout(boss.EnemyInfo).parts[0]!.id,`shooter-leg-${c}`);
 const session=new EnemySession([boss]);session.hero.AddStatus('stun',1);session.Attack('boss',[],()=>.9);assert.equal(session.hero.GetParameter(P.Shield),7.5);
 assert.equal(loadSession(session.Save()).Save(),session.Save());
 }
});
