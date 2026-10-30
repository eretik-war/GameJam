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
