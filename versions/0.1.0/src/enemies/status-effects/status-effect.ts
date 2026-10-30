import type { Enemy } from '../enemy';
export interface IStatusEffect {
  readonly typeId: string;
  readonly name: string;
  Tick(target: Enemy): void;
}
export interface ActiveStatus { readonly effect: IStatusEffect; remainingTurns: number }
