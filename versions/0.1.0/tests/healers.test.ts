import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyFromInfo, TypeEnemyParameter as P, TypeSupportParameter as S } from '../src/enemies/enemy';
import { EnemySession, loadSession } from '../src/enemies/session';
import { createEnemyVisualLayout } from '../src/enemies/visual-info';
const hp=(e: ReturnType<typeof createEnemyFromInfo>)=>e.GetParameter(P.Health);
const shield=(e: ReturnType<typeof createEnemyFromInfo>)=>e.GetParameter(P.Shield);
function fixture(color='magenta') {
 const units=[createEnemyFromInfo('enemy.camera.teal','ally-a'),createEnemyFromInfo('enemy.camera.blue','ally-b'),createEnemyFromInfo(`enemy.healer.${color}`,'healer')];
 const session=new EnemySession(units,1,'ally-a',[{enemyId:'ally-a',spawnPointId:'spawn-4'},{enemyId:'ally-b',spawnPointId:'spawn-5'},{enemyId:'healer',spawnPointId:'spawn-1'}]);
 return {session,a:units[0]!,b:units[1]!,healer:units[2]!};
}
test('support flyers share HP and shield, have no attacks and immutable distinct abilities',()=>{
 for(const [i,color] of ['magenta','teal','blue','gold'].entries()) {
 const {healer}=fixture(color);assert.equal(hp(healer),3);assert.equal(shield(healer),16);assert.deepEqual(healer.EnemyInfo.attackIds,[]);
 assert.equal(healer.EnemyInfo.SupportParameters[0]!.Type,[S.Healing,S.ShieldRestore,S.DefenseAura,S.DamageAura][i]);
 assert.ok(Object.isFrozen(healer.EnemyInfo.SupportParameters[0]));
 assert.equal(createEnemyVisualLayout(healer.EnemyInfo).parts.length,2);
 }
});
test('pink restores HP with lowest-current-value and position ties, never self or dead',()=>{
 const {session,a,b,healer}=fixture();healer.ChangeParameter(P.Health,-2);assert.equal(session.TryHeal(healer),false);
 a.ChangeParameter(P.Health,-10);b.ChangeParameter(P.Health,-15);session.TryHeal(healer);assert.equal(hp(b),18);
 b.ChangeParameter(P.Health,2);session.TryHeal(healer);assert.equal(hp(a),23);
 b.TakeDamage(1000);a.ChangeParameter(P.Health,100);assert.equal(session.TryHeal(healer),false);assert.equal(hp(healer),1);
 a.ChangeParameter(P.Health,-1);session.TryHeal(healer);assert.equal(hp(a),30);
});
test('teal restores only shield, capped at base, never itself',()=>{
 const {session,a,b,healer}=fixture('teal');healer.ChangeParameter(P.Shield,-10);assert.equal(session.TryHeal(healer),false);
 a.ChangeParameter(P.Shield,-7);b.ChangeParameter(P.Shield,-6);session.TryHeal(healer);assert.equal(shield(a),4);assert.equal(hp(a),30);
 b.ChangeParameter(P.Shield,5);a.ChangeParameter(P.Shield,4);session.TryHeal(healer);assert.equal(shield(b),8);
 healer.AddStatus('stun',1);a.ChangeParameter(P.Shield,-4);assert.equal(session.TryHeal(healer),false);
});
test('every support color never attacks, even when no ally needs help',()=>{
 for(const color of ['magenta','teal','blue','gold']) {
 const {session,a,b,healer}=fixture(color);a.TakeDamage(1000);b.TakeDamage(1000);session.hero.AddStatus('stun',1);
 const before=shield(session.hero);session.Attack(healer.id,[],()=>.9);assert.equal(shield(session.hero),before);assert.equal(hp(session.hero),1000);
 }
});
test('yellow boosts shooters by 1.5, never heals or applies regeneration; aura ends on death',()=>{
 const {session,a,healer}=fixture('gold');session.hero.AddStatus('stun',1);session.Attack(a.id,[],()=>.9);assert.equal(shield(session.hero),5);
 a.ChangeParameter(P.Health,-10);assert.equal(session.TryHeal(healer),false);assert.equal(a.statuses.length,0);
 healer.TakeDamage(1000);assert.equal(session.OutgoingDamageScale,1);
});
test('blue divides all incoming damage including burning, applies to itself, vanishes on death',()=>{
 const {session,a,healer}=fixture('blue');a.TakeDamage(3);assert.equal(shield(a),6);
 a.AddStatus('burning',1);a.BeginTurn();assert.equal(shield(a),4);
 healer.TakeDamage(3);assert.equal(shield(healer),14);healer.TakeDamage(1000);assert.equal(session.IncomingDamageScale,1);
 a.TakeDamage(3);assert.equal(shield(a),1);
});
test('duplicate auras do not stack; reserves/dead sources excluded; saves rebind live aura',()=>{
 for(const color of ['blue','gold']) {
 const a=createEnemyFromInfo(`enemy.healer.${color}`,'first'),b=createEnemyFromInfo(`enemy.healer.${color}`,'second');
 const session=new EnemySession([a,b]);assert.equal(color==='blue'?session.IncomingDamageScale:session.OutgoingDamageScale,color==='blue'?1/1.5:1.5);
 const saved=session.Save();assert.equal(loadSession(saved).Save(),saved);
 a.TakeDamage(1000);assert.equal(color==='blue'?session.IncomingDamageScale:session.OutgoingDamageScale,color==='blue'?1/1.5:1.5);
 b.TakeDamage(1000);assert.equal(session.IncomingDamageScale,1);assert.equal(session.OutgoingDamageScale,1);
 }
});
