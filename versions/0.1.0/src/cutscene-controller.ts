import clank from '../../../assets/sounds/clank.mp3';
import v51 from '../../../assets/sounds/5.1.mp3';
import v42 from '../../../assets/sounds/4.2.mp3';
import v41 from '../../../assets/sounds/4.1.mp3';
import v31 from '../../../assets/sounds/3.1.mp3';
import v21 from '../../../assets/sounds/2.1.mp3';
import v1 from '../../../assets/sounds/1.1.mp3';
import v2 from '../../../assets/sounds/1.2.mp3';
import v3 from '../../../assets/sounds/1.3.mp3';
import robotTalk from '../../../assets/sounds/robotTalk-pitchedold.mp3';
import { createEnemyIcon } from './presentation/enemy-visual';
import { createEnemyVisualLayout } from './enemies/visual-info';
import { getEnemyInfo } from './enemies/enemy';
const voices: Record<string,string> = {clank,'3.1':v31,'4.1':v41,'4.2':v42,'5.1':v51,'2.1':v21,'1.1':v1,'1.2':v2,'1.3':v3,robotTalk};
import { resolveImage } from './presentation/images';
import { testCutscene, type CutsceneInfo } from './domain/campaign';
export class CutsceneController {
  readonly element = document.createElement('section');
  readonly #dialog = document.createElement('button');
  readonly #text = document.createElement('span');
  readonly #hint = document.createElement('span');
  readonly #choices = document.createElement('div');
  readonly #debug = document.createElement('footer');
  readonly #events = new AbortController();
  readonly #actors = document.createElement('div');
  readonly #audio = new Audio();
  #needsGesture = false;
  #index = 0;
  #info: CutsceneInfo = testCutscene;
  blocked = false;
  get active(): boolean { return !this.element.hidden; }
  constructor(private readonly onClose: (choice?: string) => void) {
    this.#actors.className = 'cutscene-actors'; this.element.append(this.#actors);
    this.element.className = 'cutscene'; this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Катсцена');
    this.element.style.backgroundImage = 'url("' + resolveImage('images/locations/CutsceneTest.jpg') + '")';
    this.#dialog.type = 'button'; this.#dialog.className = 'cutscene-dialog';
    this.#text.className = 'cutscene-text'; this.#text.setAttribute('aria-live', 'polite');
    this.#hint.className = 'cutscene-hint';
    this.#dialog.append(this.#text, this.#hint);
    this.#choices.className = 'cutscene-choices';
    this.#debug.className = 'debug'; this.#debug.hidden = true;
    const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Вернуться к сцене боя';
    this.#debug.append(back); this.element.append(this.#dialog, this.#choices, this.#debug);
    const options = { signal: this.#events.signal };
    back.addEventListener('click', () => { if (!this.blocked) this.close(); }, options);
    this.#dialog.addEventListener('click', () => this.advance(), options);
    document.addEventListener('keydown', event => {
      if (!this.active || this.blocked) return;
      if (!this.#info.lines.length) return;
      if (event.target instanceof HTMLButtonElement && this.#choices.contains(event.target)) return;
      if (event.code === 'KeyD') {
        if (!event.repeat) this.#debug.hidden = !this.#debug.hidden;
        event.preventDefault();
      } else if (this.#debug.hidden && (event.code === 'Space' || event.code === 'Enter')) {
        event.preventDefault(); if (!event.repeat) this.advance();
      }
    }, options);
  }
  open(info: CutsceneInfo = testCutscene): void { this.#info = info;
    this.#actors.replaceChildren();
    if(info.characters) {
      const hero = document.createElement('img'); hero.src = resolveImage('images/hero/Stand1.png'); hero.alt = 'Герой'; hero.className = 'cutscene-hero';
      this.#actors.append(hero);
      if(info.robotTypeId) {
      const robot = createEnemyIcon(createEnemyVisualLayout(getEnemyInfo(info.robotTypeId))); robot.classList.add('cutscene-robot'); robot.setAttribute('aria-label','Бирюзовая камера');
      this.#actors.append(robot);
      }
    } this.element.style.backgroundImage = 'url("' + resolveImage(info.background) + '")'; this.#index = 0; this.#debug.hidden = true; this.element.hidden = false; this.update(); if (info.lines.length) this.#dialog.focus(); }
  private advance(): void {
    if (!this.active || this.blocked || !this.#debug.hidden) return;
    if (this.#needsGesture) { this.#needsGesture = false; void this.#audio.play().catch(() => {}); return; }
    if (!this.#info.lines.length || this.#info.lines[this.#index]?.choices) return;
    if (this.#index === this.#info.lines.length - 1) { this.close(); return; }
    this.#index++; this.update();
  }
  private update(): void {
    this.#audio.pause(); this.#audio.removeAttribute('src'); this.#needsGesture = false;
    this.#choices.replaceChildren();
    this.#dialog.hidden = !this.#info.lines.length;
    const line = this.#info.lines[this.#index];
    if (!line) return;
    this.#dialog.disabled = !!line.choices;
    this.#text.textContent = line.text;
    if(line.sound && voices[line.sound]) {
      this.#audio.playbackRate = 1;
      this.#audio.preservesPitch = true;
      this.#audio.src = voices[line.sound]!;
      const source = this.#audio.src;
      void this.#audio.play().catch(error => { if(this.active && this.#audio.src === source && error.name === 'NotAllowedError') this.#needsGesture = true; });
    }
    for (const choice of line.choices ?? []) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = choice.text; button.dataset.choice = choice.id;
      button.addEventListener('click', () => { if (this.active && !this.blocked && this.#debug.hidden) this.onClose(choice.id); });
      this.#choices.append(button);
    }
    this.#hint.hidden = !!line.choices;
    this.#hint.textContent = (this.#index + 1) + ' / ' + this.#info.lines.length + ' · Нажмите, Enter или Пробел · ' + (this.#index === this.#info.lines.length - 1 ? 'Завершить' : 'Далее');
  }
  private close(): void { if (!this.#info.lines.length || this.#info.lines[this.#index]?.choices) return; this.onClose(); }
  hide(): void { this.#audio.pause(); this.#needsGesture = false; this.element.hidden = true; this.#debug.hidden = true; }
  dispose(): void { this.#audio.pause(); this.#events.abort(); this.element.remove(); }
}

