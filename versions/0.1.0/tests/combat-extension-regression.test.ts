import test from 'node:test';
import assert from 'node:assert/strict';
import { InventorySession, TypeInventoryArea } from '../src/domain/inventory';
import { createItemFromInfo, itemInfos } from '../src/domain/items';
import { EnemySession } from '../src/enemies/session';
import { Enemy, EnemyInfo, TypeEnemyParameter } from '../src/enemies/enemy';
import { createItemHoverCard } from '../src/presentation/entity-hover-cards';
import { avoidsEquippedAttack } from '../src/domain/combat-item-rules';
const hp = (enemy: Enemy) => enemy.GetParameter(TypeEnemyParameter.Health);
const shield = (enemy: Enemy) => enemy.GetParameter(TypeEnemyParameter.Shield);
function obtain(typeId: string, roll: number) {
  const inventory = new InventorySession();
  const choice = itemInfos.findIndex(info => info.typeId === typeId);
  assert.ok(choice >= 0, `${typeId} must be registered`);
  let draw = 0;
  inventory.FinishCombat(() => draw++ === 0 ? (choice + .5) / itemInfos.length : roll);
  assert.equal(new Set(inventory.offers).size, 3);
  assert.ok(inventory.offers.includes(typeId), `${typeId} must be in post-combat rewards`);
  inventory.ChooseReward(typeId);
  inventory.Move({ area: TypeInventoryArea.Storage, index: 0 }, { area: TypeInventoryArea.Equipment, index: 0 });
  return inventory.itemAt({ area: TypeInventoryArea.Equipment, index: 0 })!;
}
function fight(attackId = 'attack.red', targetShield = 0) {
  const enemy = new Enemy('item-target', new EnemyInfo('test.item-target', 'Цель', 100, targetShield, undefined, undefined, [attackId]));
  return new EnemySession([enemy]);
}
test('damage + dodge item is rewarded, equipped and avoids the entire enemy hit below 10%', () => {
  const item = obtain('item.09', .999); assert.equal(item.ItemInfo.attackBonus, 2);
  const dodged = fight(); let index = 0;
  dodged.Attack('item-target', [item], () => [.9, .9, .099][index++] ?? .9);
  assert.equal(hp(dodged.selected), 86); assert.equal(shield(dodged.hero), 20); assert.deepEqual(dodged.hero.statuses, []);
  const hit = fight(); index = 0;
  hit.Attack('item-target', [item], () => [.9, .9, .1, .9][index++] ?? .9);
  assert.equal(shield(hit.hero), 16);
  const card = createItemHoverCard(item.typeId);
  assert.ok(card.parameters.some(parameter => parameter.label === 'Урон' && parameter.value === '+2'));
  assert.match(card.description!, /10%/);
});

test('damage + transfer item moves exactly one debuff below 25%, keeping buffs and remaining duration', () => {
  const item = obtain('item.10', .999); assert.equal(item.ItemInfo.attackBonus, 2);
  const moved = fight('attack.teal');
  moved.hero.AddStatus('regeneration', 3); moved.hero.AddStatus('blindness', 4); moved.hero.AddStatus('burning', 3);
  let index = 0;
  moved.Attack('item-target', [item], () => [.9, .249, .9][index++] ?? .9);
  assert.equal(hp(moved.selected), 86);
  assert.equal(moved.selected.statuses.find(status => status.typeId === 'blindness')?.remainingTurns, 3);
  assert.deepEqual(moved.hero.statuses.map(status => status.typeId), ['regeneration', 'burning']);
  const kept = fight('attack.teal'); kept.hero.AddStatus('blindness', 4); index = 0;
  kept.Attack('item-target', [item], () => [.9, .25, .9][index++] ?? .9);
  assert.equal(kept.hero.statuses[0]?.typeId, 'blindness'); assert.deepEqual(kept.selected.statuses, []);
  const card = createItemHoverCard(item.typeId); assert.match(card.description!, /25%/);
});

test('shield-breaker is rewarded and adds 25% only to the shield portion of a hit', () => {
  const item = obtain('item.11', .999); assert.equal(item.ItemInfo.attackBonus, 2);
  const shielded = fight('attack.teal', 100); shielded.Attack('item-target', [item], () => .9);
  assert.equal(shield(shielded.selected), 82.5); assert.equal(hp(shielded.selected), 100);
  const overflow = fight('attack.teal', 10); overflow.Attack('item-target', [item], () => .9);
  assert.equal(shield(overflow.selected), 0); assert.equal(hp(overflow.selected), 94);
  const bare = fight('attack.teal'); bare.Attack('item-target', [item], () => .9); assert.equal(hp(bare.selected), 86);
  assert.match(createItemHoverCard(item.typeId).description!, /25%/);
});

