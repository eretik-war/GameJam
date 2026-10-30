import { type Enemy } from '../enemy';
import type { IStatusEffect } from './status-effect';
export class Stun implements IStatusEffect {
  readonly typeId = 'stun';
  readonly name = 'Оглушение';
  readonly imageUrl = 'images/stun.jpg';
  
  constructor() { Object.freeze(this); }
  Tick(_target: Enemy): void {  }
}


