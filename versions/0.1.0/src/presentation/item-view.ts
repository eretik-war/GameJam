import { getItemInfo } from '../domain/items';
import { resolveImage } from './images';
import { combatItemVisuals } from './combat-item-visuals';

interface VisualItemInfo { readonly typeId: string; readonly image: string; readonly number: string }
const baseItemVisuals: readonly VisualItemInfo[] = Object.freeze([
  ['item.01', 'images/items/item-magenta.png', '01'],
  ['item.02', 'images/items/item-teal.png', '02'],
  ['item.03', 'images/items/item-blue.png', '03'],
  ['item.04', 'images/items/item-gold.png', '04'],
  ['item.05', 'images/items/item-module-magenta.png', '05'],
  ['item.06', 'images/items/item-module-gold.png', '06'],
  ['item.07', 'images/items/item-module-blue.png', '07'],
  ['item.08', 'images/items/item-module-teal.png', '08'],
].map(([typeId, image, number]) => Object.freeze({ typeId: typeId!, image: image!, number: number! })));
export const visualItemInfos: readonly VisualItemInfo[] = Object.freeze([...baseItemVisuals, ...combatItemVisuals]);
const visuals = new Map(visualItemInfos.map(info => [info.typeId, info]));
if (visuals.size !== visualItemInfos.length) throw new Error('Duplicate visual item type');

/** Same view for equipment, storage, reward and the dragged item. */
export function createItemView(typeId: string) {
  const info = getItemInfo(typeId);
  const visual = visuals.get(info.typeId);
  if (!visual) throw new Error('Предмету не назначено представление.');
  return { title: info.Name, attackBonus: info.attackBonus, effect: info.effect, passive: info.passive, combatTrait: info.combatTrait, ...visual };
}

export function createItemIcon(typeId: string): HTMLImageElement {
  const view = createItemView(typeId);
  const icon = document.createElement('img');
  icon.className = 'item-icon';
  icon.src = resolveImage(view.image);
  icon.alt = '';
  icon.draggable = false;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}
