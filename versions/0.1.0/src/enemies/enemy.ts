import { Parameter, assertFinite } from '../domain/parameters';
import { TypeEnemyParameter } from './enemy-parameters';
import { getStatusEffect } from './status-effects/catalog';
import type { ActiveStatus } from './status-effects/status-effect';
import bosses from '../../../../assets/enemies/bosses.json';
import guards from '../../../../assets/enemies/guards.json';
import healers from '../../../../assets/enemies/healers.json';
import testEnemy from '../../../../assets/enemies/test-enemy.json';
import cameraEnemies from '../../../../assets/enemies/camera-enemies.json';
import { getAttackInfo, type AttackInfo } from './attack';
import { createLayerParameter, TypeBattleLayer, TypeEnemyPlacementParameter, type LayerParameter } from './placement';
export { TypeEnemyParameter };
export enum TypeEnemyRole { Shooter = 'shooter', Hero = 'hero', Healer = 'healer', Guard = 'guard', Boss = 'boss' }
export enum TypeSupportParameter { Healing = 'healing', ShieldRestore = 'shield-restore', DamageAura = 'damage-aura', DefenseAura = 'defense-aura' }
export enum TypeSupportKind { Health = 'health', Shield = 'shield', DamageAura = 'damage-aura', DefenseAura = 'defense-aura' }
export type SupportAsset = { kind: string; value: number };
export enum TypeEnemyCombatParameter { DamageMultiplier = 'damage-multiplier' }
export class EnemyInfo {
  readonly CombatParameters: readonly Readonly<Parameter<TypeEnemyCombatParameter>>[];
  readonly SupportParameters: readonly Readonly<Parameter<TypeSupportParameter>>[];
  readonly Parameters: readonly Readonly<Parameter<TypeEnemyParameter>>[];
  readonly attackIds: readonly string[];
  /** The attack this type uses on its turn; damage and effect come from the attack asset. */
  readonly attack: AttackInfo | undefined;
  readonly Placement: LayerParameter<TypeEnemyPlacementParameter>;
  constructor(readonly typeId: string, readonly Name: string, health: number, shield: number,
    layer = TypeBattleLayer.Ground, readonly role = TypeEnemyRole.Shooter, attackIds: readonly string[] = [], support?: SupportAsset, damageMultiplier = 1) {
    assertFinite(damageMultiplier); if (damageMultiplier <= 0) throw new Error('Invalid damage multiplier');
    this.CombatParameters = Object.freeze([Object.freeze(new Parameter(TypeEnemyCombatParameter.DamageMultiplier, damageMultiplier))]);
    if ((role === TypeEnemyRole.Healer) !== !!support || (support && (!Object.values(TypeSupportKind).includes(support.kind as TypeSupportKind) || !Number.isFinite(support.value) || support.value <= 0))) throw new Error('Invalid support');
    const supportTypes: Record<TypeSupportKind, TypeSupportParameter> = { [TypeSupportKind.Health]: TypeSupportParameter.Healing, [TypeSupportKind.Shield]: TypeSupportParameter.ShieldRestore, [TypeSupportKind.DamageAura]: TypeSupportParameter.DamageAura, [TypeSupportKind.DefenseAura]: TypeSupportParameter.DefenseAura };
    this.SupportParameters = Object.freeze(support ? [Object.freeze(new Parameter(supportTypes[support.kind as TypeSupportKind], support.value))] : []);
    assertFinite(health); assertFinite(shield);
    if (!typeId || !Name || health <= 0 || shield < 0) throw new Error('Invalid enemy info');
    this.Parameters = Object.freeze([new Parameter(TypeEnemyParameter.Health, health), new Parameter(TypeEnemyParameter.Shield, shield)].map(p => Object.freeze(p)));
    attackIds.forEach(getAttackInfo);
    if (new Set(attackIds).size !== attackIds.length || !Object.values(TypeEnemyRole).includes(role)) throw new Error('Invalid enemy role or attacks');
    this.attackIds = Object.freeze([...attackIds]);
    this.attack = attackIds.length ? getAttackInfo(attackIds[0]!) : undefined;
    this.Placement = createLayerParameter(TypeEnemyPlacementParameter.Layer, layer);
    Object.freeze(this);
  }
}
export class Enemy {
  readonly #parameters: Parameter<TypeEnemyParameter>[];
  readonly #statuses: ActiveStatus[] = [];
  #guardRecoveryTurns = 0;
  get guardActive(): boolean { return this.EnemyInfo.role === TypeEnemyRole.Guard && this.alive && this.GetParameter(TypeEnemyParameter.Shield) > 0 && this.#guardRecoveryTurns === 0; }
  RestoreGuardRecovery(turns: unknown): void {
    if (!Number.isInteger(turns) || (turns as number) < -1 || (turns as number) > 2 || ((turns === -1) !== (this.GetParameter(TypeEnemyParameter.Shield) === 0))) throw new Error('Invalid guard recovery');
    this.#guardRecoveryTurns = turns as number;
  }
  #incomingDamageScale: () => number = () => 1;
  /** Session owns team auras; resolve each hit, including status damage. */
  SetIncomingDamageScale(resolve: () => number): void { this.#incomingDamageScale = resolve; }
  constructor(readonly id: string, readonly EnemyInfo: EnemyInfo) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(id)) throw new Error('Invalid enemy ID');
    this.#parameters = EnemyInfo.Parameters.map(p => new Parameter(p.Type, p.Value));
  }
  get damageMultiplier(): number { return this.EnemyInfo.CombatParameters.find(p => p.Type === TypeEnemyCombatParameter.DamageMultiplier)!.Value; }
  get typeId(): string { return this.EnemyInfo.typeId; }
  get attack(): AttackInfo | undefined { return this.EnemyInfo.attack; }
  get layer(): TypeBattleLayer { return this.EnemyInfo.Placement.Value; }
  get Parameters() { return this.#parameters.map(p => Object.freeze(new Parameter(p.Type, p.Value))); }
  get statuses() { return this.#statuses.map(s => Object.freeze({ typeId: s.effect.typeId, name: s.effect.name, imageUrl: s.effect.imageUrl, remainingTurns: s.remainingTurns })); }
  GetParameter(type: TypeEnemyParameter): number { return this.#parameters.find(p => p.Type === type)!.Value; }
  get alive(): boolean { return this.GetParameter(TypeEnemyParameter.Health) > 0; }
  /** Ceilings belong to the instance: equipment can raise a shield above the value stored in Info. */
  get maxHealth(): number { return this.EnemyInfo.Parameters.find(p => p.Type === TypeEnemyParameter.Health)!.Value; }
  get maxShield(): number { return this.EnemyInfo.Parameters.find(p => p.Type === TypeEnemyParameter.Shield)!.Value; }
  ChangeParameter(type: TypeEnemyParameter, delta: number): void {
    assertFinite(delta);
    const p = this.#parameters.find(p => p.Type === type);
    if (!p) throw new Error('Unknown enemy parameter');
    const next = p.Value + delta; assertFinite(next);
    const previous = p.Value;
    p.Value = Math.max(0, type === TypeEnemyParameter.Health ? Math.min(next, this.maxHealth) : next);
    if (this.EnemyInfo.role === TypeEnemyRole.Guard && type === TypeEnemyParameter.Shield) {
      if (p.Value === 0) this.#guardRecoveryTurns = -1;
      else if (previous === 0) this.#guardRecoveryTurns = 2;
    }
  }
  TakeDamage(damage: number): void {
    assertFinite(damage); if (damage < 0) throw new Error('Negative damage');
    if (!this.alive) return;
    damage *= this.#incomingDamageScale();
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
  /** Move the oldest debuff atomically through the two entity owners, never through Info. */
  TransferNegativeStatus(target: Enemy): boolean {
    if (!this.alive || !target.alive || target === this) return false;
    const index = this.#statuses.findIndex(status => status.effect.negative);
    if (index < 0) return false;
    const status = this.#statuses[index]!;
    target.AddStatus(status.effect.typeId, status.remainingTurns);
    this.#statuses.splice(index, 1);
    return true;
  }
  get stunned(): boolean { return this.#statuses.some(s => s.effect.typeId === 'stun'); }
  get missChance(): number { return this.#statuses.some(s => s.effect.typeId === 'blindness') ? 0.5 : 0; }
  CanAttack(random: () => number = Math.random): boolean { return this.alive && !this.stunned && random() >= this.missChance; }
  /** Cleansing removes exactly the debuffs: every effect declares whether it is one. */
  RemoveNegativeStatuses(): void {
    for (let i = this.#statuses.length - 1; i >= 0; i--) if (this.#statuses[i]!.effect.negative) this.#statuses.splice(i, 1);
  }
  BeginTurn(_random: () => number = Math.random): void {
    if (this.#guardRecoveryTurns > 0) this.#guardRecoveryTurns--;
    for (const status of [...this.#statuses]) {
      if (!this.alive) break;
      status.effect.Tick(this); status.remainingTurns--;
    }
    for (let i = this.#statuses.length - 1; i >= 0; i--) if (!this.alive || this.#statuses[i]!.remainingTurns === 0) this.#statuses.splice(i, 1);
  }
  Save() { return { ...(this.EnemyInfo.role === TypeEnemyRole.Guard ? { guardRecoveryTurns: this.#guardRecoveryTurns } : {}), id: this.id, typeId: this.typeId, Parameters: this.Parameters, statuses: this.statuses.map(s => ({ typeId: s.typeId, remainingTurns: s.remainingTurns })) }; }
}
export function createEnemyInfoFromAsset(asset: typeof testEnemy & { support?: SupportAsset; damageMultiplier?: number }): EnemyInfo {
  if (asset.parameters.length !== 2 || new Set(asset.parameters.map(p => p.type)).size !== 2 ||
    asset.parameters.some(p => !Object.values(TypeEnemyParameter).includes(p.type as TypeEnemyParameter))) throw new Error('Invalid asset parameters');
  const health = asset.parameters.find(p => p.type === TypeEnemyParameter.Health);
  const shield = asset.parameters.find(p => p.type === TypeEnemyParameter.Shield);
  if (!health || !shield || asset.placement?.type !== TypeEnemyPlacementParameter.Layer) throw new Error('Invalid enemy asset');
  const placement = createLayerParameter(TypeEnemyPlacementParameter.Layer, asset.placement.value);
  return new EnemyInfo(asset.typeId, asset.name, health.value, shield.value, placement.Value, asset.role as TypeEnemyRole, asset.attackIds, asset.support, asset.damageMultiplier);
}
export const demoEnemyInfo = createEnemyInfoFromAsset(testEnemy);
export const enemyCatalog: readonly EnemyInfo[] = Object.freeze([demoEnemyInfo, ...cameraEnemies.map(createEnemyInfoFromAsset), ...healers.map(createEnemyInfoFromAsset), ...guards.map(createEnemyInfoFromAsset), ...bosses.map(createEnemyInfoFromAsset)]);
if (new Set(enemyCatalog.map(info => info.typeId)).size !== enemyCatalog.length) throw new Error('Duplicate enemy type');
export function getEnemyInfo(typeId: string): EnemyInfo {
  const info = enemyCatalog.find(info => info.typeId === typeId);
  if (!info) throw new Error(`Unknown enemy type: ${typeId}`);
  return info;
}
export function createEnemyFromInfo(type: string | EnemyInfo, id: string): Enemy { return new Enemy(id, typeof type === 'string' ? getEnemyInfo(type) : type); }

