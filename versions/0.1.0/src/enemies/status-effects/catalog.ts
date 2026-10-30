import { Blindness } from './blindness';
import { Stun } from './stun';
import { Regeneration } from './regeneration';
import { Burning } from './burning';
import type { IStatusEffect } from './status-effect';
export const effects: readonly IStatusEffect[] = Object.freeze([new Burning(), new Blindness(), new Stun(), new Regeneration()]);
export function getStatusEffect(typeId: string): IStatusEffect {
  const effect = effects.find(effect => effect.typeId === typeId);
  if (!effect) throw new Error('Unknown status effect');
  return effect;
}
