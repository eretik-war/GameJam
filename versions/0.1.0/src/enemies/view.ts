import { Enemy, TypeEnemyParameter, TypeEnemyRole } from './enemy';
import { TypeBattleLayer } from './placement';
import { createEnemyVisualLayout } from './visual-info';
const roleLabels: Readonly<Record<TypeEnemyRole, string>> = Object.freeze({ [TypeEnemyRole.Shooter]: 'Стрелок' });
export function createNPCView(enemy: Enemy) {
  return { id: enemy.id, title: enemy.EnemyInfo.Name + ' · ' + enemy.id, tint: enemy.alive ? 0x79e0b6 : 0x777777,
    health: enemy.GetParameter(TypeEnemyParameter.Health), maxHealth: enemy.EnemyInfo.Parameters.find(p => p.Type === TypeEnemyParameter.Health)!.Value,
    shield: enemy.GetParameter(TypeEnemyParameter.Shield), maxShield: enemy.EnemyInfo.Parameters.find(p => p.Type === TypeEnemyParameter.Shield)!.Value,
    visual: createEnemyVisualLayout(enemy.EnemyInfo), statuses: enemy.statuses,
    parameters: [...enemy.Parameters.map(p => ({ type: p.Type, label: p.Type === TypeEnemyParameter.Health ? 'Здоровье' : 'Щит', value: String(p.Value) })),
      ...enemy.statuses.map(s => ({ type: s.typeId, label: s.name + ' · ходов', value: String(s.remainingTurns) })),
      { type: enemy.EnemyInfo.Placement.Type, label: 'Размещение', value: enemy.layer === TypeBattleLayer.Ground ? 'Наземный' : 'Воздушный' },
      { type: 'role', label: 'Тип', value: roleLabels[enemy.EnemyInfo.role] },
      { type: 'state', label: 'Состояние', value: enemy.alive ? 'Жив' : 'Погиб' }] };
}
