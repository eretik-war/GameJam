import type { Enemy } from '../enemy';
import type { IStatusEffect } from './status-effect';
/** Demonstration effect: fixed damage, never configured by an attack. */
export class Burning implements IStatusEffect {
  readonly typeId = 'burning';
  readonly name = 'Горение';
  readonly imageUrl = 'images/fire.png';
  readonly damage = 3;
  readonly negative = true;
  readonly applyChance = 0.5;
  readonly description = `Горение: ${this.damage} урона в начале хода. Накладывается с шансом ${Math.round(this.applyChance * 100)}%.`;
  constructor() { Object.freeze(this); }
  Tick(target: Enemy): void { target.TakeDamage(this.damage); }
}
