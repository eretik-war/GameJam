import { InventorySession, SlotAddress, TypeGameStage, TypeInventoryArea } from './domain/inventory';
import { createItemIcon, createItemView } from './presentation/item-view';

interface Drag {
  readonly pointerId: number;
  readonly source: SlotAddress;
  readonly button: HTMLButtonElement;
  readonly x: number;
  readonly y: number;
  moved: boolean;
  ghost: HTMLElement | null;
}

export class InventoryController {
  readonly model = new InventorySession();
  readonly #events = new AbortController();
  readonly #equipment: HTMLElement;
  readonly #storage: HTMLElement;
  readonly #dialog: HTMLDialogElement;
  readonly #phaseButton: HTMLButtonElement;
  #selected: SlotAddress | null = null;
  #drag: Drag | null = null;
  #drop: HTMLElement | null = null;
  #suppressClickUntil = 0;

  constructor(readonly root: HTMLElement, readonly announce: (message: string) => void) {
    this.#equipment = this.element('equipment-slots');
    this.#storage = this.element('storage-slots');
    this.#dialog = this.element<HTMLDialogElement>('reward-dialog');
    this.#phaseButton = this.element<HTMLButtonElement>('phase-action');
    const options = { signal: this.#events.signal };
    root.addEventListener('pointerdown', event => this.pointerDown(event), options);
    document.addEventListener('pointermove', event => this.pointerMove(event), { ...options, passive: false });
    document.addEventListener('pointerup', event => this.pointerUp(event), options);
    document.addEventListener('pointercancel', () => this.cancelInteraction(), options);
    window.addEventListener('blur', () => this.cancelInteraction(), options);
    window.addEventListener('resize', () => this.cancelInteraction(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancelInteraction(); }, options);
    root.addEventListener('click', event => this.slotClick(event), options);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.cancelInteraction(); }, options);
    this.#dialog.addEventListener('cancel', event => event.preventDefault(), options);
    this.#phaseButton.addEventListener('click', () => this.command(() => {
      this.cancelInteraction();
      if (this.model.stage === TypeGameStage.Combat) {
        this.model.FinishCombat();
        this.announce(this.model.storageFull ? 'Карманы заполнены. Выбор награды недоступен.' : 'Бой завершён. Выберите один из трёх предметов.');
      } else {
        this.model.StartCombat();
        this.announce('Бой начался. Перемещение предметов заблокировано.');
      }
    }), options);
    this.element('skip-reward').addEventListener('click', () => this.command(() => {
      this.model.ContinueWithoutReward();
      this.announce('Подготовка к бою. Освободите карманы, переместив предмет в активный слот.');
    }), options);
    this.render();
  }

  render(): void {
    const preparation = this.model.stage === TypeGameStage.Preparation;
    this.root.dataset.stage = this.model.stage;
    this.element('stage-number').textContent = preparation ? '02' : '01';
    this.element('stage-title').textContent = preparation ? 'Подготовка' : 'Бой';
    this.element('battle-number').textContent = `Бой ${String(this.model.battle).padStart(2, '0')}`;
    this.element('equipment-state').textContent = preparation ? 'Можно менять' : 'Заблокировано';
    this.element('storage-panel').hidden = !preparation;
    this.element('player-space').hidden = preparation;
    this.element('storage-count').textContent = `${this.model.storedCount} / ${this.model.slots(TypeInventoryArea.Storage).length}`;
    this.element('phase-hint').textContent = preparation ? 'Расположите предметы и начните следующий бой.' : 'После боя можно выбрать один новый предмет.';
    this.#phaseButton.textContent = preparation ? 'Начать бой →' : 'Завершить бой →';
    this.#phaseButton.disabled = this.model.awaitingReward;
    this.renderSlots(this.#equipment, TypeInventoryArea.Equipment);
    this.renderSlots(this.#storage, TypeInventoryArea.Storage);
    if (this.model.awaitingReward) {
      const rewards = this.element('reward-options');
      rewards.replaceChildren();
      for (const typeId of this.model.offers) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'reward-option'; button.dataset.typeId = typeId;
        button.disabled = this.model.storageFull;
        const title = document.createElement('span');
        title.textContent = createItemView(typeId).title;
        button.append(createItemIcon(typeId), title);
        button.addEventListener('click', () => this.command(() => {
          this.model.ChooseReward(typeId);
          this.announce('Предмет добавлен в карманы. Теперь можно менять экипировку.');
        }));
        rewards.append(button);
      }
      this.element('reward-description').textContent = this.model.storageFull
        ? 'Все 12 ячеек заняты. Выбор недоступен — перейдите к подготовке.'
        : 'Выберите один предмет. Он сразу попадёт в карманы.';
      this.element('skip-reward').hidden = !this.model.storageFull;
      if (!this.#dialog.open) this.#dialog.showModal();
    } else if (this.#dialog.open) {
      this.#dialog.close();
      this.#phaseButton.focus({ preventScroll: true });
    }
  }

  dispose(): void { this.cancelInteraction(); this.#events.abort(); this.#dialog.close(); }

  private renderSlots(host: HTMLElement, area: TypeInventoryArea): void {
    host.replaceChildren();
    this.model.slots(area).forEach((_, index) => {
      const address = { area, index };
      const item = this.model.itemAt(address);
      const button = document.createElement('button');
      button.type = 'button'; button.className = `inventory-slot${item ? ' occupied' : ''}`;
      button.dataset.area = area; button.dataset.index = String(index);
      if (item) { button.dataset.itemId = item.id; button.dataset.typeId = item.typeId; }
      button.disabled = !this.model.canMove;
      const label = area === TypeInventoryArea.Equipment ? 'Активный слот' : 'Карман';
      button.setAttribute('aria-label', `${label} ${index + 1}: ${item ? createItemView(item.typeId).title : 'пусто'}`);
      button.setAttribute('aria-pressed', String(this.sameAddress(this.#selected, address)));
      const number = document.createElement('span');
      number.className = 'slot-number'; number.textContent = String(index + 1).padStart(2, '0');
      button.append(number);
      if (item) button.append(createItemIcon(item.typeId));
      else {
        const empty = document.createElement('span');
        empty.className = 'slot-empty'; empty.textContent = '+'; empty.setAttribute('aria-hidden', 'true');
        button.append(empty);
      }
      host.append(button);
    });
  }

  private slotButton(target: EventTarget | null): HTMLButtonElement | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLButtonElement>('.inventory-slot');
    return button && this.root.contains(button) && !button.disabled ? button : null;
  }
  private address(button: HTMLButtonElement): SlotAddress {
    return { area: button.dataset.area as TypeInventoryArea, index: Number(button.dataset.index) };
  }
  private slotClick(event: MouseEvent): void {
    const button = this.slotButton(event.target);
    if (!button || (event.detail > 0 && performance.now() < this.#suppressClickUntil) || !this.model.canMove) return;
    this.activateSlot(button);
  }
  private activateSlot(button: HTMLButtonElement): void {
    const address = this.address(button);
    if (this.#selected && !this.sameAddress(this.#selected, address)) {
      const source = this.#selected;
      this.command(() => { this.model.Move(source, address); this.announce('Предметы перемещены.'); });
    } else {
      this.#selected = this.#selected ? null : (this.model.itemAt(address) ? address : null);
      this.render();
    }
    this.findSlot(address)?.focus({ preventScroll: true });
  }
  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary || this.#drag) return;
    // Only suppress the compatibility click of the completed drag, never the next tap.
    this.#suppressClickUntil = 0;
    if (!this.model.canMove) return;
    const button = this.slotButton(event.target);
    if (!button) return;
    const source = this.address(button);
    this.#drag = { source, button, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, ghost: null };
    button.setPointerCapture(event.pointerId);
  }
  private pointerMove(event: PointerEvent): void {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    drag.moved = true;
    event.preventDefault();
    const item = this.model.itemAt(drag.source);
    if (!item) return;
    if (!drag.ghost) {
      this.#selected = null;
      this.root.querySelectorAll('[aria-pressed="true"].inventory-slot').forEach(slot => slot.setAttribute('aria-pressed', 'false'));
      drag.ghost = document.createElement('div'); drag.ghost.className = 'drag-ghost';
      drag.ghost.append(createItemIcon(item.typeId));
      document.body.append(drag.ghost); drag.button.classList.add('drag-source');
    }
    drag.ghost.style.left = `${event.clientX}px`; drag.ghost.style.top = `${event.clientY}px`;
    this.#drop?.classList.remove('drop-target');
    this.#drop = this.slotButton(document.elementFromPoint(event.clientX, event.clientY));
    this.#drop?.classList.add('drop-target');
  }
  private pointerUp(event: PointerEvent): void {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = this.slotButton(document.elementFromPoint(event.clientX, event.clientY));
    const moved = drag.moved;
    const hasItem = !!drag.ghost;
    this.clearDrag();
    if (!moved) {
      // Touch compatibility clicks can be omitted after scrolling or a drag.
      if (event.pointerType === 'touch') {
        this.activateSlot(drag.button);
        this.#suppressClickUntil = performance.now() + 250;
      }
      return;
    }
    this.#suppressClickUntil = performance.now() + 250;
    if (!hasItem) return;
    if (target) {
      const address = this.address(target);
      this.command(() => { this.model.Move(drag.source, address); this.announce('Предметы перемещены.'); });
      this.findSlot(address)?.focus({ preventScroll: true });
    } else this.announce('Предмет возвращён в исходную ячейку.');
  }
  private clearDrag(): void {
    const drag = this.#drag;
    if (drag) {
      drag.ghost?.remove(); drag.button.classList.remove('drag-source');
      if (drag.button.hasPointerCapture(drag.pointerId)) drag.button.releasePointerCapture(drag.pointerId);
    }
    this.#drop?.classList.remove('drop-target'); this.#drop = null; this.#drag = null;
  }
  private cancelInteraction(): void {
    if (this.#drag?.ghost) this.#suppressClickUntil = performance.now() + 250;
    this.clearDrag(); this.#selected = null;
    this.root.querySelectorAll('[aria-pressed="true"].inventory-slot').forEach(slot => slot.setAttribute('aria-pressed', 'false'));
  }
  private command(handler: () => void): void {
    try { handler(); this.#selected = null; this.render(); }
    catch (error) { this.announce(error instanceof Error ? error.message : String(error)); }
  }
  private findSlot(address: SlotAddress): HTMLButtonElement | null {
    return this.root.querySelector(`[data-area="${address.area}"][data-index="${address.index}"]`);
  }
  private sameAddress(a: SlotAddress | null, b: SlotAddress): boolean { return a?.area === b.area && a.index === b.index; }
  private element<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing inventory element: ${id}`);
    return element;
  }
}
