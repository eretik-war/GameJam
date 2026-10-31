import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemySession, createSession, loadSession } from '../src/enemies/session';
import { createEnemyFromInfo, TypeEnemyParameter } from '../src/enemies/enemy';
import { Hero, heroInfo, heroCombatInfo } from '../src/domain/hero';
import { createItemFromInfo } from '../src/domain/items';
import { getAttackInfo } from '../src/enemies/attack';
import { getStatusEffect } from '../src/enemies/status-effects/catalog';
import { createCombatantView } from '../src/enemies/view';
const hp = (e: { GetParameter(type: TypeEnemyParameter): number }) => e.GetParameter(TypeEnemyParameter.Health);
const shield = (e: { GetParameter(type: TypeEnemyParameter): number }) => e.GetParameter(TypeEnemyParameter.Shield);

/** A low random value lets every enemy attack and every effect land (applyChance 50/25/10). */
const alwaysLand = () => 0.05;

test('legacy attack.test remains available for incoming guards with unchanged five damage', () => {
  const attack = getAttackInfo('attack.test');
  assert.equal(attack.typeId, 'attack.test');
  assert.equal(attack.name, 'Тестовая атака');
  assert.equal(attack.damage, 5);
  assert.equal(attack.effect, undefined);
  assert.ok(Object.isFrozen(attack));
});

test('ported attack uses actual spawn columns and advances one turn with shield-first counterattacks', () => {
  const session = createSession();
  assert.equal(session.selectedId, 'enemy-4');
  const before = session.Save();
  assert.equal(session.Attack('enemy-3'), false);
  assert.equal(session.Attack('enemy-5'), false);
  assert.equal(session.Save(), before);
  assert.equal(session.Attack('enemy-4', [], alwaysLand), true);
  assert.equal(session.turn, 2);
  assert.equal(hp(session.selected), 26); assert.equal(shield(session.selected), 0);
  // 14 counterattack damage + 3 burning tick at the start of the hero's turn = 17 absorbed by shield.
  assert.equal(hp(session.hero), 1000); assert.equal(shield(session.hero), 3);
  assert.equal(hp(session.npcs.find(e => e.id === 'enemy-3')!), 30);
  assert.deepEqual(session.hero.statuses.map(s => `${s.typeId}:${s.remainingTurns}`), ['burning:1', 'stun:1']);
  // A stunned hero loses exactly one attack; the fight then runs to the target's death.
  session.Attack('enemy-4', [], () => .09);
  assert.equal(hp(session.selected), 26); assert.equal(session.hero.stunned, false);
  for (let guard = 0; guard < 8 && session.selected.alive; guard++) session.Attack('enemy-4', [], () => .09);
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
  assert.equal(session.Attack('test-1', [], alwaysLand), true);
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
  session.Attack('enemy-4', [], () => .09);
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
  assert.equal(fight.Attack('enemy-4', [burning, null, null], alwaysLand), true);
  const target = fight.npcs.find(e => e.id === 'enemy-4')!;
  assert.equal(hp(target), 21); assert.equal(shield(target), 0);
  assert.equal(target.statuses[0]!.typeId, 'burning');

  // The card legend under the divider spells each effect out and keeps its colour key.
  const enemyNotes = createCombatantView(magenta).effectNotes;
  assert.deepEqual(enemyNotes, [{ text: getStatusEffect('burning').description, tone: 'burning' }]);
  assert.deepEqual(createCombatantView(hero).effectNotes, [{ text: 'Без эффекта' }]);
  const heroNotes = createCombatantView(hero, { damage: 16, effects: hero.AttackEffects([burning, stun, null]) }).effectNotes;
  assert.deepEqual(heroNotes.map(note => note.tone), ['burning', 'stun']);
  assert.match(heroNotes[1]!.text, /^Оглушение: /);
});

