import { BattleDialogueSession, type BattleMessage } from './domain/battle-dialogue';
import type { EnemySession } from './enemies/session';

/** DOM overlays follow the renderer's live speaker bounds without moving the scene. */
export class BattleDialogueController {
  readonly element = document.createElement('div');
  readonly #events = new AbortController();
  readonly #nodes = new Map<string, HTMLElement>();
  #model: BattleDialogueSession | undefined;
  #shown = false;
  #introGesture = false;
  #lastUpdate = performance.now();

  constructor(readonly host: HTMLElement, readonly anchor: (speakerId: string) => DOMRect | undefined,
    readonly blocked: () => boolean, readonly onAdvance: () => void) {
    this.element.className = 'battle-dialogue-layer';
    this.element.hidden = true;
    host.append(this.element);
    const options = { capture: true, signal: this.#events.signal };
    document.addEventListener('pointerdown', event => {
      if (!this.active || this.blocked()) return;
      this.#introGesture = true;
      event.preventDefault(); event.stopImmediatePropagation();
    }, options);
    document.addEventListener('pointerup', event => {
      if (!this.#introGesture || this.blocked()) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, options);
    document.addEventListener('click', event => {
      if ((!this.active && !this.#introGesture) || this.blocked()) return;
      this.#introGesture = false;
      event.preventDefault(); event.stopImmediatePropagation();
      if (this.#model?.advance(event.button)) { this.onAdvance(); this.render(); }
    }, options);
    document.addEventListener('contextmenu', event => {
      if (!this.active || this.blocked()) return;
      this.#introGesture = false;
      event.preventDefault(); event.stopImmediatePropagation();
    }, options);
    document.addEventListener('pointercancel', () => { this.#introGesture = false; }, options);
    document.addEventListener('keydown', event => {
      if (!this.active || this.blocked() || !['Enter', 'Space'].includes(event.code)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, options);
  }

  get active(): boolean { return this.#shown && !!this.#model?.active; }

  open(battle: EnemySession, playIntro = true): void {
    this.#model = new BattleDialogueSession(battle, playIntro);
    this.#introGesture = false;
    this.resume();
  }

  resume(): void { this.#lastUpdate = performance.now(); this.#shown = true; this.element.hidden = false; this.render(); }
  hide(): void { this.#shown = false; this.#introGesture = false; this.element.hidden = true; this.#nodes.clear(); this.element.replaceChildren(); }

  perform<T>(action: () => T): T | undefined {
    if (this.active || this.blocked()) return undefined;
    // Finish the old interval before creating a new bubble. The next Pixi delta
    // may include time before this hit, especially with a slow software renderer.
    const now = performance.now();
    this.#model?.update(Math.max(0, now - this.#lastUpdate));
    this.#lastUpdate = now;
    const result = this.#model ? this.#model.perform(action) : action();
    this.render();
    return result;
  }

  update(elapsedMs: number): void {
    const now = performance.now();
    const sinceUpdate = Math.max(0, now - this.#lastUpdate);
    this.#lastUpdate = now;
    if (!this.#shown || this.blocked()) return;
    this.#model?.update(Math.min(elapsedMs, sinceUpdate));
    this.render();
  }

  render(): void {
    if (!this.#shown || !this.#model) return;
    const messages = this.#model.intro ? [this.#model.intro] : this.#model.hits;
    const keys = new Set(messages.map(message => `${message.kind}:${message.speakerId}`));
    for (const [key, node] of this.#nodes) if (!keys.has(key)) { node.remove(); this.#nodes.delete(key); }
    for (const message of messages) {
      const key = `${message.kind}:${message.speakerId}`;
      let node = this.#nodes.get(key);
      if (!node) { node = this.createMessage(message); this.#nodes.set(key, node); this.element.append(node); }
      if (node.dataset.index !== String(message.index) || node.querySelector('.battle-message-text')!.textContent !== message.text) {
        node.querySelector('.battle-message-text')!.textContent = message.text;
        node.dataset.index = String(message.index);
        const hint = node.querySelector('.battle-message-hint');
        if (hint) hint.textContent = `${message.index} / ${message.total} · ЛКМ — дальше`;
      }
      node.style.opacity = String(message.opacity);
      this.position(node, message.speakerId);
    }
  }

  private createMessage(message: BattleMessage): HTMLElement {
    const node = document.createElement('section');
    node.className = 'battle-message'; node.dataset.kind = message.kind; node.dataset.speakerId = message.speakerId;
    node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
    const name = document.createElement('strong'); name.className = 'battle-message-name'; name.textContent = message.name;
    const text = document.createElement('p'); text.className = 'battle-message-text';
    node.append(name, text);
    if (message.kind === 'intro') { const hint = document.createElement('small'); hint.className = 'battle-message-hint'; node.append(hint); }
    return node;
  }

  private position(node: HTMLElement, speakerId: string): void {
    const anchor = this.anchor(speakerId);
    node.hidden = !anchor;
    if (!anchor) return;
    const host = this.host.getBoundingClientRect();
    const center = anchor.left + anchor.width / 2 - host.left;
    const width = node.offsetWidth, height = node.offsetHeight;
    const left = Math.max(12, Math.min(center - width / 2, host.width - width - 12));
    const top = Math.max(12, Math.min(anchor.top - host.top - height - 14, host.height - height - 12));
    node.style.left = `${left}px`; node.style.top = `${top}px`;
    node.style.setProperty('--speaker-tail', `${Math.max(16, Math.min(width - 16, center - left))}px`);
  }

  dispose(): void { this.#events.abort(); this.hide(); this.#model = undefined; this.element.remove(); }
}
