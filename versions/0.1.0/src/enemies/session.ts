import { Enemy, demoEnemyInfo, TypeEnemyParameter } from './enemy';
export class EnemySession {
  constructor(readonly npcs: readonly Enemy[] = Array.from({ length: 5 }, (_, index) => new Enemy(`enemy-${index + 1}`, demoEnemyInfo)), public turn = 1, public selectedId = npcs[0]!.id) {}
  get selected(): Enemy { return this.npcs.find(e => e.id === this.selectedId)!; }
  Select(id: string): void { if (!this.npcs.some(e => e.id === id)) throw new Error('Unknown enemy'); this.selectedId = id; }
  EndTurn(): void { if (!Number.isSafeInteger(this.turn + 1)) throw new Error('Turn overflow'); this.npcs.forEach(e => e.BeginTurn()); this.turn++; }
  Save(): string { return JSON.stringify({ schemaVersion: 2, turn: this.turn, selectedId: this.selectedId, enemies: this.npcs.map(e => e.Save()) }); }
}
export function createSession(): EnemySession { return new EnemySession(); }
export function loadSession(text: string): EnemySession {
  if (text.length > 100000) throw new Error('Save too large');
  const data = JSON.parse(text);
  if (data?.schemaVersion !== 2 || !Number.isSafeInteger(data.turn) || data.turn < 1 || !Array.isArray(data.enemies) || data.enemies.length < 1 || data.enemies.length > 100) throw new Error('Invalid enemy save');
  const ids = new Set<string>();
  const enemies = data.enemies.map((entry: any) => {
    if (!entry || entry.typeId !== demoEnemyInfo.typeId || ids.has(entry.id)) throw new Error('Invalid enemy');
    const enemy = new Enemy(entry.id, demoEnemyInfo); ids.add(entry.id);
    if (!Array.isArray(entry.Parameters) || entry.Parameters.length !== 2) throw new Error('Invalid parameters');
    const seen = new Set();
    for (const p of entry.Parameters) {
      if (!p || !Object.values(TypeEnemyParameter).includes(p.Type) || seen.has(p.Type) || typeof p.Value !== 'number' || !Number.isFinite(p.Value) || p.Value < 0 || (p.Type === TypeEnemyParameter.Health && p.Value > demoEnemyInfo.Parameters.find(parameter => parameter.Type === TypeEnemyParameter.Health)!.Value)) throw new Error('Invalid parameter');
      seen.add(p.Type); enemy.ChangeParameter(p.Type, p.Value - enemy.GetParameter(p.Type));
    }
    if (!Array.isArray(entry.statuses) || entry.statuses.length > 100) throw new Error('Invalid statuses');
    const statusIds = new Set();
    for (const s of entry.statuses) {
      if (!s || statusIds.has(s.typeId) || !enemy.alive) throw new Error('Invalid status');
      statusIds.add(s.typeId); enemy.AddStatus(s.typeId, s.remainingTurns);
    }
    return enemy;
  });
  const session = new EnemySession(enemies, data.turn); session.Select(data.selectedId); return session;
}