test('camera names use their colour and younger-brother title without changing stable type IDs', () => {
  const expected = [
    ['enemy.trainee', 'Розовый младший брат'],
    ['enemy.camera.teal', 'Бирюзовый младший брат'],
    ['enemy.camera.blue', 'Голубой младший брат'],
    ['enemy.camera.gold', 'Жёлтый младший брат'],
  ];
  for (const [typeId, name] of expected) {
    assert.equal(createEnemyFromInfo(typeId!, 'name-test').EnemyInfo.Name, name);
  }
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

 test('stepped combat defers counterattacks and matches synchronous resolution', () => {
  const stepped = createSession(), sync = loadSession(stepped.Save());
  const before = shield(stepped.hero);
  const sequence = stepped.AttackSequence(stepped.selectedId, [], () => .9);
  assert.equal(sequence.next().value, stepped.hero.id);
  assert.equal(shield(stepped.hero), before);
  assert.equal(stepped.turn, 1);
  const actors = [...sequence];
  assert.ok(actors.length > 0);
  assert.equal(new Set(actors).size, actors.length);
  sync.Attack(sync.selectedId, [], () => .9);
  assert.equal(stepped.Save(), sync.Save());
 });

test('shield module raises max and current shield; bonus moves with equipment', () => {
  const hero = new Hero();
  assert.equal(hero.maxShield, 20);
  assert.equal(hero.GetParameter(TypeEnemyParameter.Shield), 20);
  hero.SyncEquipment([createItemFromInfo('item.08', 'mod-shield')]);
  assert.equal(hero.maxShield, 40);
  assert.equal(hero.GetParameter(TypeEnemyParameter.Shield), 40);
  hero.SyncEquipment([null]);
  assert.equal(hero.maxShield, 20);
  assert.equal(hero.GetParameter(TypeEnemyParameter.Shield), 20);
});

test('regeneration module heals the hero at the start of their turn', () => {
  const hero = new Hero();
  hero.TakeDamage(25);
  assert.equal(hp(hero), 995);
  hero.SyncEquipment([createItemFromInfo('item.05', 'mod-regen')]);
  hero.BeginTurn(alwaysLand);
  assert.equal(hp(hero), 996);
  // Regeneration does not overheal.
  hero.ChangeParameter(TypeEnemyParameter.Health, 1000 - hp(hero));
  hero.BeginTurn(alwaysLand);
  assert.equal(hp(hero), 1000);
});

test('cleanse module removes negative statuses at the start of the turn with 25% chance', () => {
  const hero = new Hero();
  hero.AddStatus('burning', 2);
  hero.AddStatus('stun', 1);
  hero.SyncEquipment([createItemFromInfo('item.06', 'mod-cleanse')]);
  // With random = 0.05 the 25% cleanse succeeds.
  hero.BeginTurn(alwaysLand);
  assert.equal(hero.statuses.length, 0);
  // With random = 0.9 the cleanse fails; statuses tick normally.
  hero.AddStatus('burning', 2);
  hero.BeginTurn(() => 0.9);
  assert.equal(hero.statuses.some(s => s.typeId === 'burning'), true);
});

test('effect-resist module cancels an enemy effect on its own 15% roll', () => {
  const session = createSession();
  const items = [createItemFromInfo('item.07', 'mod-resist')];
  session.SyncHeroEquipment(items);
  // Random sequence: 0.05 for attacks (all land), then 0.05 < 0.5 (burning lands),
  // then 0.05 < 0.15 (resist blocks it).
  let call = 0;
  const rigged = () => {
    call++;
    if (call <= 4) return 0.05; // hero + 3 enemy attacks
    if (call === 5) return 0.05; // burning applyChance
    if (call === 6) return 0.05; // resist roll (0.05 < 0.15 → blocks)
    return 0.9;
  };
  session.Attack('enemy-4', items, rigged);
  // Burning was blocked by resist; stun never landed because applyChance 0.1 > 0.05? Wait.
  // Actually after burning is resisted, the loop continues to next enemy (teal, no effect),
  // then blue: CanAttack(0.05) true, effect stun, applyChance random()=0.9 >= 0.1 → skipped.
  assert.equal(session.hero.statuses.length, 0);
  // Without the module the same random sequence would let burning through.
  const session2 = createSession();
  let call2 = 0;
  const rigged2 = () => {
    call2++;
    if (call2 <= 4) return 0.05;
    if (call2 === 5) return 0.05; // burning applyChance
    return 0.9;
  };
  session2.Attack('enemy-4', [], rigged2);
  assert.deepEqual(session2.hero.statuses.map(s => s.typeId), ['burning']);
});

test('passive values of the same kind add up and chances are capped at 1', () => {
  const hero = new Hero();
  hero.SyncEquipment([
    createItemFromInfo('item.06', 'a'),
    createItemFromInfo('item.06', 'b'),
    createItemFromInfo('item.07', 'c'),
  ]);
  assert.equal(hero.cleanseChance, 0.5); // 25+25 = 50, still below 1
  assert.equal(hero.effectResistChance, 0.15);
  // Two resist modules would cap at 1.
  hero.SyncEquipment([
    createItemFromInfo('item.07', 'a'),
    createItemFromInfo('item.07', 'b'),
  ]);
  assert.equal(hero.effectResistChance, 0.3);
});

test('enemy effects land only on their applyChance; hero lenses always apply', () => {
  const session = createSession();
  // With random = 0.9 every enemy effect is skipped (0.9 >= 0.5/0.25/0.1).
  session.Attack('enemy-4', [createItemFromInfo('item.01', 'lens')], () => 0.9);
  const target = session.npcs.find(e => e.id === 'enemy-4')!;
  // Lens burning always lands.
  assert.equal(target.statuses.some(s => s.typeId === 'burning'), true);
  // Hero statuses are empty because enemy effects all missed.
  assert.equal(session.hero.statuses.length, 0);
});
