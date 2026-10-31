import type { Enemy } from '../enemies/enemy';
import type { Hero } from '../domain/hero';
import type { Item } from '../domain/items';
import { getStatusEffect } from '../enemies/status-effects/catalog';
import { createCombatantView } from '../enemies/view';
import { createItemView } from './item-view';
import type { HoverCardView } from './hover-card';

/** Character cards are compact: a short name, the current combat values and an effect legend. */
export function createEnemyHoverCard(enemy: Enemy): HoverCardView {
  const view = createCombatantView(enemy);
  return { compact: true, title: view.name, parameters: view.combatParameters, effects: view.effectNotes };
}

export function createItemHoverCard(typeId: string): HoverCardView {
  const view = createItemView(typeId);
  const effect = view.effect;
  const passive = view.passive;
  const trait = view.combatTrait;
  const parameters: { label: string; value: string; tone?: string }[] = [];
  if (view.attackBonus > 0) parameters.push({ label: 'Урон', value: `+${view.attackBonus}`, tone: effect?.typeId ?? 'plain' });
  if (trait) {
    parameters.push({ label: 'Свойство', value: trait.title, tone: 'plain' });
  } else if (passive) {
    parameters.push({ label: 'Пассив', value: passive.title, tone: 'plain' });
  } else {
    parameters.push(
      { label: 'Эффект', value: effect ? getStatusEffect(effect.typeId).name : '—', tone: effect?.typeId ?? 'plain' },
    );
  }
  return {
    category: 'Предмет', title: view.title,
    description: trait ? trait.description : passive ? passive.description : 'Линза: добавляет урон к атаке героя.',
    parameters,
    note: 'Можно разместить в активном слоте или карманах.',
  };
}

/** The hero card shows live damage and effects, including everything the equipped lenses add. */
export function createHeroHoverCard(hero: Hero, items: readonly (Item | null)[]): HoverCardView {
  const view = createCombatantView(hero, { damage: hero.AttackDamage(items), effects: hero.AttackEffects(items) });
  return { compact: true, title: view.name, parameters: view.combatParameters, effects: view.effectNotes };
}