test('health-damage item is rewarded and boosts health damage by 25% without changing shield damage', () => {
  const item = obtain('item.12', .999); assert.equal(item.ItemInfo.attackBonus, 2);
  const bare = fight('attack.teal'); bare.Attack('item-target', [item], () => .9); assert.equal(hp(bare.selected), 82.5);
  const shielded = fight('attack.teal', 100); shielded.Attack('item-target', [item], () => .9);
  assert.equal(shield(shielded.selected), 86); assert.equal(hp(shielded.selected), 100);
  const overflow = fight('attack.teal', 10); overflow.Attack('item-target', [item], () => .9);
  assert.equal(hp(overflow.selected), 95); assert.equal(shield(overflow.selected), 0);
  assert.match(createItemHoverCard(item.typeId).description!, /25%/);
});

test('combat traits only use active slots, stack additively and disappear on unequip', () => {
  const shieldItem = createItemFromInfo('item.11', 'stack-a');
  const healthItem = createItemFromInfo('item.12', 'stack-b');
  const combined = fight('attack.teal', 10);
  combined.Attack('item-target', [shieldItem, healthItem], () => .9);
  assert.equal(hp(combined.selected), 90); assert.equal(shield(combined.selected), 0);
  const duplicate = fight('attack.teal', 100);
  duplicate.Attack('item-target', [shieldItem, createItemFromInfo('item.11', 'stack-c')], () => .9);
  assert.equal(shield(duplicate.selected), 76); assert.equal(hp(duplicate.selected), 100);
  duplicate.Attack('item-target', [], () => .9); assert.equal(shield(duplicate.selected), 64);
  const stored = new InventorySession(); stored.FinishCombat(() => .999); stored.ChooseReward('item.12');
  const fightWithStorage = fight('attack.teal');
  fightWithStorage.Attack('item-target', [stored.itemAt({ area: TypeInventoryArea.Equipment, index: 0 })], () => .9);
  assert.equal(hp(fightWithStorage.selected), 88);
});
test('transfer never cleanses on a miss, stun or lethal hit and never transfers a buff', () => {
  const item = createItemFromInfo('item.10', 'transfer-check');
  const miss = fight('attack.teal'); miss.hero.AddStatus('blindness', 3);
  miss.Attack('item-target', [item], () => 0); assert.equal(hp(miss.selected), 100); assert.deepEqual(miss.selected.statuses, []);
  assert.equal(miss.hero.statuses[0]?.typeId, 'blindness');
  const stunned = fight('attack.teal'); stunned.hero.AddStatus('stun', 2);
  stunned.Attack('item-target', [item], () => 0); assert.equal(hp(stunned.selected), 100); assert.equal(stunned.hero.stunned, true);
  const slain = fight('attack.teal'); slain.selected.TakeDamage(90); slain.hero.AddStatus('blindness', 3);
  slain.Attack('item-target', [item], () => .6); assert.equal(slain.selected.alive, false); assert.deepEqual(slain.selected.statuses, []);
  assert.equal(slain.hero.statuses[0]?.typeId, 'blindness');
  const buff = fight('attack.teal'); buff.hero.AddStatus('regeneration', 3);
  buff.Attack('item-target', [item], () => 0); assert.deepEqual(buff.selected.statuses, []); assert.equal(buff.hero.statuses[0]?.typeId, 'regeneration');
  const atomic = fight('attack.teal'); atomic.hero.AddStatus('blindness', 2); atomic.selected.AddStatus('blindness', Number.MAX_SAFE_INTEGER);
  const before = atomic.Save(); assert.throws(() => atomic.hero.TransferNegativeStatus(atomic.selected)); assert.equal(atomic.Save(), before);
});

test('dodge rolls match 10%, stack per equipped copy and never exceed certainty', () => {
  const session = fight('attack.teal'); const item = createItemFromInfo('item.09', 'chance-item');
  let one = 0, three = 0;
  for (let i = 0; i < 1000; i++) {
    if (avoidsEquippedAttack(session.hero, [item], () => (i + .5) / 1000)) one++;
    if (avoidsEquippedAttack(session.hero, [item, item, item], () => (i + .5) / 1000)) three++;
  }
  assert.equal(one, 100); assert.equal(three, 300);
  assert.equal(avoidsEquippedAttack(session.hero, Array(20).fill(item), () => .999), true);
  assert.equal(avoidsEquippedAttack(session.hero, [], () => { throw new Error('No needless dodge roll'); }), false);
  for (const typeId of ['item.09','item.10','item.11','item.12']) {
    const a = createItemFromInfo(typeId, 'immutable-a'), b = createItemFromInfo(typeId, 'immutable-b');
    assert.equal(a.ItemInfo,b.ItemInfo); assert.ok(Object.isFrozen(a.ItemInfo)); assert.ok(Object.isFrozen(a.ItemInfo.combatTrait));
  }
});





