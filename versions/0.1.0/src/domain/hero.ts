import asset from '../../../../assets/heroes/player.json';
import { Enemy, createEnemyInfoFromAsset, TypeEnemyParameter } from '../enemies/enemy';
import { getAttackInfo, type AttackEffect } from '../enemies/attack';
import type { Item } from './items';
import { TypeItemPassive } from './items';
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
  /** Active slots as the session last saw them; every passive reads this snapshot. */
  #equipment: readonly (Item | null)[] = Object.freeze([]);
  #shieldBonus = 0;
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
  /** Passive values of one kind add up; chances stop at 1 so two modules never exceed certainty. */
  PassiveValue(kind: TypeItemPassive): number {
    let sum = 0;
    for (const item of this.#equipment) if (item?.ItemInfo.passive?.kind === kind) sum += item.ItemInfo.passive.value;
    return kind === TypeItemPassive.Cleanse || kind === TypeItemPassive.EffectResist ? Math.min(1, sum) : sum;
  }
  get regenerationPerTurn(): number { return this.PassiveValue(TypeItemPassive.Regeneration); }
  get cleanseChance(): number { return this.PassiveValue(TypeItemPassive.Cleanse); }
  get effectResistChance(): number { return this.PassiveValue(TypeItemPassive.EffectResist); }
  /** The shield module raises the ceiling, so a synced bonus is both max and current shield. */
  override get maxShield(): number { return super.maxShield + this.#shieldBonus; }
  /** Idempotent: keeps the equipment snapshot and moves the current shield with the module bonus. */
  SyncEquipment(items: readonly (Item | null)[]): void {
    this.#equipment = Object.freeze([...items]);
    const bonus = this.PassiveValue(TypeItemPassive.Shield);
    const delta = bonus - this.#shieldBonus;
    this.#shieldBonus = bonus;
    const current = this.GetParameter(TypeEnemyParameter.Shield);
    const next = Math.max(0, Math.min(current + delta, this.maxShield));
    if (next !== current) this.ChangeParameter(TypeEnemyParameter.Shield, next - current);
  }
  /** Start of the hero's turn: the cleansing module may drop the debuffs, then the regeneration module heals. */
  override BeginTurn(random: () => number = Math.random): void {
    if (!this.alive) return;
    const cleanse = this.cleanseChance;
    if (cleanse > 0 && random() < cleanse) this.RemoveNegativeStatuses();
    super.BeginTurn();
    if (!this.alive) return;
    const regeneration = this.regenerationPerTurn;
    if (regeneration > 0) this.ChangeParameter(TypeEnemyParameter.Health, regeneration);
  }
}
