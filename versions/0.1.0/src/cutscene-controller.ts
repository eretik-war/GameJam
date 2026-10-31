import { resolveImage } from './presentation/images';
import { testCutscene, type CutsceneInfo } from './domain/campaign';
export class CutsceneController {
  readonly element = document.createElement('section');
  readonly #dialog = document.createElement('button');
  readonly #text = document.createElement('span');
  readonly #hint = document.createElement('span');
  readonly #debug = document.createElement('footer');
  readonly #events = new AbortController();
  #index = 0;
  #info: CutsceneInfo = testCutscene;
  blocked = false;
  get active(): boolean { return !this.element.hidden; }
  constructor(private readonly onClose: () => void) {
    this.element.className = 'cutscene'; this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Тестовая катсцена');
    this.element.style.backgroundImage = 'url("' + resolveImage('images/locations/CutsceneTest.jpg') + '")';
    this.#dialog.type = 'button'; this.#dialog.className = 'cutscene-dialog';
    this.#text.className = 'cutscene-text'; this.#text.setAttribute('aria-live', 'polite');
    this.#hint.className = 'cutscene-hint';
    this.#dialog.append(this.#text, this.#hint);
    this.#debug.className = 'debug'; this.#debug.hidden = true;
    const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Вернуться к сцене боя';
    this.#debug.append(back); this.element.append(this.#dialog, this.#debug);
    const options = { signal: this.#events.signal };
    back.addEventListener('click', () => { if (!this.blocked) this.close(); }, options);
    this.#dialog.addEventListener('click', () => this.advance(), options);
    document.addEventListener('keydown', event => {
      if (!this.active || this.blocked) return;
      if (event.code === 'KeyD') {
        if (!event.repeat) this.#debug.hidden = !this.#debug.hidden;
        event.preventDefault();
      } else if (this.#debug.hidden && (event.code === 'Space' || event.code === 'Enter')) {
        event.preventDefault(); if (!event.repeat) this.advance();
      }
    }, options);
  }
  open(info: CutsceneInfo = testCutscene): void { this.#info = info; this.element.style.backgroundImage = 'url("' + resolveImage(info.background) + '")'; this.#index = 0; this.#debug.hidden = true; this.element.hidden = false; this.update(); this.#dialog.focus(); }
  private advance(): void {
    if (!this.active || this.blocked || !this.#debug.hidden) return;
    if (this.#index === this.#info.lines.length - 1) { this.close(); return; }
    this.#index++; this.update();
  }
  private update(): void {
    this.#text.textContent = this.#info.lines[this.#index]!.text;
    this.#hint.textContent = (this.#index + 1) + ' / ' + this.#info.lines.length + ' · Нажмите, Enter или Пробел · ' + (this.#index === this.#info.lines.length - 1 ? 'Завершить' : 'Далее');
  }
  private close(): void { this.onClose(); }
  hide(): void { this.element.hidden = true; this.#debug.hidden = true; }
  dispose(): void { this.#events.abort(); this.element.remove(); }
}
