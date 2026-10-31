import * as PIXI from 'pixi.js';
import type { createEnemyVisualLayout } from '../enemies/visual-info';
import { resolveImage } from './images';

type Layout = ReturnType<typeof createEnemyVisualLayout>;
export function createEnemySprite(layout: Layout, getTexture: (path: string) => PIXI.Texture): PIXI.Container {
  const visual = new PIXI.Container();
  for (const part of layout.parts) {
    if (!part.visible) continue;
    const sprite = new PIXI.Sprite(getTexture(part.image));
    sprite.position.set(part.x, part.y); sprite.width = part.width; sprite.height = part.height;
    visual.addChild(sprite);
  }
  return visual;
}
export function createEnemyIcon(layout: Layout): HTMLElement {
  const icon = document.createElement('span');
  icon.className = 'enemy-visual';
  icon.style.aspectRatio = `${layout.bounds.width} / ${layout.bounds.height}`;
  for (const part of layout.parts) {
    if (!part.visible) continue;
    const image = document.createElement('img');
    image.src = resolveImage(part.image); image.alt = '';
    image.style.left = `${(part.x - layout.bounds.x) / layout.bounds.width * 100}%`;
    image.style.top = `${(part.y - layout.bounds.y) / layout.bounds.height * 100}%`;
    image.style.width = `${part.width / layout.bounds.width * 100}%`;
    image.style.height = `${part.height / layout.bounds.height * 100}%`;
    icon.append(image);
  }
  return icon;
}
