import { Burning } from './burning';
import type { IStatusEffect } from './status-effect';
const effects: readonly IStatusEffect[] = Object.freeze([new Burning()]);
export function getStatusEffect(typeId: string): IStatusEffect {
  const effect = effects.find(effect => effect.typeId === typeId);
  if (!effect) throw new Error('Unknown status effect');
  return effect;
}
