import { effects } from './enemies/status-effects/catalog';
import * as PIXI from 'pixi.js';
import { resolveImage } from './presentation/images';
import { createSession, loadSession } from './enemies/session';
import { createNPCView } from './enemies/view';
import { InventoryController } from './inventory-controller';
import { HoverCardController, type HoverCardAnchor } from './presentation/hover-card';
import { createEnemyHoverCard, createItemHoverCard } from './presentation/entity-hover-cards';
import { createHeroAnimation, HERO_FRAME_PATHS, placeHero } from './presentation/hero-animation';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

const status = requireElement('status');
try {
  const inventory = new InventoryController(requireElement('app'), message => { status.textContent = message; });
  const canvasHost = requireElement('scene');
  const panel = requireElement('parameters');
  const turn = requireElement('turn');
  let session = createSession();
  const app = new PIXI.Application<HTMLCanvasElement>({
    backgroundColor: 0x121f30, antialias: true, autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2), resizeTo: canvasHost,
  });
  canvasHost.appendChild(app.view);
  const hoverCards = new HoverCardController();
  const enemyAnchors = new Map<string, HoverCardAnchor>();
  const enemyCard = (id: string) => createEnemyHoverCard(session.npcs.find(npc => npc.id === id)!);
  hoverCards.bindDelegated(requireElement('app'), '[data-enemy-id]', target => enemyCard(target.dataset.enemyId!));
  hoverCards.bindDelegated(requireElement('app'), '.inventory-slot[data-item-id], .reward-option[data-type-id]', target => {
    return createItemHoverCard(target.dataset.typeId!);
  });
  let disposed = false;
  const textures = new Map<string, PIXI.Texture>();
  function getTexture(path: string): PIXI.Texture {
    const cached = textures.get(path);
    if (cached) return cached;
    const texture = PIXI.Texture.from(resolveImage(path));
    textures.set(path, texture);
    texture.baseTexture.once('loaded', () => { if (!disposed) render(); });
    return texture;
  }
  const heroTextures = HERO_FRAME_PATHS.map(getTexture);
  let hero: PIXI.AnimatedSprite | undefined;
  app.ticker.add(delta => { if (hero?.playing) hero.update(delta); });
  const locationTexture = getTexture('images/battle-location.png');
  const observer = new ResizeObserver(() => {
    if (disposed) return;
    app.resize(); render();
  });
  observer.observe(canvasHost);

  function render(): void {
    if (disposed) return;
    for (const child of app.stage.removeChildren()) {
      if (child !== hero) child.destroy({ children: true });
    }
    const views = session.npcs.map(createNPCView);
    const width = app.screen.width;
    const height = app.screen.height;
    const background = new PIXI.Sprite(locationTexture);
    background.anchor.set(0.5);
    background.scale.set(Math.max(width / locationTexture.width, height / locationTexture.height));
    background.position.set(width / 2, height / 2);
    background.eventMode = 'none';
    app.stage.addChild(background);
    if (!hero && heroTextures.every(texture => texture.valid)) hero = createHeroAnimation(heroTextures);
    if (hero) {
      placeHero(hero, width, height);
      app.stage.addChild(hero);
    }
    const slots = [[0.53, 0.30], [0.75, 0.30], [0.91, 0.5], [0.53, 0.75], [0.75, 0.75]];
    views.forEach((view, index) => {
      const container = new PIXI.Container();
      const slot = slots[index % slots.length]!;
      container.x = width * slot[0]!;
      container.y = height * slot[1]!;
      const scale = Math.min(1.25, Math.max(0.67, width / 900), height / 360);
      container.scale.set(scale);
      const texture = getTexture(view.imageUrl);
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(view.visual.anchor.x, view.visual.anchor.y);
      const spriteScale = Math.min(80 / texture.width, 88 / texture.height) * view.visual.scale;
      sprite.scale.set(spriteScale);
      sprite.position.set(0, 44);
      if (!session.npcs[index]!.alive) sprite.tint = 0x777777;
      container.addChild(sprite);
      const bounds = sprite.getLocalBounds();
      const shape = new PIXI.Graphics();
      shape.lineStyle(3, session.selectedId === view.id ? 0xffffff : 0x344760);
      shape.drawRoundedRect(bounds.x * spriteScale - 3, 44 + bounds.y * spriteScale - 3,
        sprite.width + 6, sprite.height + 6, 3);
      container.addChild(shape);
      const barTop = Math.min(-44, 44 - sprite.height) - 24;
      const bars = new PIXI.Graphics();
      for (const [offset, value, max, color] of [[0, view.health, view.maxHealth, 0x68d99b], [10, view.shield, view.maxShield, 0x64baff]]) {
        const y = barTop + offset!;
        bars.beginFill(0x304155).drawRect(-40, y, 80, 7).endFill();
        const ratio = max! > 0 ? Math.min(1, value! / max!) : 0;
        if (ratio > 0) bars.beginFill(color!).drawRect(-40, y, 80 * ratio, 7).endFill();
      }
      container.addChild(bars);
      view.statuses.forEach((effect, effectIndex) => {
        const icon = new PIXI.Sprite(getTexture(effect.imageUrl));
        const iconScale = Math.min(16 / icon.texture.width, 16 / icon.texture.height);
        icon.scale.set(iconScale);
        icon.anchor.set(0.5, 1);
        icon.position.set(-32 + effectIndex * 20, barTop - 4);
        container.addChild(icon);
      });
      const label = new PIXI.Text(view.id, {
        fontFamily: 'Arial', fontSize: 20, fill: 0xeef7ff, align: 'center',
      });
      label.anchor.set(0.5, 0);
      label.y = 56;
      container.addChild(label);
      container.eventMode = 'static';
      container.interactiveChildren = false;
      container.cursor = 'pointer';
      container.hitArea = new PIXI.Rectangle(-48, -52, 96, 160);
      const anchor = enemyAnchors.get(view.id) ?? { getBoundingClientRect: () => new DOMRect() };
      anchor.getBoundingClientRect = () => {
        const bounds = container.getBounds();
        const canvas = app.view.getBoundingClientRect();
        const scaleX = canvas.width / app.screen.width;
        const scaleY = canvas.height / app.screen.height;
        return new DOMRect(canvas.left + bounds.x * scaleX, canvas.top + bounds.y * scaleY, bounds.width * scaleX, bounds.height * scaleY);
      };
      enemyAnchors.set(view.id, anchor);
      container.on('pointerover', event => {
        if (event.pointerType !== 'touch' && !event.buttons) hoverCards.request(anchor, () => enemyCard(view.id));
      });
      container.on('pointerout', () => hoverCards.leave(anchor));
      container.on('pointertap', () => {
        session.Select(view.id); render();
        hoverCards.open(anchor, () => enemyCard(view.id));
      });
      app.stage.addChild(container);
    });
    const view = createNPCView(session.selected);
    hoverCards.refresh(true);
    turn.textContent = `Ход ${session.turn}`;
    panel.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = view.title;
    panel.append(title);
    if (session.selected.EnemyInfo.imageUrl) {
      const image = document.createElement('img');
      image.src = resolveImage(session.selected.EnemyInfo.imageUrl);
      image.alt = session.selected.EnemyInfo.Name;
      image.style.maxWidth = '100%';
      panel.append(image);
    }
    for (const parameter of view.parameters) {
      const row = document.createElement('p');
      row.textContent = `${parameter.label}: ${parameter.value}`;
      row.dataset.parameter = parameter.type;
      panel.append(row);
    }
    // Refresh world transforms immediately so input after a DOM action uses the new scene.
    app.renderer.render(app.stage);
  }

  function action(id: string, handler: () => string): void {
    requireElement(id).addEventListener('click', () => {
      try { status.textContent = handler(); render(); }
      catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    });
  }

  action('end-turn', () => { session.EndTurn(); return 'Статусы сработали в начале хода.'; });
  action('restore', () => { session.selected.TakeDamage(12); return 'Применено 12 урона: сначала щит, затем здоровье.'; });
  action('burn', () => { const effect = effects[Math.floor(Math.random() * effects.length)]!; const turns = effect.typeId === 'stun' ? 1 : 3; session.selected.AddStatus(effect.typeId, turns); return effect.name + ' · +' + turns + ' ход.'; });
  action('save', () => { localStorage.setItem('gamejam.enemies.v2', session.Save()); return 'Прогресс сохранён в этом браузере.'; });
  action('load', () => {
    const text = localStorage.getItem('gamejam.enemies.v2');
    if (!text) throw new Error('Сохранение ещё не создано.');
    const restored = loadSession(text);
    hoverCards.hide();
    session = restored;
    return 'Прогресс восстановлен.';
  });
  function onVisibilityChange(): void {
    if (disposed) return;
    if (document.hidden) app.stop(); else app.start();
  }
  function onPageShow(): void {
    if (!disposed && !document.hidden) app.start();
  }
  function onPageHide(event: PageTransitionEvent): void {
    hoverCards.hide();
    if (event.persisted) { app.stop(); return; }
    disposed = true;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    observer.disconnect();
    inventory.dispose();
    hoverCards.destroy();
    app.destroy(true, { children: true, texture: false, baseTexture: false });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  render();
  status.textContent = 'Выберите противника нажатием на него. Изменения принадлежат только этой копии.';
  requireElement('app').dataset.ready = 'true';
} catch (error) {
  status.textContent = `Не удалось запустить игру: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
}
