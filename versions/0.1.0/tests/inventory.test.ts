import test from 'node:test';
import assert from 'node:assert/strict';
import { InventorySession, SlotAddress, TypeGameStage, TypeInventoryArea } from '../src/domain/inventory';
import { createItemFromInfo, itemInfos } from '../src/domain/items';
import { createItemView, visualItemInfos } from '../src/presentation/item-view';

const equipment = (index: number): SlotAddress => ({ area: TypeInventoryArea.Equipment, index });
const storage = (index: number): SlotAddress => ({ area: TypeInventoryArea.Storage, index });
function reward(session: InventorySession): void { session.FinishCombat(() => 0); session.ChooseReward(session.offers[0]!); }
function snapshot(session: InventorySession): string {
  return JSON.stringify([session.stage, session.battle, session.offers, session.slots(TypeInventoryArea.Equipment), session.slots(TypeInventoryArea.Storage)]);
}

test('inventory starts empty in combat; rewards are unique and accepted exactly once', () => {
  const session = new InventorySession();
  assert.equal(session.stage, TypeGameStage.Combat);
  assert.equal(session.canMove, false);
  assert.equal(session.slots(TypeInventoryArea.Equipment).length, 3);
  assert.equal(session.slots(TypeInventoryArea.Storage).length, 12);
  assert.equal(session.storedCount, 0);
  session.FinishCombat(() => 0.999999);
  assert.equal(new Set(session.offers).size, 3);
  assert.throws(() => session.FinishCombat());
  assert.throws(() => session.StartCombat());
  const offers = [...session.offers];
  assert.throws(() => session.ChooseReward('unknown'));
  session.ChooseReward(offers[1]!);
  assert.equal(session.itemAt(storage(0))!.typeId, offers[1]);
  assert.equal(session.stage, TypeGameStage.Preparation);
  assert.equal(session.offers.length, 0);
  assert.throws(() => session.ChooseReward(offers[0]!));
  session.StartCombat();
  assert.equal(session.battle, 2);
  assert.equal(session.canMove, false);
  assert.throws(() => session.StartCombat());
});

test('moves and swaps preserve every instance across storage and all equipment slots', () => {
  const session = new InventorySession();
  reward(session); const first = session.itemAt(storage(0))!;
  session.Move(storage(0), equipment(0));
  session.StartCombat(); reward(session); const second = session.itemAt(storage(0))!;
  session.Move(storage(0), equipment(0));
  assert.equal(session.itemAt(equipment(0)), second);
  assert.equal(session.itemAt(storage(0)), first);
  session.Move(equipment(0), equipment(2));
  session.Move(storage(0), storage(11));
  session.Move(equipment(2), storage(11));
  assert.equal(session.itemAt(storage(11)), second);
  assert.equal(session.itemAt(equipment(2)), first);
  session.Move(equipment(2), equipment(2));
  const ids = [...session.slots(TypeInventoryArea.Equipment), ...session.slots(TypeInventoryArea.Storage)].filter(Boolean);
  assert.deepEqual(ids.sort(), [first.id, second.id].sort());
});

test('combat, invalid addresses and empty sources never modify placement', () => {
  const session = new InventorySession(); reward(session);
  const before = snapshot(session);
  for (const target of [storage(-1), storage(12), storage(0.5), equipment(3), { area: 'unknown', index: 0 } as unknown as SlotAddress]) {
    assert.throws(() => session.Move(storage(0), target));
    assert.equal(snapshot(session), before);
  }
  assert.throws(() => session.Move(storage(1), equipment(0)));
  assert.equal(snapshot(session), before);
  session.StartCombat();
  const combat = snapshot(session);
  assert.throws(() => session.Move(storage(0), equipment(0)));
  assert.equal(snapshot(session), combat);
  session.FinishCombat(() => 0);
  assert.throws(() => session.Move(storage(0), equipment(0)));
});

test('full storage disables rewards; preparation can resume and free a pocket', () => {
  const session = new InventorySession();
  for (let i = 0; i < 12; i++) { reward(session); session.StartCombat(); }
  assert.equal(session.storageFull, true);
  session.FinishCombat(() => 0);
  const before = snapshot(session);
  assert.throws(() => session.ChooseReward(session.offers[0]!));
  assert.equal(snapshot(session), before);
  session.ContinueWithoutReward();
  session.Move(storage(3), equipment(1));
  assert.equal(session.storedCount, 11);
  session.StartCombat(); reward(session);
  assert.equal(session.storedCount, 12);
  assert.ok(session.itemAt(storage(3)));
  assert.ok(session.itemAt(equipment(1)));
  assert.throws(() => session.ContinueWithoutReward());
});

test('failed random draw is atomic; repeated types use shared immutable Info and separate IDs', () => {
  const session = new InventorySession(); const before = snapshot(session);
  let calls = 0;
  assert.throws(() => session.FinishCombat(() => ++calls === 3 ? NaN : 0));
  assert.equal(snapshot(session), before);
  for (const value of [-0.1, 1, Infinity]) assert.throws(() => session.FinishCombat(() => value));
  reward(session); const a = session.itemAt(storage(0))!;
  session.StartCombat(); reward(session); const b = session.itemAt(storage(1))!;
  assert.notEqual(a.id, b.id);
  assert.equal(a.ItemInfo, b.ItemInfo);
  assert.ok(Object.isFrozen(a.ItemInfo));
  assert.ok(Object.isFrozen(session.slots(TypeInventoryArea.Storage)));
  assert.ok(Object.isFrozen(session.offers));
  assert.throws(() => createItemFromInfo('unknown', 'id'));
  assert.throws(() => createItemFromInfo('item.01', ''));
  assert.deepEqual(itemInfos.map(i => i.typeId).sort(), visualItemInfos.map(i => i.typeId).sort());
  assert.equal(itemInfos.length, 4);
  assert.equal(new Set(visualItemInfos.map(i => i.image)).size, 4);
  for (const info of itemInfos) assert.equal(createItemView(info.typeId).title, info.Name);
});
