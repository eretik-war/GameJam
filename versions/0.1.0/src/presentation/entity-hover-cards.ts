import type { Enemy } from '../enemies/enemy';
import { TypeGameStage, TypeInventoryArea, type InventorySession } from '../domain/inventory';
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

export function createHeroHoverCard(inventory: InventorySession, combatant?: Enemy): HoverCardView {
  const equipment = inventory.slots(TypeInventoryArea.Equipment);
  const storage = inventory.slots(TypeInventoryArea.Storage);
  const view = combatant ? createNPCView(combatant) : undefined;
  return {
    category: 'Герой', title: view?.title ?? 'Герой',
    description: 'Ваш персонаж на поле боя.',
    parameters: [
      ...(view?.parameters ?? []),
      { label: 'Экипировка', value: `${equipment.filter(Boolean).length} / ${equipment.length}` },
      { label: 'Карманы', value: `${inventory.storedCount} / ${storage.length}` },
      { label: 'Стадия', value: inventory.stage === TypeGameStage.Combat ? 'Бой' : 'Подготовка' },
    ],
    note: inventory.canMove ? 'Можно менять экипировку.' : 'Экипировка заблокирована.',
  };
}
