import asset from '../../../../assets/heroes/player.json';
import { Enemy, createEnemyInfoFromAsset } from '../enemies/enemy';
import type { Item } from './items';
export const heroInfo = createEnemyInfoFromAsset(asset);
/** Shared combatant behavior: parameters, shield, statuses and damage belong to Enemy. */
export class Hero extends Enemy {
  constructor() { super('hero-player', heroInfo); }
  get HeroInfo() { return this.EnemyInfo; }
  AttackDamage(items: readonly (Item | null)[]): number {
    return asset.damage + items.reduce((sum, item) => sum + (item?.ItemInfo.attackBonus ?? 0), 0);
  }
}
export const enemyDamage = asset.enemyDamage;
