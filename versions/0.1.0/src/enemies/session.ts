import { Enemy, enemyCatalog, createEnemyFromInfo, TypeEnemyParameter } from './enemy';
import { canSpawn, getSpawnPoint, spawnEnemy, spawnPoints } from './spawn';

export type EnemyDeployment = Readonly<{ enemyId: string; spawnPointId: string }>;
export class EnemySession {
  readonly #placements = new Map<string, string>();
  constructor(readonly npcs: readonly Enemy[], public turn = 1, public selectedId = npcs[0]?.id ?? '', deployments?: readonly EnemyDeployment[]) {
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
  Select(id: string): void { if (!this.npcs.some(e => e.id === id)) throw new Error('Unknown enemy'); this.selectedId = id; }
  EndTurn(): void { if (!Number.isSafeInteger(this.turn + 1)) throw new Error('Turn overflow'); this.npcs.forEach(e => e.BeginTurn()); this.turn++; }
  Save(): string { return JSON.stringify({ schemaVersion: 2, turn: this.turn, selectedId: this.selectedId,
    enemies: this.npcs.map(e => ({ ...e.Save(), spawnPointId: this.#placements.get(e.id) ?? null })) }); }
}
export function createSession(): EnemySession {
  const occupied = new Set<string>();
  const deployments: EnemyDeployment[] = [];
  let variant = 0;
  const enemies = spawnPoints.flatMap(point => {
    const eligible = enemyCatalog.filter(info => canSpawn(info, point));
    if (!eligible.length) return []; // No airborne types yet: air points remain vacant.
    const enemy = spawnEnemy(eligible[variant++ % eligible.length]!, `enemy-${point.id.slice('spawn-'.length)}`, point, occupied);
    occupied.add(point.id); deployments.push({ enemyId: enemy.id, spawnPointId: point.id });
    return [enemy];
  });
  return new EnemySession(enemies, 1, enemies[0]!.id, deployments);
}
export function loadSession(text: string): EnemySession {
  if (text.length > 100000) throw new Error('Save too large');
  const data = JSON.parse(text);
  if (data?.schemaVersion !== 2 || !Number.isSafeInteger(data.turn) || data.turn < 1 || typeof data.selectedId !== 'string' || !Array.isArray(data.enemies) || data.enemies.length < 1 || data.enemies.length > 100) throw new Error('Invalid enemy save');
  const ids = new Set<string>();
  const enemies = data.enemies.map((entry: any) => {
    if (!entry || ids.has(entry.id)) throw new Error('Invalid enemy');
    const enemy = createEnemyFromInfo(entry.typeId, entry.id); ids.add(entry.id);
    const info = enemy.EnemyInfo;
    if (!Array.isArray(entry.Parameters) || entry.Parameters.length !== 2) throw new Error('Invalid parameters');
    const seen = new Set();
    for (const p of entry.Parameters) {
      if (!p || !Object.values(TypeEnemyParameter).includes(p.Type) || seen.has(p.Type) || typeof p.Value !== 'number' || !Number.isFinite(p.Value) || p.Value < 0 || (p.Type === TypeEnemyParameter.Health && p.Value > info.Parameters.find(parameter => parameter.Type === TypeEnemyParameter.Health)!.Value)) throw new Error('Invalid parameter');
      seen.add(p.Type); enemy.ChangeParameter(p.Type, p.Value - enemy.GetParameter(p.Type));
    }
    if (!Array.isArray(entry.statuses) || entry.statuses.length > 100) throw new Error('Invalid statuses');
    const statusIds = new Set();
    for (const s of entry.statuses) {
      if (!s || statusIds.has(s.typeId) || !enemy.alive) throw new Error('Invalid status');
      statusIds.add(s.typeId); enemy.AddStatus(s.typeId, s.remainingTurns);
    }
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
  return new EnemySession(enemies, data.turn, data.selectedId, deployments);
}

