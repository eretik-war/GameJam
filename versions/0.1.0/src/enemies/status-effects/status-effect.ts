import type { Enemy } from '../enemy';
export interface IStatusEffect {
  readonly typeId: string;
  readonly name: string;
  readonly imageUrl: string;
  /** One short player-facing sentence: what the effect does. Owned by the effect, not by the card. */
  readonly description: string;
  /** A debuff can be cleansed by the hero's cleansing module; a buff stays. */
  readonly negative: boolean;
  /** Chance that an enemy attack lands this effect; the hero's own lens applies its effect always. */
  readonly applyChance: number;
  Tick(target: Enemy): void;
}
export interface ActiveStatus { readonly effect: IStatusEffect; remainingTurns: number }
