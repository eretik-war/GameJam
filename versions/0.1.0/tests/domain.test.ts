import test from 'node:test';
import assert from 'node:assert/strict';
import { createNPCFromInfo, traineeInfo } from '../src/domain/npc';
import { Parameter, RestoreParameter, TypeNPCParameter } from '../src/domain/parameters';
import { GameSession, createSession, loadSession } from '../src/domain/session';
import { createNPCView } from '../src/presentation/npc-view';

test('instances own independent parameter objects; Info and snapshots stay frozen', () => {
  const a = createNPCFromInfo('npc.trainee', 'a');
  const b = createNPCFromInfo('npc.trainee', 'b');
  a.ChangeParameter(TypeNPCParameter.Health, -25);
  assert.equal(a.GetParameter(TypeNPCParameter.Health), 75);
  assert.equal(b.GetParameter(TypeNPCParameter.Health), 100);
  assert.equal(a.NPCInfo, b.NPCInfo);
  assert.equal(traineeInfo.Parameters[0]!.Value, 100);
  assert.ok(Object.isFrozen(traineeInfo.Parameters[0]));
  assert.throws(() => { (a.Parameters[0] as Parameter<TypeNPCParameter>).Value = 1; });
});

test('restore is additive, clamps to explicit health range and updates the common view', () => {
  const npc = createNPCFromInfo('npc.trainee', 'a');
  npc.ChangeParameter(TypeNPCParameter.Health, -80);
  npc.ApplyRestore(new RestoreParameter(TypeNPCParameter.Health, 15));
  assert.equal(createNPCView(npc).health, 35);
  npc.ApplyRestore(new RestoreParameter(TypeNPCParameter.Health, 200));
  assert.equal(npc.GetParameter(TypeNPCParameter.Health), 100);
  npc.ChangeParameter(TypeNPCParameter.Health, -200);
  assert.equal(npc.GetParameter(TypeNPCParameter.Health), 0);
  assert.throws(() => npc.ChangeParameter(TypeNPCParameter.Health, NaN));
});

test('round-trip restores IDs, selected target, turn, values and the original Info reference', () => {
  const source = createSession();
  source.Select('npc-2');
  source.EndTurn();
  const restored = loadSession(source.Save());
  assert.equal(restored.Save(), source.Save());
  assert.equal(restored.selected.NPCInfo, traineeInfo);
  restored.RestoreHealth();
  assert.equal(source.selected.GetParameter(TypeNPCParameter.Health), 90);
  assert.equal(restored.selected.GetParameter(TypeNPCParameter.Health), 100);
});

test('invalid saves fail without replacing the running session', () => {
  const running = createSession();
  const before = running.Save();
  const cases = [
    (d: any) => { d.schemaVersion = 99; },
    (d: any) => { d.npcs[0].typeId = 'unknown'; },
    (d: any) => { d.npcs[1].id = d.npcs[0].id; },
    (d: any) => { d.npcs[0].Parameters[0].Type = 'unknown'; },
    (d: any) => { d.npcs[0].Parameters.push(d.npcs[0].Parameters[0]); },
    (d: any) => { d.npcs[0].Parameters.pop(); },
    (d: any) => { d.npcs[0].Parameters[0].Value = -1; },
    (d: any) => { d.npcs[0].Parameters[0].Value = 101; },
    (d: any) => { d.selectedId = 'missing'; },
    (d: any) => { d.turn = 1.5; },
  ];
  for (const mutate of cases) {
    const invalid = JSON.parse(before);
    mutate(invalid);
    assert.throws(() => loadSession(JSON.stringify(invalid)));
    assert.equal(running.Save(), before);
  }
  assert.throws(() => new GameSession([running.selected, running.selected]));
  assert.throws(() => loadSession('not json'));
});

import { Enemy, EnemyInfo, TypeEnemyParameter } from '../src/enemies/enemy';
import { createSession as createEnemySession, loadSession as loadEnemySession } from '../src/enemies/session';
test('enemy shield absorbs damage and instances remain independent', () => {
  const info = new EnemyInfo('test', 'Test', 30, 8, '');
  const a = new Enemy('a', info), b = new Enemy('b', info);
  a.TakeDamage(12);
  assert.equal(a.GetParameter(TypeEnemyParameter.Health), 26);
  assert.equal(a.GetParameter(TypeEnemyParameter.Shield), 0);
  assert.equal(b.GetParameter(TypeEnemyParameter.Shield), 8);
  a.TakeDamage(100); assert.equal(a.alive, false);
  assert.throws(() => b.TakeDamage(-1));
});
test('statuses extend duration, tick through shield and expire independently', () => {
  const session = createEnemySession(); const a = session.selected;
  a.AddStatus('burning', 1); a.AddStatus('burning', 2);
  assert.equal(a.statuses[0]!.remainingTurns, 3);
  session.EndTurn(); assert.equal(a.GetParameter(TypeEnemyParameter.Shield), 5);
  assert.equal(session.npcs[1]!.statuses.length, 0);
  const restored = loadEnemySession(session.Save()); assert.equal(restored.Save(), session.Save());
  session.EndTurn(); session.EndTurn();
  assert.equal(a.statuses.length, 0); assert.equal(a.GetParameter(TypeEnemyParameter.Health), 29);
  assert.throws(() => a.AddStatus('unknown', 2));
  assert.throws(() => a.AddStatus('burning', 0));
  const bad = JSON.parse(restored.Save()); bad.enemies[0].statuses[0].remainingTurns = -1;
  assert.throws(() => loadEnemySession(JSON.stringify(bad)));
});
