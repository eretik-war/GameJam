import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemySession, createSession, loadSession } from '../src/enemies/session';
import { createEnemyFromInfo, TypeEnemyParameter } from '../src/enemies/enemy';
import { Hero, heroInfo, heroCombatInfo } from '../src/domain/hero';
import { createItemFromInfo } from '../src/domain/items';
import { getAttackInfo } from '../src/enemies/attack';
import { createCombatantView } from '../src/enemies/view';
const hp = (e: { GetParameter(type: TypeEnemyParameter): number }) => e.GetParameter(TypeEnemyParameter.Health);
const shield = (e: { GetParameter(type: TypeEnemyParameter): number }) => e.GetParameter(TypeEnemyParameter.Shield);

test('ported attack uses actual spawn columns and advances one turn with shield-first counterattacks', () => {
  const session = createSession();
  assert.equal(session.selectedId, 'enemy-4');
  const before = session.Save();
  assert.equal(session.Attack('enemy-3'), false);
  assert.equal(session.Attack('enemy-5'), false);
  assert.equal(session.Save(), before);
  assert.equal(session.Attack('enemy-4', [], () => .9), true);
  assert.equal(session.turn, 2);
  assert.equal(hp(session.selected), 26); assert.equal(shield(session.selected), 0);
  assert.equal(hp(session.hero), 1000); assert.equal(shield(session.hero), 3);
  assert.equal(hp(session.npcs.find(e => e.id === 'enemy-3')!), 30);
  // 4 (burning) + 6 (plain) + 4 (stun) counterattack damage hits the hero shield first.
  assert.deepEqual(session.hero.statuses.map(s => `${s.typeId}:${s.remainingTurns}`), ['burning:1', 'stun:1']);
  // A stunned hero loses exactly one attack; the fight then runs to the target's death.
  session.Attack('enemy-4');
  assert.equal(hp(session.selected), 26); assert.equal(session.hero.stunned, false);
  for (let guard = 0; guard < 8 && session.selected.alive; guard++) session.Attack('enemy-4');
  assert.equal(session.selected.alive, false);
  assert.equal(session.CanTarget('enemy-5'), true);
  assert.equal(session.CanTarget('enemy-3'), false);
});

test('combat targeting ignores roster order and reserve enemies never attack', () => {
  const source = createSession();
  const reordered = new EnemySession([...source.npcs].reverse(), 1, source.selectedId,
    source.npcs.map(e => ({ enemyId: e.id, spawnPointId: source.GetSpawnPoint(e.id)!.id })));
  assert.equal(reordered.CanTarget('enemy-4'), true); assert.equal(reordered.CanTarget('enemy-3'), false);
  const enemies = ['enemy.trainee','enemy.camera.teal','enemy.camera.blue','enemy.camera.gold'].map((type,i) => createEnemyFromInfo(type, `test-${i}`));
  const session = new EnemySession(enemies);
  assert.equal(session.CanTarget('test-3'), false);
  assert.equal(session.Attack('test-1'), true);
  // Three deployed counterattacks (4+6+4) plus the 3 burning damage tick on the hero.
  assert.equal(shield(session.hero), 3);
});

test('hero equipment bonus, stun, death and turn overflow preserve published combat behavior', () => {
  const hero = new Hero();
  assert.equal(hero.AttackDamage([null,null,null]), 12);
  assert.equal(hero.AttackDamage([createItemFromInfo('item.01','item-a'),createItemFromInfo('item.02','item-b'),null]), 18);
  assert.equal(hero.HeroInfo, heroInfo); assert.ok(Object.isFrozen(heroCombatInfo));
  assert.ok(Object.isFrozen(heroCombatInfo.Parameters[0]));
  assert.equal(createCombatantView(hero).parameters.find(p => p.type === 'role')!.value, 'Герой');
  const session = createSession(); session.hero.AddStatus('stun', 1);
  session.Attack('enemy-4');
  assert.equal(hp(session.selected), 30); assert.equal(shield(session.selected), 8);
  assert.equal(session.hero.stunned, false); assert.equal(session.turn, 2);
  session.hero.TakeDamage(10000);
  const dead = session.Save(); assert.equal(session.Attack('enemy-4'), false); assert.equal(session.Save(), dead);
  const overflow = createSession(); overflow.turn = Number.MAX_SAFE_INTEGER;
  const before = overflow.Save(); assert.throws(() => overflow.Attack('enemy-4')); assert.equal(overflow.Save(), before);
});

test('each camera colour owns its attack damage and effect; lenses add damage and effects to the hero attack', () => {
  const session = createSession();
  const magenta = session.npcs.find(e => e.id === 'enemy-3')!;
  const teal = session.npcs.find(e => e.id === 'enemy-4')!;
  const blue = session.npcs.find(e => e.id === 'enemy-5')!;
  assert.equal(magenta.attack?.typeId, 'attack.red');
  assert.equal(magenta.attack?.damage, 4); assert.equal(magenta.attack?.effect?.typeId, 'burning');
  assert.equal(teal.attack?.typeId, 'attack.teal');
  assert.equal(teal.attack?.damage, 6); assert.equal(teal.attack?.effect, undefined);
  assert.equal(blue.attack?.effect?.typeId, 'stun');
  assert.equal(getAttackInfo('attack.gold').effect?.typeId, 'blindness');

  const hero = new Hero();
  const burning = createItemFromInfo('item.01', 'lens-a');
  const stun = createItemFromInfo('item.03', 'lens-b');
  const plain = createItemFromInfo('item.02', 'lens-c');
  assert.equal(hero.AttackDamage([burning, plain, null]), 18);
  assert.deepEqual(hero.AttackEffects([burning, stun, null]).map(effect => effect.typeId), ['burning', 'stun']);
  // The same lens twice stacks its damage but its effect is applied once.
  assert.equal(hero.AttackDamage([burning, burning, null]), 16);
  assert.equal(hero.AttackEffects([burning, burning, null]).length, 1);
  assert.deepEqual(hero.AttackEffects([plain, null, null]), []);

  const fight = createSession();
  assert.equal(fight.Attack('enemy-4', [burning, null, null], () => .9), true);
  const target = fight.npcs.find(e => e.id === 'enemy-4')!;
  assert.equal(hp(target), 21); assert.equal(shield(target), 0);
  assert.equal(target.statuses[0]!.typeId, 'burning');
});

test('v2 save round-trip includes hero state while older saves keep their enemies and default hero', () => {
  const session = createSession(); session.hero.TakeDamage(30); session.hero.AddStatus('burning', 2);
  const saved = session.Save(); const restored = loadSession(saved);
  assert.equal(restored.Save(), saved); assert.equal(restored.hero.HeroInfo, heroInfo);
  assert.equal(hp(restored.hero), 990); assert.equal(restored.hero.statuses[0]!.remainingTurns, 2);
  const legacy = JSON.parse(saved); delete legacy.hero;
  const old = loadSession(JSON.stringify(legacy));
  assert.equal(hp(old.hero), 1000); assert.equal(shield(old.hero), 20); assert.equal(old.npcs.length, 3);
  for (const change of [
    (d: any) => { d.hero.typeId = 'unknown'; },
    (d: any) => { d.hero.id = 'wrong'; },
    (d: any) => { d.hero.Parameters[0].Value = 1001; },
    (d: any) => { d.hero.Parameters[0].Type = 'unknown'; },
    (d: any) => { d.hero.statuses[0].remainingTurns = 0; },
  ]) {
    const invalid = JSON.parse(saved); change(invalid);
    assert.throws(() => loadSession(JSON.stringify(invalid))); assert.equal(session.Save(), saved);
  }
});
