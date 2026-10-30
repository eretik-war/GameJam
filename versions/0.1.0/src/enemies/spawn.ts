import assets from '../../../../assets/enemies/spawn-points.json';
import { createEnemyFromInfo, type Enemy, type EnemyInfo } from './enemy';
import { createLayerParameter, TypeSpawnPointParameter } from './placement';

export function createSpawnPointInfo(asset: typeof assets[number]) {
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(asset.id) || ![asset.x, asset.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1) ||
    asset.placement?.type !== TypeSpawnPointParameter.Layer) throw new Error('Invalid spawn point');
  return Object.freeze({ id: asset.id, x: asset.x, y: asset.y,
    Placement: createLayerParameter(TypeSpawnPointParameter.Layer, asset.placement.value) });
}
export type SpawnPointInfo = ReturnType<typeof createSpawnPointInfo>;
export const spawnPoints: readonly SpawnPointInfo[] = Object.freeze(assets.map(createSpawnPointInfo));
if (new Set(spawnPoints.map(p => p.id)).size !== spawnPoints.length) throw new Error('Duplicate spawn point');
export function getSpawnPoint(id: string): SpawnPointInfo {
  const point = spawnPoints.find(p => p.id === id);
  if (!point) throw new Error(`Unknown spawn point: ${id}`);
  return point;
}
export function canSpawn(info: EnemyInfo, point: SpawnPointInfo): boolean { return info.Placement.Value === point.Placement.Value; }
export function spawnEnemy(info: EnemyInfo, id: string, point: SpawnPointInfo, occupied: ReadonlySet<string>): Enemy {
  if (!canSpawn(info, point)) throw new Error('Enemy and spawn layers do not match');
  if (occupied.has(point.id)) throw new Error('Spawn point is occupied');
  return createEnemyFromInfo(info, id);
}
