import { TypeParameter, TypeNPCParameter, Parameter, RestoreParameter } from '../src/domain/parameters';
import { createNPCFromInfo } from '../src/domain/npc';
import { createLayerParameter, TypeBattleLayer, TypeEnemyPlacementParameter, TypeSpawnPointParameter, type LayerParameter } from '../src/enemies/placement';

/** Compiler assertions; this file is typechecked, never executed. */
export function verifyEnumDomains(): void {
  const npc = createNPCFromInfo('npc.trainee', 'example');
  // @ts-expect-error An action parameter is not an NPC parameter.
  npc.ChangeParameter(TypeParameter.LastPerformed, 1);
  // @ts-expect-error A raw string is not a typed enum key.
  npc.ChangeParameter('health', 1);
  // @ts-expect-error Parameter objects themselves also reject raw string keys.
  new Parameter('health', 100);
  // @ts-expect-error A restore effect must use the target's enum domain.
  npc.ApplyRestore(new RestoreParameter(TypeParameter.AllReqAction, 1));
  npc.ChangeParameter(TypeNPCParameter.Health, -1);
  // @ts-expect-error A spawn-point parameter key is not an enemy parameter key.
  const enemyLayer: LayerParameter<TypeEnemyPlacementParameter> = createLayerParameter(TypeSpawnPointParameter.Layer, TypeBattleLayer.Ground);
  void enemyLayer;
}
