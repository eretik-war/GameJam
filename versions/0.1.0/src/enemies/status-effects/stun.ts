import { type Enemy } from '../enemy';
import type { IStatusEffect } from './status-effect';
export class Stun implements IStatusEffect {
  readonly typeId = 'stun';
  readonly name = 'Оглушение';
  readonly imageUrl = 'images/stun.png';
  readonly negative = true;
  readonly applyChance = 0.1;
  readonly description = `Оглушение: пропуск следующей атаки. Накладывается с шансом ${Math.round(this.applyChance * 100)}%.`;

  constructor() { Object.freeze(this); }
  Tick(_target: Enemy): void {  }
}
