import type { Enemy } from '../enemy';
import { TypeEnemyParameter } from '../enemy-parameters';
import type { IStatusEffect } from './status-effect';
export class Regeneration implements IStatusEffect {
  readonly typeId = 'regeneration';
  readonly name = 'Регенерация';
  readonly imageUrl = 'images/regeneration.png';
  readonly healing = 3;
  /** A buff: the cleansing module never removes it, and it has no enemy attack to land from. */
  readonly negative = false;
  readonly applyChance = 1;
  readonly description = `Регенерация: +${this.healing} HP в начале хода`;
  constructor() { Object.freeze(this); }
  Tick(target: Enemy): void { target.ChangeParameter(TypeEnemyParameter.Health, this.healing); }
}
