import { Parameter, assertFinite } from '../domain/parameters';
import { getStatusEffect } from './status-effects/catalog';
import type { ActiveStatus } from './status-effects/status-effect';
export enum TypeEnemyParameter { Health = 'health', Shield = 'shield' }
export class EnemyInfo {
  readonly Parameters: readonly Readonly<Parameter<TypeEnemyParameter>>[];
  constructor(readonly typeId: string, readonly Name: string, health: number, shield: number, readonly imageUrl: string) {
    assertFinite(health); assertFinite(shield);
    if (!typeId || !Name || health <= 0 || shield < 0) throw new Error('Invalid enemy info');
    this.Parameters = Object.freeze([new Parameter(TypeEnemyParameter.Health, health), new Parameter(TypeEnemyParameter.Shield, shield)].map(p => Object.freeze(p)));
    Object.freeze(this);
  }
}
export class Enemy {
  readonly #parameters: Parameter<TypeEnemyParameter>[];
  readonly #statuses: ActiveStatus[] = [];
  constructor(readonly id: string, readonly EnemyInfo: EnemyInfo) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(id)) throw new Error('Invalid enemy ID');
    this.#parameters = EnemyInfo.Parameters.map(p => new Parameter(p.Type, p.Value));
  }
  get typeId(): string { return this.EnemyInfo.typeId; }
  get Parameters() { return this.#parameters.map(p => Object.freeze(new Parameter(p.Type, p.Value))); }
  get statuses() { return this.#statuses.map(s => Object.freeze({ typeId: s.effect.typeId, name: s.effect.name, remainingTurns: s.remainingTurns })); }
  GetParameter(type: TypeEnemyParameter): number { return this.#parameters.find(p => p.Type === type)!.Value; }
  get alive(): boolean { return this.GetParameter(TypeEnemyParameter.Health) > 0; }
  ChangeParameter(type: TypeEnemyParameter, delta: number): void {
    assertFinite(delta);
    const p = this.#parameters.find(p => p.Type === type);
    if (!p) throw new Error('Unknown enemy parameter');
    const next = p.Value + delta; assertFinite(next);
    p.Value = Math.max(0, type === TypeEnemyParameter.Health ? Math.min(next, this.EnemyInfo.Parameters.find(p => p.Type === type)!.Value) : next);
  }
  TakeDamage(damage: number): void {
    assertFinite(damage); if (damage < 0) throw new Error('Negative damage');
    if (!this.alive) return;
    const absorbed = Math.min(damage, this.GetParameter(TypeEnemyParameter.Shield));
    this.ChangeParameter(TypeEnemyParameter.Shield, -absorbed);
    this.ChangeParameter(TypeEnemyParameter.Health, -(damage - absorbed));
    if (!this.alive) this.#statuses.length = 0;
  }
  AddStatus(typeId: string, turns: number): void {
    const effect = getStatusEffect(typeId);
    if (!Number.isSafeInteger(turns) || turns <= 0) throw new Error('Invalid duration');
    if (!this.alive) return;
    const existing = this.#statuses.find(s => s.effect.typeId === typeId);
    if (existing) {
      if (!Number.isSafeInteger(existing.remainingTurns + turns)) throw new Error('Duration overflow');
      existing.remainingTurns += turns;
    } else this.#statuses.push({ effect, remainingTurns: turns });
  }
  BeginTurn(): void {
    for (const status of [...this.#statuses]) {
      if (!this.alive) break;
      status.effect.Tick(this); status.remainingTurns--;
    }
    for (let i = this.#statuses.length - 1; i >= 0; i--) if (!this.alive || this.#statuses[i]!.remainingTurns === 0) this.#statuses.splice(i, 1);
  }
  Save() { return { id: this.id, typeId: this.typeId, Parameters: this.Parameters, statuses: this.statuses.map(s => ({ typeId: s.typeId, remainingTurns: s.remainingTurns })) }; }
}
export const demoEnemyInfo = new EnemyInfo('enemy.trainee', 'Противник', 30, 8, '');

