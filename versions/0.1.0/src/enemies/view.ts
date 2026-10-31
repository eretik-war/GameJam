import { Enemy, TypeEnemyParameter, TypeEnemyRole } from './enemy';
import type { AttackEffect } from './attack';
import { getStatusEffect } from './status-effects/catalog';
import { TypeBattleLayer } from './placement';
import { createEnemyVisualLayout } from './visual-info';
const roleLabels: Readonly<Record<TypeEnemyRole, string>> = Object.freeze({ [TypeEnemyRole.Shooter]: 'Стрелок', [TypeEnemyRole.Hero]: 'Герой' });
/** Player-facing row. `tone` is the effect type id and doubles as the damage-type colour key. */
export interface CombatRow { readonly type: string; readonly label: string; readonly value: string; readonly tone?: string }
const PLAIN_TONE = 'plain';
export function createCombatantView(enemy: Enemy, attack?: { readonly damage: number; readonly effects: readonly AttackEffect[] }) {
  const damage = attack?.damage ?? enemy.attack?.damage ?? 0;
  const effects = attack?.effects ?? (enemy.attack?.effect ? [enemy.attack.effect] : []);
  const tone = effects[0]?.typeId ?? PLAIN_TONE;
  const effectText = effects.map(effect => getStatusEffect(effect.typeId).name).join(', ') || '—';
  // Player-facing rows: current health, shield, this unit's attack and its active effects.
  const combatParameters: CombatRow[] = [...enemy.Parameters.map(p => ({ type: p.Type, label: p.Type === TypeEnemyParameter.Health ? 'Здоровье' : 'Щит', value: String(p.Value) })),
    { type: 'damage', label: 'Урон', value: String(damage), tone },
    { type: 'effect', label: 'Эффект', value: effectText, tone },
    ...enemy.statuses.map(s => ({ type: s.typeId, label: s.name + ' · ходов', value: String(s.remainingTurns), tone: s.typeId }))];
  return { id: enemy.id, name: enemy.EnemyInfo.Name, title: enemy.EnemyInfo.Name + ' · ' + enemy.id, tint: enemy.alive ? 0x79e0b6 : 0x777777,
    health: enemy.GetParameter(TypeEnemyParameter.Health), maxHealth: enemy.EnemyInfo.Parameters.find(p => p.Type === TypeEnemyParameter.Health)!.Value,
    shield: enemy.GetParameter(TypeEnemyParameter.Shield), maxShield: enemy.EnemyInfo.Parameters.find(p => p.Type === TypeEnemyParameter.Shield)!.Value,
    statuses: enemy.statuses,
    combatParameters,
    // Internal fields (type, state, placement) stay in the debug panel and are not part of the player card.
    parameters: [...combatParameters,
      { type: enemy.EnemyInfo.Placement.Type, label: 'Размещение', value: enemy.layer === TypeBattleLayer.Ground ? 'Наземный' : 'Воздушный' },
      { type: 'role', label: 'Тип', value: roleLabels[enemy.EnemyInfo.role] },
      { type: 'state', label: 'Состояние', value: enemy.alive ? 'Жив' : 'Погиб' }] };
}
export function createNPCView(enemy: Enemy) {
  return { ...createCombatantView(enemy), visual: createEnemyVisualLayout(enemy.EnemyInfo) };
}
