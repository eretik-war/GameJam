import { Item, createItemFromInfo, itemInfos } from './items';

export const EQUIPMENT_SIZE = 3;
export const STORAGE_COLUMNS = 4;
export const STORAGE_ROWS = 3;
export const STORAGE_SIZE = STORAGE_COLUMNS * STORAGE_ROWS;

export enum TypeGameStage { Combat = 'combat', Preparation = 'preparation' }
export enum TypeInventoryArea { Equipment = 'equipment', Storage = 'storage' }
export interface SlotAddress { readonly area: TypeInventoryArea; readonly index: number }

/** Sole owner of item placement, stage gates and reward selection. No DOM/Pixi. */
export class InventorySession {
  readonly #equipment: (string | null)[] = Array(EQUIPMENT_SIZE).fill(null);
  readonly #storage: (string | null)[] = Array(STORAGE_SIZE).fill(null);
  readonly #items = new Map<string, Item>();
  #stage = TypeGameStage.Combat;
  #offers: readonly string[] = Object.freeze([]);
  #nextItemId = 1;
  #battle = 1;

  get stage(): TypeGameStage { return this.#stage; }
  get battle(): number { return this.#battle; }
  get offers(): readonly string[] { return this.#offers; }
  get awaitingReward(): boolean { return this.#offers.length > 0; }
  allowCombatEquipment = false;
  get canMove(): boolean { return (this.stage === TypeGameStage.Preparation || this.allowCombatEquipment) && !this.awaitingReward; }
  get storageFull(): boolean { return !this.#storage.includes(null); }
  get storedCount(): number { return this.#storage.filter(id => id !== null).length; }

  slots(area: TypeInventoryArea): readonly (string | null)[] {
    return Object.freeze([...this.areaSlots(area)]);
  }

  itemAt(address: SlotAddress): Item | null {
    const id = this.checkedSlots(address)[address.index];
    return id ? this.#items.get(id)! : null;
  }

  FinishCombat(random: () => number = Math.random): void {
    if (this.stage !== TypeGameStage.Combat || this.awaitingReward) throw new Error('Бой уже завершён.');
    // Draw once per completed battle; rendering and resize never reroll rewards.
    const pool = itemInfos.map(info => info.typeId);
    const selected: string[] = [];
    for (let index = 0; index < 3; index++) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Некорректная случайность.');
      selected.push(pool.splice(Math.floor(value * pool.length), 1)[0]!);
    }
    this.#offers = Object.freeze(selected);
  }

  ChooseReward(typeId: string): void {
    if (!this.awaitingReward || !this.#offers.includes(typeId)) throw new Error('Эта награда недоступна.');
    const index = this.#storage.indexOf(null);
    if (index < 0) throw new Error('Карманы заполнены. Выбор награды недоступен.');
    const item = createItemFromInfo(typeId, `item-${this.#nextItemId}`);
    this.#items.set(item.id, item);
    this.#storage[index] = item.id;
    this.#nextItemId++;
    this.completeReward();
  }

  ContinueWithoutReward(): void {
    if (!this.awaitingReward || !this.storageFull) throw new Error('Сначала выберите награду.');
    this.completeReward();
  }

  StartCombat(): void {
    if (this.stage !== TypeGameStage.Preparation || !this.canMove) throw new Error('Начать бой можно только после подготовки.');
    this.#stage = TypeGameStage.Combat;
    this.#battle++;
  }

  Move(source: SlotAddress, target: SlotAddress): void {
    if (!this.canMove) throw new Error('Предметы можно перемещать только во время подготовки.');
    // Validate both addresses and the source before touching either slot.
    const from = this.checkedSlots(source);
    const to = this.checkedSlots(target);
    const item = from[source.index];
    if (!item) throw new Error('В исходной ячейке нет предмета.');
    const displaced = to[target.index]!;
    from[source.index] = displaced;
    to[target.index] = item;
  }

  private completeReward(): void {
    this.#offers = Object.freeze([]);
    this.#stage = TypeGameStage.Preparation;
  }

  private areaSlots(area: TypeInventoryArea): (string | null)[] {
    if (area === TypeInventoryArea.Equipment) return this.#equipment;
    if (area === TypeInventoryArea.Storage) return this.#storage;
    throw new Error('Неизвестная область инвентаря.');
  }

  private checkedSlots(address: SlotAddress): (string | null)[] {
    const slots = this.areaSlots(address.area);
    if (!Number.isInteger(address.index) || address.index < 0 || address.index >= slots.length) {
      throw new Error('Неизвестная ячейка.');
    }
    return slots;
  }
}
