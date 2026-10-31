import type { Enemy } from '../enemies/enemy';
import type { Hero } from '../domain/hero';
import type { Item } from '../domain/items';
import { getStatusEffect } from '../enemies/status-effects/catalog';
import { createCombatantView } from '../enemies/view';
import { createItemView } from './item-view';
import type { HoverCardView } from './hover-card';

/** Character cards are compact: a short name plus the current combat values only. */
export function createEnemyHoverCard(enemy: Enemy): HoverCardView {
  const view = createCombatantView(enemy);
  return { compact: true, title: view.name, parameters: view.combatParameters };
}

export function createItemHoverCard(typeId: string): HoverCardView {
  const view = createItemView(typeId);
  const effect = view.effect;
  return {
    category: 'Предмет', title: view.title,
    description: 'Линза: добавляет урон к атаке героя.',
    parameters: [
      { label: 'Урон', value: `+${view.attackBonus}`, tone: effect?.typeId ?? 'plain' },
      { label: 'Эффект', value: effect ? getStatusEffect(effect.typeId).name : '—', tone: effect?.typeId ?? 'plain' },
    ],
    note: 'Можно разместить в активном слоте или карманах.',
  };
}

/** The hero card shows live damage and effects, including everything the equipped lenses add. */
export function createHeroHoverCard(hero: Hero, items: readonly (Item | null)[]): HoverCardView {
  const view = createCombatantView(hero, { damage: hero.AttackDamage(items), effects: hero.AttackEffects(items) });
  return { compact: true, title: view.name, parameters: view.combatParameters };
}
