import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyFromInfo, TypeEnemyParameter as P } from '../src/enemies/enemy';
import { EnemySession, loadSession } from '../src/enemies/session';
import { createNPCView } from '../src/enemies/view';
function fixture(type='chair',rear=false) {
 const guard=createEnemyFromInfo(`enemy.guard.${type}`,'guard'),ally=createEnemyFromInfo('enemy.healer.teal','ally');
 return {guard,ally,session:new EnemySession([guard,ally],1,guard.id,[{enemyId:guard.id,spawnPointId:rear?'spawn-5':'spawn-4'},{enemyId:ally.id,spawnPointId:'spawn-1'}])};
}
test('available guard forces targeting, rear guard is ignored, breaking frees only the current column',()=>{
 const {guard,ally,session}=fixture();assert.equal(session.CanTarget(ally.id),false);assert.equal(session.CanTarget(guard.id),true);
 guard.TakeDamage(50);assert.equal(guard.guardActive,false);assert.equal(session.CanTarget(ally.id),true);
 const rear=fixture('tracks',true);assert.equal(rear.session.CanTarget(rear.ally.id),true);assert.equal(rear.session.CanTarget(rear.guard.id),false);
 rear.ally.TakeDamage(1000);assert.equal(rear.session.CanTarget(rear.guard.id),true);
});
test('both guard types hide only shield immediately, keep geometry and return a full turn after refill',()=>{
 for(const type of ['chair','tracks']) {
 const {guard,session}=fixture(type);const initial=createNPCView(guard).visual;
 assert.equal(guard.GetParameter(P.Health),type === 'tracks' ? 50 : 20);assert.equal(guard.GetParameter(P.Shield),50);
 guard.ChangeParameter(P.Shield,-50);let view=createNPCView(guard).visual;
 assert.equal(view.parts.find(p=>p.id==='guard-shield')!.visible,false);assert.deepEqual(view.bounds,initial.bounds);
 guard.ChangeParameter(P.Shield,3);assert.equal(guard.guardActive,false);
 session.EndTurn();assert.equal(guard.guardActive,false);
 const saved=session.Save();const restored=loadSession(saved);assert.equal(restored.Save(),saved);assert.equal(restored.selected.guardActive,false);
 restored.EndTurn();assert.equal(restored.selected.guardActive,true);
 assert.equal(createNPCView(restored.selected).visual.parts.find(p=>p.id==='guard-shield')!.visible,true);
 guard.ChangeParameter(P.Shield,-3);session.EndTurn();assert.equal(guard.guardActive,false);
 }
});
test('reserve guards never provoke, dead guard deactivates and deployed guard strikes for five',()=>{
 const a=createEnemyFromInfo('enemy.guard.chair','a'),b=createEnemyFromInfo('enemy.guard.tracks','b');
 // Two guards in the same x-column are unavailable in ground spawn data; reserve must not provoke.
 const session=new EnemySession([a,b],1,a.id,[{enemyId:a.id,spawnPointId:'spawn-4'}]);
 assert.equal(session.CanTarget(a.id),true);assert.equal(session.CanTarget(b.id),false);
 session.hero.AddStatus('stun',1);session.Attack(a.id,[],()=>.9);assert.equal(session.hero.GetParameter(P.Shield),15);
 a.TakeDamage(1000);assert.equal(a.guardActive,false);
});
test('invalid guard recovery saves fail; shield restoration by teal waits before provoking',()=>{
 const {session,guard,ally}=fixture();guard.TakeDamage(50);assert.equal(session.TryHeal(ally),true);assert.equal(guard.GetParameter(P.Shield),3);assert.equal(guard.guardActive,false);
 for(const turns of [-2,3,0.5,-1]){const bad=JSON.parse(session.Save());bad.enemies[0].guardRecoveryTurns=turns;assert.throws(()=>loadSession(JSON.stringify(bad)));}
});
