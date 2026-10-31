import { Enemy, enemyCatalog, createEnemyFromInfo, TypeEnemyParameter, TypeEnemyRole, TypeSupportParameter } from './enemy';
import { canSpawn, getSpawnPoint, spawnEnemy, spawnPoints } from './spawn';
import { getStatusEffect } from './status-effects/catalog';
import { Hero } from '../domain/hero';
import type { Item } from '../domain/items';
import { avoidsEquippedAttack, transferEquippedStatus, equippedAttackDamage } from '../domain/combat-item-rules';

export type EnemyDeployment = Readonly<{ enemyId: string; spawnPointId: string }>;
export class EnemySession {
  readonly #placements = new Map<string, string>();
  constructor(readonly npcs: readonly Enemy[], public turn = 1, public selectedId = npcs[0]?.id ?? '', deployments?: readonly EnemyDeployment[], readonly hero = new Hero()) {
    if (!Number.isSafeInteger(turn) || turn < 1 || !npcs.length || new Set(npcs.map(e => e.id)).size !== npcs.length || !npcs.some(e => e.id === selectedId)) throw new Error('Invalid enemy roster');
    this.npcs = Object.freeze([...npcs]);
    const occupied = new Set<string>();
    // Older v2 saves have no placement. Preserve every enemy; excess units stay in reserve.
    // Prioritize the selected enemy so the restored target is visible on the field.
    const resolved = deployments ?? [this.selected, ...npcs.filter(e => e.id !== selectedId)].flatMap(enemy => {
      const point = spawnPoints.find(point => canSpawn(enemy.EnemyInfo, point) && !occupied.has(point.id));
      if (!point) return [];
      occupied.add(point.id);
      return [{ enemyId: enemy.id, spawnPointId: point.id }];
    });
    occupied.clear();
    this.npcs.forEach(enemy => enemy.SetIncomingDamageScale(() => this.IncomingDamageScale));
    for (const deployment of resolved) {
      const enemy = npcs.find(e => e.id === deployment.enemyId);
      const point = getSpawnPoint(deployment.spawnPointId);
      if (!enemy || this.#placements.has(enemy.id) || occupied.has(point.id) || !canSpawn(enemy.EnemyInfo, point)) throw new Error('Invalid enemy deployment');
      occupied.add(point.id); this.#placements.set(enemy.id, point.id);
    }
  }
  get selected(): Enemy { return this.npcs.find(e => e.id === this.selectedId)!; }
  get deployed(): readonly Enemy[] { return this.npcs.filter(e => this.#placements.has(e.id)); }
  GetSpawnPoint(id: string) { const pointId = this.#placements.get(id); return pointId ? getSpawnPoint(pointId) : undefined; }
  Column(index: number): number { return this.GetSpawnPoint(this.npcs[index]?.id ?? '')?.x ?? Infinity; }
  CanTarget(id: string): boolean {
    const enemy = this.npcs.find(e => e.id === id);
    const point = this.GetSpawnPoint(id);
    const closest = Math.min(...this.deployed.filter(e => e.alive).map(e => this.GetSpawnPoint(e.id)!.x));
    const eligibleGuards = this.deployed.filter(e => e.alive && e.guardActive && this.GetSpawnPoint(e.id)!.x === closest);
    return this.hero.alive && !!enemy?.alive && !!point && point.x === closest && (!eligibleGuards.length || eligibleGuards.some(e => e.id === id));
  }
  Attack(id: string, items: readonly (Item | null)[] = [], random: () => number = Math.random): boolean {
    if (!this.CanTarget(id)) return false;
    for (const _action of this.AttackSequence(id, items, random)) { /* Timing belongs to presentation. */ }
    return true;
  }
  /** Applies one action per step, without depending on the renderer or a clock. */
  *AttackSequence(id: string, items: readonly (Item | null)[] = [], random: () => number = Math.random): Generator<string> {
    if (!this.CanTarget(id)) return;
    if (!Number.isSafeInteger(this.turn + 1)) throw new Error('Turn overflow');
    this.Select(id);
    // Equipment passives must be current before anything resolves; the renderer syncs the same way.
    this.SyncHeroEquipment(items);
    if (this.hero.CanAttack(random)) {
      this.selected.TakeDamage(equippedAttackDamage(this.selected, this.hero.AttackDamage(items), items));
      transferEquippedStatus(this.hero, this.selected, items, random);
      // Lenses add their effect to the hero's attack; a slain target keeps no statuses.
      for (const effect of this.hero.AttackEffects(items)) {
        if (!this.selected.alive) break;
        this.selected.AddStatus(effect.typeId, effect.turns);
      }
      yield this.hero.id;
    }
    const resist = this.hero.effectResistChance;
    for (const enemy of this.deployed) {
      if (!this.hero.alive) break;
      if (!enemy.CanAttack(random)) continue;
      if (enemy.EnemyInfo.role === TypeEnemyRole.Healer) {
        if (this.TryHeal(enemy)) yield enemy.id;
        continue;
      }
      if (avoidsEquippedAttack(this.hero, items, random)) continue;
      const attack = enemy.attack;
      this.hero.TakeDamage((attack?.damage ?? 0) * enemy.damageMultiplier * this.OutgoingDamageScale);
      const effect = attack?.effect;
      if (effect && this.hero.alive && !(effect.typeId === 'stun' && this.hero.stunned)
        && random() < getStatusEffect(effect.typeId).applyChance && !(resist > 0 && random() < resist)) {
        this.hero.AddStatus(effect.typeId, effect.turns);
      }
      yield enemy.id;
    }
    this.hero.BeginTurn(random); this.EndTurn();
  }
  /** The active slots own the hero's equipment: syncing them updates passives and the shield ceiling. */
  SyncHeroEquipment(items: readonly (Item | null)[]): void { this.hero.SyncEquipment(items); }
  private Aura(type: TypeSupportParameter): number {
    return Math.max(1, ...this.deployed.filter(e => e.alive).map(e => e.EnemyInfo.SupportParameters.find(p => p.Type === type)?.Value ?? 1));
  }
  get IncomingDamageScale(): number { return 1 / this.Aura(TypeSupportParameter.DefenseAura); }
  get OutgoingDamageScale(): number { return this.Aura(TypeSupportParameter.DamageAura); }
  /** Resolve immediately before each support action; stable position order breaks ties. */
  TryHeal(healer: Enemy): boolean {
    if (!healer.alive || healer.stunned || healer.EnemyInfo.role !== TypeEnemyRole.Healer || !this.GetSpawnPoint(healer.id)) return false;
    const support = healer.EnemyInfo.SupportParameters[0]!;
    const type = support.Type === TypeSupportParameter.Healing ? TypeEnemyParameter.Health : support.Type === TypeSupportParameter.ShieldRestore ? TypeEnemyParameter.Shield : undefined;
    if (!type) return false;
    const max = (enemy: Enemy) => enemy.EnemyInfo.Parameters.find(p => p.Type === type)!.Value;
    const order = (enemy: Enemy) => spawnPoints.findIndex(p => p.id === this.GetSpawnPoint(enemy.id)?.id);
    const target = this.deployed.filter(e => e.id !== healer.id && e.alive && e.GetParameter(type) < max(e))
      .sort((a,b) => a.GetParameter(type) - b.GetParameter(type) || order(a) - order(b))[0];
    if (!target) return false;
    target.ChangeParameter(type, Math.min(support.Value, max(target) - target.GetParameter(type)));
    return true;
  }
  Select(id: string): void { if (!this.npcs.some(e => e.id === id)) throw new Error('Unknown enemy'); this.selectedId = id; }
  EndTurn(): void { if (!Number.isSafeInteger(this.turn + 1)) throw new Error('Turn overflow'); this.npcs.forEach(e => e.BeginTurn()); this.turn++; }
  Save(): string { return JSON.stringify({ schemaVersion: 2, turn: this.turn, selectedId: this.selectedId,
    hero: this.hero.Save(), enemies: this.npcs.map(e => ({ ...e.Save(), spawnPointId: this.#placements.get(e.id) ?? null })) }); }
}
export function createSession(): EnemySession {
  const occupied = new Set<string>();
  const deployments: EnemyDeployment[] = [];
  let variant = 0;
  const enemies = spawnPoints.flatMap(point => {
    const eligible = enemyCatalog.filter(info => info.role === TypeEnemyRole.Shooter && canSpawn(info, point));
    if (!eligible.length) return []; // No airborne types yet: air points remain vacant.
    const enemy = spawnEnemy(eligible[variant++ % eligible.length]!, `enemy-${point.id.slice('spawn-'.length)}`, point, occupied);
    occupied.add(point.id); deployments.push({ enemyId: enemy.id, spawnPointId: point.id });
    return [enemy];
  });
  const closest = [...enemies].sort((a, b) => getSpawnPoint(deployments.find(d => d.enemyId === a.id)!.spawnPointId).x -
    getSpawnPoint(deployments.find(d => d.enemyId === b.id)!.spawnPointId).x)[0]!;
  return new EnemySession(enemies, 1, closest.id, deployments);
}
function restoreCombatant(enemy: Enemy, entry: any): void {
  const info = enemy.EnemyInfo;
  if (!entry || entry.id !== enemy.id || entry.typeId !== info.typeId || !Array.isArray(entry.Parameters) || entry.Parameters.length !== 2) throw new Error('Invalid combatant');
  const seen = new Set();
  for (const p of entry.Parameters) {
    if (!p || !Object.values(TypeEnemyParameter).includes(p.Type) || seen.has(p.Type) || typeof p.Value !== 'number' || !Number.isFinite(p.Value) || p.Value < 0 ||
      (p.Type === TypeEnemyParameter.Health && p.Value > info.Parameters.find(parameter => parameter.Type === TypeEnemyParameter.Health)!.Value)) throw new Error('Invalid parameter');
    seen.add(p.Type); enemy.ChangeParameter(p.Type, p.Value - enemy.GetParameter(p.Type));
  }
  if (info.role === TypeEnemyRole.Guard) enemy.RestoreGuardRecovery(entry.guardRecoveryTurns ?? (enemy.GetParameter(TypeEnemyParameter.Shield) > 0 ? 0 : -1));
  if (!Array.isArray(entry.statuses) || entry.statuses.length > 100) throw new Error('Invalid statuses');
  const statusIds = new Set();
  for (const s of entry.statuses) {
    if (!s || statusIds.has(s.typeId) || !enemy.alive) throw new Error('Invalid status');
    statusIds.add(s.typeId); enemy.AddStatus(s.typeId, s.remainingTurns);
  }
}
export function loadSession(text: string): EnemySession {
  if (text.length > 100000) throw new Error('Save too large');
  const data = JSON.parse(text);
  if (data?.schemaVersion !== 2 || !Number.isSafeInteger(data.turn) || data.turn < 1 || typeof data.selectedId !== 'string' || !Array.isArray(data.enemies) || data.enemies.length < 1 || data.enemies.length > 100) throw new Error('Invalid enemy save');
  const ids = new Set<string>();
  const enemies = data.enemies.map((entry: any) => {
    if (!entry || ids.has(entry.id)) throw new Error('Invalid enemy');
    const enemy = createEnemyFromInfo(entry.typeId, entry.id); ids.add(entry.id);
    restoreCombatant(enemy, entry);
    return enemy;
  });
  const hasPlacements = data.enemies.some((entry: any) => 'spawnPointId' in entry);
  let deployments: EnemyDeployment[] | undefined;
  if (hasPlacements) {
    deployments = data.enemies.flatMap((entry: any) => {
      if (entry.spawnPointId === null) return [];
      if (typeof entry.spawnPointId !== 'string') throw new Error('Invalid saved spawn point');
      return [{ enemyId: entry.id, spawnPointId: entry.spawnPointId }];
    });
  }
  const session = new EnemySession(enemies, data.turn, data.selectedId, deployments);
  if (data.hero !== undefined) restoreCombatant(session.hero, data.hero);
  return session;
}


