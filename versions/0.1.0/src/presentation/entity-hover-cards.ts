import type { Enemy } from '../enemies/enemy';
import { createNPCView } from '../enemies/view';
import { createItemView } from './item-view';
import type { HoverCardView } from './hover-card';

export function createEnemyHoverCard(enemy: Enemy, category = 'Противник'): HoverCardView {
  const view = createNPCView(enemy);
  return {
    category, title: view.title,
    description: 'Текущие характеристики и действующие эффекты.',
    parameters: view.parameters,
    note: enemy.alive ? 'Участвует в бою' : 'Повержен',
  };
}

export function createItemHoverCard(typeId: string): HoverCardView {
  const view = createItemView(typeId);
  return {
    category: 'Предмет', title: view.title,
    description: 'Занимает одну ячейку инвентаря.',
    parameters: [{ label: 'Номер', value: view.number }],
    note: 'Можно разместить в активном слоте или карманах.',
  };
}
