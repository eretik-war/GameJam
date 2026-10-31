import type { ItemInfo } from './items';
import { assertFinite } from './parameters';

/** Combat item traits are a separate domain from the turn-based module passives. */
export enum TypeCombatItemTrait { Dodge = 'dodge', Transfer = 'transfer', ShieldDamage = 'shield-damage', HealthDamage = 'health-damage' }
export class CombatItemTrait {
  constructor(readonly Type: TypeCombatItemTrait, readonly Value: number, readonly title: string, readonly description: string) {
    assertFinite(Value);
    if (!Object.values(TypeCombatItemTrait).includes(Type) || Value <= 0) throw new Error('Invalid combat item trait');
    Object.freeze(this);
  }
}
/** Inject the common Info constructor: no runtime import cycle or duplicate item factory. */
export function createCombatItemInfos(Info: typeof ItemInfo): readonly ItemInfo[] {
  return Object.freeze([
    new Info('item.09', 'Линза уклонения', 2, undefined, undefined,
      new CombatItemTrait(TypeCombatItemTrait.Dodge, .1, '10% уклониться',
        'Добавляет урон и с шансом 10% отменяет удар противника целиком, включая его эффект. Не отменяет урон уже наложенных статусов.')),
    new Info('item.10', 'Линза переноса', 2, undefined, undefined,
      new CombatItemTrait(TypeCombatItemTrait.Transfer, .25, '25% перенести негативный эффект',
        'Добавляет урон и при попадании с шансом 25% переносит один негативный эффект с героя на цель, снимая его с героя. Сохраняет оставшуюся длительность; положительные эффекты не переносит.')),
    new Info('item.11', 'Линза разрушения щитов', 2, undefined, undefined,
      new CombatItemTrait(TypeCombatItemTrait.ShieldDamage, .25, '+25% урона по щитам',
        'Добавляет урон и увеличивает на 25% часть атаки, потраченную на щит. Урон по здоровью этим свойством не усиливается.')),
    new Info('item.12', 'Линза поражения', 2, undefined, undefined,
      new CombatItemTrait(TypeCombatItemTrait.HealthDamage, .25, '+25% урона по здоровью',
        'Добавляет урон и увеличивает на 25% часть атаки, дошедшую до здоровья. Урон по щиту этим свойством не усиливается.')),
  ]);
}
