import { Enemy, TypeEnemyParameter, TypeEnemyRole, TypeSupportParameter } from './enemy';
import { TypeBattleLayer } from './placement';
import { createEnemyVisualLayout } from './visual-info';
const roleLabels: Readonly<Record<TypeEnemyRole, string>> = Object.freeze({ [TypeEnemyRole.Shooter]: 'Стрелок', [TypeEnemyRole.Hero]: 'Герой', [TypeEnemyRole.Healer]: 'Поддержка', [TypeEnemyRole.Guard]: 'Щитовик', [TypeEnemyRole.Boss]: 'Босс' });
export function createCombatantView(enemy: Enemy) {
  return { id: enemy.id, title: enemy.EnemyInfo.Name + ' · ' + enemy.id, tint: enemy.alive ? 0x79e0b6 : 0x777777,
    health: enemy.GetParameter(TypeEnemyParameter.Health), maxHealth: enemy.EnemyInfo.Parameters.find(p => p.Type === TypeEnemyParameter.Health)!.Value,
    shield: enemy.GetParameter(TypeEnemyParameter.Shield), maxShield: enemy.EnemyInfo.Parameters.find(p => p.Type === TypeEnemyParameter.Shield)!.Value,
    statuses: enemy.statuses,
    parameters: [...enemy.Parameters.map(p => ({ type: p.Type, label: p.Type === TypeEnemyParameter.Health ? 'Здоровье' : 'Щит', value: String(p.Value) })),
      ...enemy.EnemyInfo.CombatParameters.filter(p => p.Value !== 1).map(p => ({ type: p.Type, label: 'Множитель урона', value: String(p.Value) })),
      ...enemy.EnemyInfo.SupportParameters.map(p => ({ type: p.Type, label: ({ [TypeSupportParameter.Healing]: 'Лечение HP', [TypeSupportParameter.ShieldRestore]: 'Восстановление щита', [TypeSupportParameter.DamageAura]: 'Аура: урон союзников ×', [TypeSupportParameter.DefenseAura]: 'Аура: входящий урон ÷' })[p.Type], value: String(p.Value) })),
      ...(enemy.EnemyInfo.role === TypeEnemyRole.Guard ? [{ type: 'guard', label: 'Провокация', value: enemy.guardActive ? 'Активна в доступной линии' : 'Щит разрушен / восстанавливается' }] : []),
      ...enemy.statuses.map(s => ({ type: s.typeId, label: s.name + ' · ходов', value: String(s.remainingTurns) })),
      { type: enemy.EnemyInfo.Placement.Type, label: 'Размещение', value: enemy.layer === TypeBattleLayer.Ground ? 'Наземный' : 'Воздушный' },
      { type: 'role', label: 'Тип', value: roleLabels[enemy.EnemyInfo.role] },
      { type: 'state', label: 'Состояние', value: enemy.alive ? 'Жив' : 'Погиб' }] };
}
export function createNPCView(enemy: Enemy) {
  return { ...createCombatantView(enemy), visual: createEnemyVisualLayout(enemy.EnemyInfo, enemy.guardActive) };
}
