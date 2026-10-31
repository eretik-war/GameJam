import { assertFinite } from './parameters';
import type { AttackEffect } from '../enemies/attack';
import { createCombatItemInfos, type CombatItemTrait } from './combat-items';

/** Passive trait of an item type. Values of the same kind add up while the items are equipped. */
export enum TypeItemPassive {
  Regeneration = 'regeneration',
  Cleanse = 'cleanse',
  EffectResist = 'effect-resist',
  Shield = 'shield',
}

function describePassive(kind: TypeItemPassive, value: number): { readonly title: string; readonly description: string } {
  const percent = Math.round(value * 100);
  switch (kind) {
    case TypeItemPassive.Regeneration:
      return { title: `+${value} HP в начале хода`, description: `Модуль регенерации: восстанавливает ${value} HP в начале каждого хода героя.` };
    case TypeItemPassive.Cleanse:
      return { title: `${percent}% снять негатив`, description: `Модуль очищения: в начале хода с шансом ${percent}% снимает с героя все негативные эффекты.` };
    case TypeItemPassive.EffectResist:
      return { title: `${percent}% не получить эффект`, description: `Модуль стойкости: с шансом ${percent}% отменяет эффект, который накладывает противник.` };
    case TypeItemPassive.Shield:
      return { title: `+${value} к щиту`, description: `Модуль щита: поднимает максимум щита героя на ${value} и сразу добавляет столько же текущего щита.` };
    default:
      throw new Error('Unknown item passive');
  }
}

/** One passive trait: the kind tells the hero how to read the value, the card shows the sentence. */
export class ItemPassive {
  readonly title: string;
  readonly description: string;
  constructor(readonly kind: TypeItemPassive, readonly value: number) {
    assertFinite(value);
    if (value <= 0 || !Object.values(TypeItemPassive).includes(kind)) throw new Error('Invalid item passive');
    const text = describePassive(kind, value);
    this.title = text.title; this.description = text.description;
    Object.freeze(this);
  }
}

/** Shared, immutable type data. Item instances never own presentation objects. */
export class ItemInfo {
  readonly presentationId = 'inventory-item';
  readonly interactionId = 'inventory-move';

  /** Family definitions may live in separate files; this Info is their shared immutable contract. */
  constructor(readonly typeId: string, readonly Name: string, readonly attackBonus = 2, readonly effect?: AttackEffect, readonly passive?: ItemPassive, readonly combatTrait?: CombatItemTrait) {
    assertFinite(attackBonus);
    if (attackBonus < 0) throw new Error('Invalid item attack bonus');
    if (!passive && attackBonus <= 0) throw new Error('An item must add damage or a passive trait');
    Object.freeze(this);
  }
}

export const itemInfos: readonly ItemInfo[] = Object.freeze([
  new ItemInfo('item.01', 'Линза горения', 2, Object.freeze({ typeId: 'burning', turns: 2 })),
  // The plain lens has no effect, so it adds more raw damage.
  new ItemInfo('item.02', 'Линза урона', 4),
  new ItemInfo('item.03', 'Линза оглушения', 2, Object.freeze({ typeId: 'stun', turns: 1 })),
  new ItemInfo('item.04', 'Линза ослепления', 2, Object.freeze({ typeId: 'blindness', turns: 2 })),
  // Modules trade the attack bonus for a passive trait that works from an active slot.
  new ItemInfo('item.05', 'Модуль регенерации', 0, undefined, new ItemPassive(TypeItemPassive.Regeneration, 1)),
  new ItemInfo('item.06', 'Модуль очищения', 0, undefined, new ItemPassive(TypeItemPassive.Cleanse, 0.25)),
  new ItemInfo('item.07', 'Модуль стойкости', 0, undefined, new ItemPassive(TypeItemPassive.EffectResist, 0.15)),
  new ItemInfo('item.08', 'Модуль щита', 0, undefined, new ItemPassive(TypeItemPassive.Shield, 20)),
  ...createCombatItemInfos(ItemInfo),
]);
const catalog = new Map(itemInfos.map(info => [info.typeId, info]));
if (catalog.size !== itemInfos.length) throw new Error('Duplicate item type');

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
