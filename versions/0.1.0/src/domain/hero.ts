import asset from '../../../../assets/heroes/player.json';
import { Enemy, createEnemyInfoFromAsset } from '../enemies/enemy';
import type { Item } from './items';
import { Parameter } from './parameters';
export enum TypeCombatParameter { HeroDamage = 'hero-damage', EnemyDamage = 'enemy-damage' }
export const heroInfo = createEnemyInfoFromAsset(asset);
if (asset.damage < 0 || asset.enemyDamage < 0) throw new Error('Invalid combat damage');
export const heroCombatInfo = Object.freeze({ typeId: heroInfo.typeId, Parameters: Object.freeze([
  Object.freeze(new Parameter(TypeCombatParameter.HeroDamage, asset.damage)),
  Object.freeze(new Parameter(TypeCombatParameter.EnemyDamage, asset.enemyDamage)),
]) });
function combatParameter(type: TypeCombatParameter): number { return heroCombatInfo.Parameters.find(p => p.Type === type)!.Value; }
/** Shared combatant behavior: parameters, shield, statuses and damage belong to Enemy. */
export class Hero extends Enemy {
  constructor() { super('hero-player', heroInfo); }
  get HeroInfo() { return this.EnemyInfo; }
  AttackDamage(items: readonly (Item | null)[]): number {
    return combatParameter(TypeCombatParameter.HeroDamage) + items.reduce((sum, item) => sum + (item?.ItemInfo.attackBonus ?? 0), 0);
  }
}
export const enemyDamage = combatParameter(TypeCombatParameter.EnemyDamage);
