import type { Enemy } from '../enemy';
import { TypeEnemyParameter } from '../enemy-parameters';
import type { IStatusEffect } from './status-effect';
export class Regeneration implements IStatusEffect {
  readonly typeId = 'regeneration';
  readonly name = 'Регенерация';
  readonly imageUrl = 'images/regeneration.png';
  readonly healing = 3;
  constructor() { Object.freeze(this); }
  Tick(target: Enemy): void { target.ChangeParameter(TypeEnemyParameter.Health, this.healing); }
}
