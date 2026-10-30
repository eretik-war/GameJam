import { getItemInfo } from '../domain/items';
import { resolveImage } from './images';

interface VisualItemInfo { readonly typeId: string; readonly image: string; readonly number: string }
export const visualItemInfos: readonly VisualItemInfo[] = Object.freeze([
  ['item.01', 'images/items/item-magenta.png', '01'],
  ['item.02', 'images/items/item-teal.png', '02'],
  ['item.03', 'images/items/item-blue.png', '03'],
  ['item.04', 'images/items/item-gold.png', '04'],
].map(([typeId, image, number]) => Object.freeze({ typeId: typeId!, image: image!, number: number! })));
const visuals = new Map(visualItemInfos.map(info => [info.typeId, info]));

/** Same view for equipment, storage, reward and the dragged item. */
export function createItemView(typeId: string) {
  const info = getItemInfo(typeId);
  const visual = visuals.get(info.typeId);
  if (!visual) throw new Error('Предмету не назначено представление.');
  return { title: info.Name, ...visual };
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
