import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleDialogueSession } from '../src/domain/battle-dialogue';
import { EnemySession } from '../src/enemies/session';
import { createEnemyFromInfo } from '../src/enemies/enemy';
import { Hero } from '../src/domain/hero';

// Explicit encounter keeps dialogue tests independent of edits to the campaign sequence.
const battle = (id = 'dialogue-test') => {
  const enemies = [createEnemyFromInfo('enemy.camera.teal', `${id}-teal`), createEnemyFromInfo('enemy.camera.blue', `${id}-blue`)];
  return new EnemySession(enemies, 1, enemies[0]!.id, [
    { enemyId: enemies[0]!.id, spawnPointId: 'spawn-4' },
    { enemyId: enemies[1]!.id, spawnPointId: 'spawn-5' },
  ], new Hero());
};

test('pre-battle dialogue has exactly three named lines and advances only on left clicks', () => {
  const fight = battle();
  const dialogue = new BattleDialogueSession(fight);
  assert.equal(dialogue.active, true);
  const lines = [dialogue.intro!];
  assert.equal(dialogue.advance(2), false);
  assert.equal(dialogue.intro, lines[0]);
  assert.equal(dialogue.advance(0), true); lines.push(dialogue.intro!);
  assert.equal(dialogue.advance(0), true); lines.push(dialogue.intro!);
  assert.equal(dialogue.active, true);
  assert.deepEqual(lines.map(line => line.speakerId), [fight.deployed[0]!.id, fight.hero.id, fight.deployed[0]!.id]);
  assert.deepEqual(lines.map(line => line.name), ['Бирюзовый младший брат', 'Герой', 'Бирюзовый младший брат']);
  assert.deepEqual(lines.map(line => line.index), [1, 2, 3]);
  assert.ok(lines.every(line => line.total === 3 && line.opacity === 1 && line.text.length > 0));
  assert.ok(lines.filter(line => line.speakerId !== fight.hero.id).every(line => /старший брат/i.test(line.text)));
  assert.equal(dialogue.advance(0), true);
  assert.equal(dialogue.active, false);
  assert.equal(dialogue.intro, undefined);
  assert.equal(dialogue.advance(0), false);
});

test('shield hits hold two seconds, fade for one, ignore clicks and are removed', () => {
  const fight = battle();
  const dialogue = new BattleDialogueSession(fight);
  while (dialogue.active) dialogue.advance(0);
  const target = fight.deployed[0]!;
  dialogue.perform(() => target.TakeDamage(3));
  assert.equal(dialogue.hits.length, 1);
  assert.equal(dialogue.hits[0]!.speakerId, target.id);
  assert.equal(dialogue.hits[0]!.name, target.EnemyInfo.Name);
  assert.equal(dialogue.hits[0]!.kind, 'hit');
  assert.match(dialogue.hits[0]!.text, /старший брат/i);
  assert.equal(dialogue.hits[0]!.opacity, 1);
  dialogue.update(1999);
  assert.equal(dialogue.advance(0), false);
  assert.equal(dialogue.hits[0]!.opacity, 1);
  dialogue.update(501);
  assert.equal(dialogue.hits[0]!.opacity, 0.5);
  dialogue.update(499);
  assert.ok(dialogue.hits[0]!.opacity > 0 && dialogue.hits[0]!.opacity < 0.01);
  dialogue.update(1);
  assert.equal(dialogue.hits.length, 0);
});

test('intro blocks combat; misses and rejected targets do not produce hit messages', () => {
  const fight = battle();
  const dialogue = new BattleDialogueSession(fight);
  const snapshot = fight.Save();
  let calls = 0;
  assert.equal(dialogue.perform(() => { calls++; return fight.Attack(fight.deployed[0]!.id); }), undefined);
  assert.equal(calls, 0); assert.equal(fight.Save(), snapshot);
  while (dialogue.active) dialogue.advance(0);
  assert.equal(dialogue.perform(() => fight.Attack('missing')), false);
  assert.equal(dialogue.hits.length, 0);
  fight.hero.AddStatus('blindness', 2);
  assert.equal(dialogue.perform(() => fight.Attack(fight.deployed[0]!.id, [], () => 0)), true);
  assert.equal(dialogue.hits.length, 0);
});

test('repeated hits restart one bubble lifetime per speaker and lethal hits can speak', () => {
  const fight = battle();
  const dialogue = new BattleDialogueSession(fight, false);
  const target = fight.deployed[0]!;
  dialogue.perform(() => target.TakeDamage(3));
  dialogue.update(2500);
  dialogue.perform(() => target.TakeDamage(3));
  assert.equal(dialogue.hits.length, 1); assert.equal(dialogue.hits[0]!.opacity, 1);
  dialogue.perform(() => fight.deployed[1]!.TakeDamage(2));
  assert.equal(dialogue.hits.length, 2);
  dialogue.perform(() => target.TakeDamage(999));
  assert.equal(target.alive, false);
  assert.equal(dialogue.hits.length, 2); assert.equal(dialogue.hits.find(m => m.speakerId === target.id)!.opacity, 1);
  assert.ok(Object.isFrozen(dialogue.hits)); assert.ok(Object.isFrozen(dialogue.hits[0]));
  dialogue.update(3000); assert.equal(dialogue.hits.length, 0);
});

test('fresh battles bind their own speakers; dialogue time never mutates combat or shared Info', () => {
  const first = battle('first'), next = battle('next');
  const oldDialogue = new BattleDialogueSession(first, false);
  oldDialogue.perform(() => first.deployed[0]!.TakeDamage(1));
  const newDialogue = new BattleDialogueSession(next);
  assert.notEqual(oldDialogue.hits[0]!.speakerId, newDialogue.intro!.speakerId);
  assert.equal(newDialogue.hits.length, 0); assert.equal(newDialogue.active, true);
  const snapshot = next.Save(); newDialogue.update(10000);
  assert.equal(next.Save(), snapshot); assert.equal(newDialogue.intro!.index, 1);
  assert.equal(first.deployed[0]!.EnemyInfo, next.deployed[0]!.EnemyInfo);
  assert.throws(() => newDialogue.update(NaN), /Invalid dialogue time/);
  assert.throws(() => newDialogue.update(-1), /Invalid dialogue time/);
  assert.equal(newDialogue.intro!.index, 1);
});
