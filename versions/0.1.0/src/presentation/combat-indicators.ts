import * as PIXI from 'pixi.js';
import type { createNPCView } from '../enemies/view';

/** Shared HP/shield bars and status icons for every combatant. */
export function createCombatIndicators(view: ReturnType<typeof createNPCView>, getTexture: (path: string) => PIXI.Texture): PIXI.Container {
  const container = new PIXI.Container();
  container.name = `indicators-${view.id}`;
  container.eventMode = 'none';
  const bars = new PIXI.Graphics();
  for (const [offset, value, max, color] of [[0, view.health, view.maxHealth, 0x68d99b], [10, view.shield, view.maxShield, 0x64baff]]) {
    bars.beginFill(0x304155).drawRect(-40, offset!, 80, 7).endFill();
    const ratio = max! > 0 ? Math.min(1, value! / max!) : 0;
    if (ratio > 0) bars.beginFill(color!).drawRect(-40, offset!, 80 * ratio, 7).endFill();
  }
  container.addChild(bars);
  view.statuses.forEach((effect, index) => {
    const icon = new PIXI.Sprite(getTexture(effect.imageUrl));
    icon.name = effect.typeId;
    icon.scale.set(Math.min(16 / icon.texture.width, 16 / icon.texture.height));
    icon.anchor.set(0.5, 1);
    icon.position.set(-32 + index * 20, -4);
    container.addChild(icon);
  });
  return container;
}
