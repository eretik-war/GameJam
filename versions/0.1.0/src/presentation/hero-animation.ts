import * as PIXI from 'pixi.js';

export const HERO_FRAME_PATHS = Object.freeze([
  'images/hero/Stand1.png', 'images/hero/Stand2.png', 'images/hero/Stand3.png',
]);
export const HERO_CYCLE_MS = 500;

// One shared alpha union for all supplied frames keeps feet and padding stable.
const frame = Object.freeze({ x: 144, y: 79, width: 229, height: 932 });

/** Owned by the renderer; the application's ticker controls animation/lifecycle. */
export function createHeroAnimation(textures: readonly PIXI.Texture[]): PIXI.AnimatedSprite {
  if (textures.length !== HERO_FRAME_PATHS.length || textures.some(texture => !texture.valid)) {
    throw new Error('Hero animation requires three loaded frames.');
  }
  const frames = textures.map(texture => ({
    texture: new PIXI.Texture(texture.baseTexture, new PIXI.Rectangle(frame.x, frame.y, frame.width, frame.height)),
    time: HERO_CYCLE_MS / textures.length,
  }));
  const hero = new PIXI.AnimatedSprite(frames, false);
  hero.name = 'player-hero';
  hero.anchor.set(0.5, 1);
  hero.eventMode = 'none';
  hero.play();
  return hero;
}

/** The marked reference box: ~32% across, feet at ~92%, height ~69% of the scene. */
export function placeHero(hero: PIXI.AnimatedSprite, width: number, height: number): void {
  hero.scale.set(Math.min(width * 0.1054 / frame.width, height * 0.694 / frame.height));
  hero.position.set(width * 0.318, height * 0.916);
}
