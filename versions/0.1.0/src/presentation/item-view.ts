import { getItemInfo } from '../domain/items';

interface VisualItemInfo { readonly typeId: string; readonly color: string; readonly number: string }
export const visualItemInfos: readonly VisualItemInfo[] = Object.freeze([
  ['item.01', '#f17865', '01'], ['item.02', '#f1b653', '02'], ['item.03', '#d5da68', '03'],
  ['item.04', '#8dcc79', '04'], ['item.05', '#5cc6ae', '05'], ['item.06', '#68cedd', '06'],
  ['item.07', '#7ba7ee', '07'], ['item.08', '#9b8de5', '08'], ['item.09', '#c18bdf', '09'],
  ['item.10', '#df86ac', '10'], ['item.11', '#cbad8c', '11'], ['item.12', '#b1c2ce', '12'],
].map(([typeId, color, number]) => Object.freeze({ typeId: typeId!, color: color!, number: number! })));
const visuals = new Map(visualItemInfos.map(info => [info.typeId, info]));

/** Same view for equipment, storage, reward and the dragged item. */
export function createItemView(typeId: string) {
  const info = getItemInfo(typeId);
  const visual = visuals.get(info.typeId);
  if (!visual) throw new Error('Предмету не назначено представление.');
  return { title: info.Name, ...visual };
}

export function createItemIcon(typeId: string): HTMLElement {
  const view = createItemView(typeId);
  const icon = document.createElement('span');
  icon.className = 'item-icon';
  icon.style.setProperty('--item-color', view.color);
  icon.textContent = view.number;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}
