/** Shared, immutable type data. Item instances never own presentation objects. */
export class ItemInfo {
  readonly presentationId = 'inventory-item';
  readonly interactionId = 'inventory-move';

  constructor(readonly typeId: string, readonly Name: string) {
    Object.freeze(this);
  }
}

export const itemInfos: readonly ItemInfo[] = Object.freeze(
  Array.from({ length: 4 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return new ItemInfo(`item.${number}`, `Предмет ${number}`);
  }),
);
const catalog = new Map(itemInfos.map(info => [info.typeId, info]));

export function getItemInfo(typeId: string): ItemInfo {
  const info = catalog.get(typeId);
  if (!info) throw new Error('Неизвестный тип предмета.');
  return info;
}

export class Item {
  constructor(readonly id: string, readonly ItemInfo: ItemInfo) {
    if (!id) throw new Error('Предмету нужен ID экземпляра.');
    Object.freeze(this);
  }

  get typeId(): string { return this.ItemInfo.typeId; }
}

export function createItemFromInfo(typeId: string, id: string): Item {
  return new Item(id, getItemInfo(typeId));
}
