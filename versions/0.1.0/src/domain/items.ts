import { assertFinite } from './parameters';
import type { AttackEffect } from '../enemies/attack';
/** Shared, immutable type data. Item instances never own presentation objects. */
export class ItemInfo {
  readonly presentationId = 'inventory-item';
  readonly interactionId = 'inventory-move';

  /** A lens adds its attack bonus and, when it has an effect, that effect to the hero's attack. */
  constructor(readonly typeId: string, readonly Name: string, readonly attackBonus = 2, readonly effect?: AttackEffect) {
    assertFinite(attackBonus);
    if (attackBonus < 0) throw new Error('Invalid item attack bonus');
    Object.freeze(this);
  }
}

export const itemInfos: readonly ItemInfo[] = Object.freeze([
  new ItemInfo('item.01', 'Линза горения', 2, Object.freeze({ typeId: 'burning', turns: 2 })),
  // The plain lens has no effect, so it adds more raw damage.
  new ItemInfo('item.02', 'Линза урона', 4),
  new ItemInfo('item.03', 'Линза оглушения', 2, Object.freeze({ typeId: 'stun', turns: 1 })),
  new ItemInfo('item.04', 'Линза ослепления', 2, Object.freeze({ typeId: 'blindness', turns: 2 })),
]);
const catalog = new Map(itemInfos.map(info => [info.typeId, info]));

export function getItemInfo(typeId: string): ItemInfo {
  const info = catalog.get(typeId);
  if (!info) throw new Error('Неизвестный тип предмета.');
  return info;
}

export class Item {
  constructor(readonly id: string, readonly ItemInfo: ItemInfo) {
    if (!id) throw new Error('Предмету нужен ID экземпляра.');
    Object.freeze(this);
  }

  get typeId(): string { return this.ItemInfo.typeId; }
}

export function createItemFromInfo(typeId: string, id: string): Item {
  return new Item(id, getItemInfo(typeId));
}
