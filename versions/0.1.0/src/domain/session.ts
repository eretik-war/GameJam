import { NPC, createNPCFromInfo } from './npc';
import { RestoreParameter, TypeNPCParameter } from './parameters';

export class GameSession {
  public readonly npcs: readonly NPC[];
  #turn: number;
  #selectedId: string;

  constructor(npcs: readonly NPC[], turn = 1, selectedId = npcs[0]?.id ?? '') {
    if (npcs.length === 0 || npcs.length > 100) throw new Error('Invalid NPC count');
    if (new Set(npcs.map(npc => npc.id)).size !== npcs.length) throw new Error('Duplicate instance ID');
    if (!Number.isSafeInteger(turn) || turn < 1 || turn >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid turn');
    this.npcs = Object.freeze([...npcs]);
    this.#turn = turn;
    this.#selectedId = selectedId;
    this.Select(selectedId);
  }

  get turn(): number { return this.#turn; }
  get selectedId(): string { return this.#selectedId; }

  get selected(): NPC {
    const npc = this.npcs.find(entry => entry.id === this.selectedId);
    if (!npc) throw new Error('Selected NPC is missing');
    return npc;
  }

  Select(id: string): void {
    if (!this.npcs.some(npc => npc.id === id)) throw new Error('Unknown selected ID');
    this.#selectedId = id;
  }

  EndTurn(): void {
    if (this.turn >= Number.MAX_SAFE_INTEGER - 1) throw new Error('Turn limit reached');
    this.selected.ChangeParameter(TypeNPCParameter.Health, -10);
    this.#turn += 1;
  }

  RestoreHealth(): void {
    this.selected.ApplyRestore(new RestoreParameter(TypeNPCParameter.Health, 15));
  }

  Save(): string {
    return JSON.stringify({ schemaVersion: 1, turn: this.turn, selectedId: this.selectedId, npcs: this.npcs.map(npc => npc.Save()) });
  }
}

export function createSession(): GameSession {
  return new GameSession([createNPCFromInfo('npc.trainee', 'npc-1'), createNPCFromInfo('npc.trainee', 'npc-2')]);
}

/** Parse everything before the caller replaces the running session. */
export function loadSession(text: string): GameSession {
  if (text.length > 100_000) throw new Error('Save is too large');
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null || !('schemaVersion' in data) || data.schemaVersion !== 1 ||
      !('npcs' in data) || !Array.isArray(data.npcs) || !('turn' in data) || typeof data.turn !== 'number' ||
      !('selectedId' in data) || typeof data.selectedId !== 'string') throw new Error('Invalid save schema');
  if (data.npcs.length === 0 || data.npcs.length > 100) throw new Error('Invalid NPC count');
  const npcs = data.npcs.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('id' in entry) || typeof entry.id !== 'string' ||
        !('typeId' in entry) || typeof entry.typeId !== 'string' || !('Parameters' in entry)) throw new Error('Invalid saved NPC');
    return createNPCFromInfo(entry.typeId, entry.id, entry.Parameters);
  });
  return new GameSession(npcs, data.turn, data.selectedId);
}
