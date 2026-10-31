import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createItemView } from '../src/presentation/item-view';
import { resolveImage } from '../src/presentation/images';

const combatIcons = [
  ['item.09', 'blue'], ['item.10', 'magenta'],
  ['item.11', 'gold'], ['item.12', 'teal'],
] as const;
for (const [typeId, color] of combatIcons) {
  test(`${typeId} uses its supplied ${color} combat icon, embedded identically for every window`, () => {
    const view = createItemView(typeId);
    const imagePath = `images/items/item-combat-${color}.png`;
    assert.equal(view.image, imagePath);
    const embedded = resolveImage(view.image);
    assert.match(embedded, /^data:image\/png;base64,/);
    const png = Buffer.from(embedded.slice(embedded.indexOf(',') + 1), 'base64');
    assert.equal(png.readUInt32BE(16), 128);
    assert.equal(png.readUInt32BE(20), 128);
    assert.deepEqual(png, readFileSync(`assets/${imagePath}`));
    assert.equal(view.attackBonus, 2);
  });
}

test('icon replacement leaves all eight previously existing item mappings unchanged', () => {
  const original = [
    ['item.01', 'item-magenta'], ['item.02', 'item-teal'],
    ['item.03', 'item-blue'], ['item.04', 'item-gold'],
    ['item.05', 'item-module-magenta'], ['item.06', 'item-module-gold'],
    ['item.07', 'item-module-blue'], ['item.08', 'item-module-teal'],
  ];
  for (const [typeId, name] of original) {
    assert.equal(createItemView(typeId!).image, `images/items/${name}.png`);
  }
});
