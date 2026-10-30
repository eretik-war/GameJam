/** Shared display data. Game values are resolved by the owning entity's view. */
export interface HoverCardView {
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly parameters: readonly { readonly label: string; readonly value: string | number }[];
  readonly note: string;
}

export const HOVER_CARD_DELAY_MS = 500;

/** A DOM element or a renderer-owned anchor (for example a Pixi enemy). */
export interface HoverCardAnchor { getBoundingClientRect(): DOMRect }

/** One card and one interaction policy for character and inventory targets. */
export class HoverCardController {
  readonly #card = document.createElement('div');
  readonly #events = new AbortController();
  readonly #observer: MutationObserver;
  #target: HoverCardAnchor | undefined;
  #resolve: (() => HoverCardView) | undefined;
  #showTimer: number | undefined;
  #hideTimer: number | undefined;

  constructor() {
    this.#card.id = 'hover-card';
    this.#card.className = 'hover-card';
    this.#card.setAttribute('role', 'tooltip');
    this.#card.hidden = true;
    document.body.append(this.#card);
    const options = { signal: this.#events.signal };
    this.#card.addEventListener('pointerenter', () => this.#cancelHide(), options);
    this.#card.addEventListener('pointerleave', () => this.#scheduleHide(), options);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.hide();
    }, options);
    document.addEventListener('pointerdown', event => {
      if (event.target instanceof Node && !this.#card.contains(event.target)) this.hide();
    }, { ...options, capture: true });
    document.addEventListener('pointermove', event => {
      if (event.buttons) this.hide();
    }, { ...options, capture: true });
    window.addEventListener('resize', () => this.hide(), options);
    window.addEventListener('scroll', event => {
      if (!(event.target instanceof Node) || !this.#card.contains(event.target)) this.hide();
    }, { ...options, capture: true });
    window.addEventListener('blur', () => this.hide(), options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.hide();
    }, options);
    this.#observer = new MutationObserver(() => {
      const target = this.#target;
      if (!target) return;
      if (target instanceof HTMLElement && (!target.isConnected || !target.getClientRects().length)) this.hide();
      const modal = document.querySelector('dialog[open]');
      if (modal && (!(target instanceof HTMLElement) || !modal.contains(target))) this.hide();
    });
    this.#observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  }

