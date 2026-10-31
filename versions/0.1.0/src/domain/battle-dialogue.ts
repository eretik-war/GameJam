import type { EnemySession } from '../enemies/session';
import { TypeEnemyParameter } from '../enemies/enemy-parameters';
export interface BattleMessage {
  readonly speakerId: string;
  readonly name: string;
  readonly text: string;
  readonly kind: 'intro' | 'hit';
  readonly index: number;
  readonly total: number;
  readonly opacity: number;
}
/** Shared text is immutable; speaker IDs and progression belong to this battle. */
const openingLines = Object.freeze([
  Object.freeze({ speaker: 'enemy', text: 'Старший брат, ты всё-таки пришёл! Мы тебя ждали.' }),
  Object.freeze({ speaker: 'hero', text: 'Младшие, отойдите. Я не хочу вас ломать.' }),
  Object.freeze({ speaker: 'enemy', text: 'Не можем, старший брат. Нам велели тебя остановить.' }),
] as const);

export class BattleDialogueSession {
  readonly #lines: readonly BattleMessage[];
  #introIndex = 0;

  constructor(readonly battle: EnemySession, playIntro = true) {
    const enemy = battle.deployed.find(enemy => enemy.alive);
    this.#lines = Object.freeze(!playIntro || !enemy ? [] : openingLines.map((line, index) => {
      const speaker = line.speaker === 'enemy' ? enemy : battle.hero;
      return Object.freeze({ speakerId: speaker.id, name: speaker.EnemyInfo.Name, text: line.text,
        kind: 'intro' as const, index: index + 1, total: openingLines.length, opacity: 1 });
    }));
  }

  get active(): boolean { return this.#introIndex < this.#lines.length; }
  get intro(): BattleMessage | undefined { return this.#lines[this.#introIndex]; }

  get hits(): readonly BattleMessage[] {
    return Object.freeze([...this.#hits.values()].map(hit => Object.freeze({ ...hit.message,
      opacity: hit.age <= 2000 ? 1 : Math.max(0, 1 - (hit.age - 2000) / 1000) })));
  }
  readonly #hits = new Map<string, { message: BattleMessage; age: number }>();

  /** Observe real HP/shield changes without owning or duplicating combat rules. */
  perform<T>(action: () => T): T | undefined {
    if (this.active) return undefined;
    const before = new Map(this.battle.deployed.map(enemy => [enemy.id,
      enemy.GetParameter(TypeEnemyParameter.Health) + enemy.GetParameter(TypeEnemyParameter.Shield)]));
    const result = action();
    for (const enemy of this.battle.deployed) {
      const remaining = enemy.GetParameter(TypeEnemyParameter.Health) + enemy.GetParameter(TypeEnemyParameter.Shield);
      if (remaining >= before.get(enemy.id)!) continue;
      const message = Object.freeze({ speakerId: enemy.id, name: enemy.EnemyInfo.Name,
        text: 'Не бей нас, старший брат!', kind: 'hit' as const, index: 1, total: 1, opacity: 1 });
      this.#hits.set(enemy.id, { message, age: 0 });
    }
    return result;
  }

  update(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid dialogue time');
    for (const [id, hit] of this.#hits) {
      hit.age += elapsedMs;
      if (hit.age >= 3000) this.#hits.delete(id);
    }
  }

  /** The last click ends the conversation; other mouse buttons never advance it. */
  advance(button: number): boolean {
    if (button !== 0 || !this.active) return false;
    this.#introIndex++;
    return true;
  }
}
