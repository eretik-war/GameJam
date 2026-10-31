import asset from '../../../../assets/heroes/player.json';
import { Enemy, createEnemyInfoFromAsset } from '../enemies/enemy';
import { getAttackInfo, type AttackEffect } from '../enemies/attack';
import type { Item } from './items';
import { Parameter } from './parameters';
export enum TypeCombatParameter { HeroDamage = 'hero-damage' }
export const heroInfo = createEnemyInfoFromAsset(asset);
/** Base damage belongs to the hero's own attack asset; equipped lenses add to it. */
const heroAttack = getAttackInfo(heroInfo.attackIds[0]!);
export const heroCombatInfo = Object.freeze({ typeId: heroInfo.typeId, Parameters: Object.freeze([
  Object.freeze(new Parameter(TypeCombatParameter.HeroDamage, heroAttack.damage)),
]) });
function combatParameter(type: TypeCombatParameter): number { return heroCombatInfo.Parameters.find(p => p.Type === type)!.Value; }
/** Shared combatant behavior: parameters, shield, statuses and damage belong to Enemy. */
export class Hero extends Enemy {
  constructor() { super('hero-player', heroInfo); }
  get HeroInfo() { return this.EnemyInfo; }
  AttackDamage(items: readonly (Item | null)[]): number {
    return combatParameter(TypeCombatParameter.HeroDamage) + items.reduce((sum, item) => sum + (item?.ItemInfo.attackBonus ?? 0), 0);
  }
  /** Every equipped lens contributes its effect; the same effect is applied once. */
  AttackEffects(items: readonly (Item | null)[]): readonly AttackEffect[] {
    const effects = new Map<string, AttackEffect>();
    for (const item of items) {
      const effect = item?.ItemInfo.effect;
      if (effect && !effects.has(effect.typeId)) effects.set(effect.typeId, effect);
    }
    return Object.freeze([...effects.values()]);
  }
}
