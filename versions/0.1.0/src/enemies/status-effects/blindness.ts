import { type Enemy } from '../enemy';
import type { IStatusEffect } from './status-effect';
export class Blindness implements IStatusEffect {
  readonly typeId = 'blindness';
  readonly name = 'Ослепление';
  readonly imageUrl = 'images/blindness.png';

  constructor() { Object.freeze(this); }
  Tick(_target: Enemy): void {  }
}
