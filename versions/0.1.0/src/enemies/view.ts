import { Enemy, TypeEnemyParameter } from './enemy';
export function createNPCView(enemy: Enemy) {
  return { id: enemy.id, title: enemy.EnemyInfo.Name + ' · ' + enemy.id, tint: enemy.alive ? 0x79e0b6 : 0x777777,
    health: enemy.GetParameter(TypeEnemyParameter.Health), maxHealth: enemy.EnemyInfo.Parameters.find(p => p.Type === TypeEnemyParameter.Health)!.Value,
    parameters: [...enemy.Parameters.map(p => ({ type: p.Type, label: p.Type === TypeEnemyParameter.Health ? 'Здоровье' : 'Щит', value: String(p.Value) })),
      ...enemy.statuses.map(s => ({ type: s.typeId, label: s.name + ' · ходов', value: String(s.remainingTurns) })),
      { type: 'state', label: 'Состояние', value: enemy.alive ? 'Жив' : 'Погиб' }] };
}
