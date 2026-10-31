import { type Enemy, TypeEnemyParameter } from '../enemies/enemy';
import { assertFinite } from './parameters';
import type { Item } from './items';
import { TypeCombatItemTrait } from './combat-items';
export function combatTraitValue(items: readonly (Item | null)[], type: TypeCombatItemTrait): number {
  return items.reduce((sum, item) => sum + (item?.ItemInfo.combatTrait?.Type === type ? item.ItemInfo.combatTrait.Value : 0), 0);
}
export function equippedAttackDamage(target: Enemy, baseDamage: number, items: readonly (Item | null)[]): number {
  assertFinite(baseDamage);
  if (baseDamage < 0) throw new Error('Negative attack damage');
  const shieldFactor = 1 + combatTraitValue(items, TypeCombatItemTrait.ShieldDamage);
  const absorbed = Math.min(target.GetParameter(TypeEnemyParameter.Shield), baseDamage * shieldFactor);
  const healthDamage = Math.max(0, baseDamage - absorbed / shieldFactor);
  // Feed one effective hit to the existing parameter owner; overflow consumes base damage only once.
  return absorbed + healthDamage * (1 + combatTraitValue(items, TypeCombatItemTrait.HealthDamage));
}
export function transferEquippedStatus(hero: Enemy, target: Enemy, items: readonly (Item | null)[], random: () => number): boolean {
  const chance = Math.min(1, combatTraitValue(items, TypeCombatItemTrait.Transfer));
  if (!hero.alive || !target.alive || chance <= 0 || random() >= chance) return false;
  return hero.TransferNegativeStatus(target);
}
export function avoidsEquippedAttack(hero: Enemy, items: readonly (Item | null)[], random: () => number): boolean {
  const chance = Math.min(1, combatTraitValue(items, TypeCombatItemTrait.Dodge));
  return hero.alive && chance > 0 && random() < chance;
}