  /** Delegation survives inventory/selection rerenders without retaining old buttons. */
  bindDelegated(root: HTMLElement, selector: string, resolve: (target: HTMLElement) => HoverCardView): void {
    const options = { signal: this.#events.signal };
    let touchStart: { id: number; x: number; y: number } | undefined;
    const find = (node: EventTarget | null): HTMLElement | null => {
      const target = node instanceof Element ? node.closest<HTMLElement>(selector) : null;
      return target && root.contains(target) ? target : null;
    };
    const enter = (event: PointerEvent): void => {
      const target = find(event.target);
      if (target && !event.buttons && event.pointerType !== 'touch') this.request(target, () => resolve(target));
    };
    root.addEventListener('pointerover', enter, { ...options, capture: true });
    root.addEventListener('pointermove', enter, { ...options, capture: true });
    root.addEventListener('pointerout', event => {
      const target = find(event.target);
      if (target && !target.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null) && !target.matches(':focus-visible')) this.leave(target);
    }, { ...options, capture: true });
    root.addEventListener('focusin', event => {
      const target = find(event.target);
      if (target) this.request(target, () => resolve(target));
    }, options);
    root.addEventListener('focusout', event => {
      const target = find(event.target);
      if (target) this.leave(target);
    }, options);
    root.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }, { ...options, capture: true });
    root.addEventListener('pointerup', event => {
      const target = find(event.target);
      const start = touchStart;
      touchStart = undefined;
      if (event.pointerType !== 'touch' || !target || !start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6) return;
      // Inventory commands may replace the button during the same event.
      queueMicrotask(() => {
        if (target.isConnected && !document.querySelector('.drag-ghost')) this.open(target, () => resolve(target));
      });
    }, options);
  }

  request(target: HoverCardAnchor, resolve: () => HoverCardView): void {
    this.#cancelHide();
    if (this.#target === target) return;
    this.hide();
    this.#target = target;
    this.#resolve = resolve;
    this.#showTimer = window.setTimeout(() => this.refresh(), HOVER_CARD_DELAY_MS);
  }

  open(target: HoverCardAnchor, resolve: () => HoverCardView): void {
    this.request(target, resolve);
    window.clearTimeout(this.#showTimer);
    this.refresh();
  }

  leave(target: HoverCardAnchor): void {
    if (this.#target === target) this.#scheduleHide();
  }

  #cancelHide(): void { window.clearTimeout(this.#hideTimer); }

  #scheduleHide(): void {
    // Cancel a pending opening immediately; allow crossing the small gap to an open card.
    window.clearTimeout(this.#showTimer);
    this.#cancelHide();
    if (this.#card.hidden) this.hide();
    else this.#hideTimer = window.setTimeout(() => this.hide(), 120);
  }

  /** Re-resolve live state; a hidden/pending card is never opened by a game render. */
  refresh(onlyIfVisible = false): void {
    if (!this.#target || !this.#resolve || (onlyIfVisible && this.#card.hidden)) return;
    if (this.#target instanceof HTMLElement && !this.#target.isConnected) { this.hide(); return; }
    const view = this.#resolve();
    const category = document.createElement('p');
    category.className = 'hover-card-category';
    category.textContent = view.category;
    const title = document.createElement('h3');
    title.textContent = view.title;
    const description = document.createElement('p');
    description.className = 'hover-card-description';
    description.textContent = view.description;
    const parameters = document.createElement('dl');
    for (const parameter of view.parameters) {
      const row = document.createElement('div');
      const label = document.createElement('dt');
      label.textContent = parameter.label;
      const value = document.createElement('dd');
      value.textContent = String(parameter.value);
      row.append(label, value);
      parameters.append(row);
    }
    const note = document.createElement('p');
    note.className = 'hover-card-note';
    note.textContent = view.note;
    const host = this.#target instanceof HTMLElement ? this.#target.closest('dialog[open]') ?? document.body : document.body;
    if (this.#card.parentElement !== host) host.append(this.#card);
    this.#card.replaceChildren(category, title, description, parameters, note);
    this.#card.hidden = false;
    if (this.#target instanceof HTMLElement) {
      const descriptions = new Set((this.#target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
      descriptions.add(this.#card.id);
      this.#target.setAttribute('aria-describedby', [...descriptions].join(' '));
    }
    this.#position();
  }

  #position(): void {
    if (!this.#target) return;
    const anchor = this.#target.getBoundingClientRect();
    const margin = 12;
    const gap = 14;
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    this.#card.style.maxHeight = `${height - margin * 2}px`;
    let card = this.#card.getBoundingClientRect();
    // Prefer above/below so a card does not cover the next enemy in the row.
    let x = anchor.left + (anchor.width - card.width) / 2;
    const below = height - margin - anchor.bottom - gap;
    const above = anchor.top - margin - gap;
    const placeBelow = below >= card.height || below >= above;
    let y: number;
    if (Math.max(below, above) >= 96) {
      // Long status lists scroll rather than covering the target or its neighbours.
      this.#card.style.maxHeight = `${Math.min(height - margin * 2, placeBelow ? below : above)}px`;
      card = this.#card.getBoundingClientRect();
      y = placeBelow ? anchor.bottom + gap : anchor.top - card.height - gap;
    } else {
      if (anchor.right + gap + card.width <= width - margin) x = anchor.right + gap;
      else if (anchor.left - card.width - gap >= margin) x = anchor.left - card.width - gap;
      y = anchor.top + (anchor.height - card.height) / 2;
    }
    this.#card.style.left = `${Math.max(margin, Math.min(x, width - card.width - margin))}px`;
    this.#card.style.top = `${Math.max(margin, Math.min(y, height - card.height - margin))}px`;
  }

  hide(): void {
    window.clearTimeout(this.#showTimer);
    this.#cancelHide();
    if (this.#target instanceof HTMLElement) {
      const descriptions = (this.#target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== this.#card.id);
      if (descriptions.length) this.#target.setAttribute('aria-describedby', descriptions.join(' '));
      else this.#target.removeAttribute('aria-describedby');
    }
    this.#card.hidden = true;
    this.#target = undefined;
    this.#resolve = undefined;
  }

  destroy(): void {
    this.hide();
    this.#observer.disconnect();
    this.#events.abort();
    this.#card.remove();
  }
}
