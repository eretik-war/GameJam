/** Shared values, separate parameter keys for enemy and spawn-point domains. */
export enum TypeBattleLayer { Ground = 'ground', Air = 'air' }
export enum TypeEnemyPlacementParameter { Layer = 'enemy-layer' }
export enum TypeSpawnPointParameter { Layer = 'spawn-layer' }
export type LayerParameter<T extends TypeEnemyPlacementParameter | TypeSpawnPointParameter> = Readonly<{ Type: T; Value: TypeBattleLayer }>;

export function createLayerParameter<T extends TypeEnemyPlacementParameter | TypeSpawnPointParameter>(Type: T, Value: unknown): LayerParameter<T> {
  if (Value !== TypeBattleLayer.Ground && Value !== TypeBattleLayer.Air) throw new Error('Unknown battle layer');
  return Object.freeze({ Type, Value });
}
