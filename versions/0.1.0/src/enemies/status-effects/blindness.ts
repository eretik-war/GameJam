import { type Enemy } from '../enemy';
import type { IStatusEffect } from './status-effect';
export class Blindness implements IStatusEffect {
  readonly typeId = 'blindness';
  readonly name = 'Ослепление';
  readonly imageUrl = 'images/blindness.png';
  readonly negative = true;
  readonly applyChance = 0.25;
  readonly description = `Ослепление: половина атак мимо. Накладывается с шансом ${Math.round(this.applyChance * 100)}%.`;

  constructor() { Object.freeze(this); }
  Tick(_target: Enemy): void {  }
}
