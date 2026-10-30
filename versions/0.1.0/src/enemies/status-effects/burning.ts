import type { Enemy } from '../enemy';
import type { IStatusEffect } from './status-effect';
/** Demonstration effect: fixed damage, never configured by an attack. */
export class Burning implements IStatusEffect {
  readonly typeId = 'burning';
  readonly name = 'Горение';
  readonly imageUrl = 'images/fire.jpg';
  readonly damage = 3;
  constructor() { Object.freeze(this); }
  Tick(target: Enemy): void { target.TakeDamage(this.damage); }
}
