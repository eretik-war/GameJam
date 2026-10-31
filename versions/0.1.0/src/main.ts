import { effects } from './enemies/status-effects/catalog';
import { TypeEnemyParameter } from './enemies/enemy';
import { TypeInventoryArea, TypeGameStage } from './domain/inventory';
import * as PIXI from 'pixi.js';
import { resolveImage } from './presentation/images';
import { createSession, loadSession } from './enemies/session';
import { createNPCView, createCombatantView } from './enemies/view';
import { InventoryController } from './inventory-controller';
import { HoverCardController, type HoverCardAnchor, type HoverCardView } from './presentation/hover-card';
import { createEnemyHoverCard, createHeroHoverCard, createItemHoverCard } from './presentation/entity-hover-cards';
import { createEnemyIcon, createEnemySprite } from './presentation/enemy-visual';
import { createHeroAnimation, HERO_FRAME_PATHS, placeHero } from './presentation/hero-animation';
import { createCombatIndicators } from './presentation/combat-indicators';

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
  function sceneBounds(target: PIXI.Container): DOMRect {
    const bounds = target.getBounds();
    const canvas = app.view.getBoundingClientRect();
    const scaleX = canvas.width / app.screen.width;
    const scaleY = canvas.height / app.screen.height;
    return new DOMRect(canvas.left + bounds.x * scaleX, canvas.top + bounds.y * scaleY, bounds.width * scaleX, bounds.height * scaleY);
  }
  const heroCard = () => createHeroHoverCard(session.hero, inventory.model.slots(TypeInventoryArea.Equipment)
    .map((_, index) => inventory.model.itemAt({ area: TypeInventoryArea.Equipment, index })));
  function bindSceneCard(target: PIXI.Container, anchor: HoverCardAnchor, resolve: () => HoverCardView, onTap?: () => void): void {
    target.eventMode = 'static';
    target.interactiveChildren = false;
    target.cursor = 'pointer';
    target.on('pointerover', event => {
      if (event.pointerType !== 'touch' && !event.buttons) hoverCards.request(anchor, resolve);
    });
    target.on('pointerout', () => hoverCards.leave(anchor));
    target.on('pointertap', () => { onTap?.(); hoverCards.open(anchor, resolve); });
  }
  app.ticker.add(delta => { if (hero?.playing) hero.update(delta); });
  const locationTexture = getTexture('images/battle-location.jpg');
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
    const enemies = session.deployed;
    const views = enemies.map(createNPCView);
    const width = app.screen.width;
    const height = app.screen.height;
    const background = new PIXI.Sprite(locationTexture);
    background.anchor.set(0.5);
    background.scale.set(Math.max(width / locationTexture.width, height / locationTexture.height));
    background.position.set(width / 2, height / 2);
    background.eventMode = 'none';
    app.stage.addChild(background);
    if (!hero && heroTextures.every(texture => texture.valid)) {
      hero = createHeroAnimation(heroTextures);
      const target = hero;
      bindSceneCard(target, { getBoundingClientRect: () => sceneBounds(target) }, heroCard);
    }
    if (hero) {
      placeHero(hero, width, height);
      app.stage.addChild(hero);
      const indicators = createCombatIndicators(createCombatantView(session.hero), getTexture);
      indicators.scale.set(Math.min(1.25, Math.max(0.67, width / 900), height / 360));
      indicators.position.set(hero.x, hero.y - hero.height - 24 * indicators.scale.y);
      app.stage.addChild(indicators);
    }
    views.forEach((view, index) => {
      const container = new PIXI.Container();
      const point = session.GetSpawnPoint(view.id)!;
      container.x = width * point.x;
      container.y = height * point.y;
      const scale = Math.min(1.25, width / 1100, height / 490);
      container.scale.set(scale);
      const sprite = createEnemySprite(view.visual, getTexture);
      const spriteScale = view.visual.displayScale;
      sprite.scale.set(spriteScale);
      const bounds = view.visual.bounds;
      sprite.position.set(-(bounds.x + bounds.width / 2) * spriteScale, 44 - (bounds.y + bounds.height) * spriteScale);
      if (!enemies[index]!.alive) {
        sprite.children.forEach(part => { (part as PIXI.Sprite).tint = 0x777777; });
      }
      container.addChild(sprite);
      const visualWidth = bounds.width * spriteScale;
      const visualHeight = bounds.height * spriteScale;
      const visualTop = 44 - visualHeight;
      const shape = new PIXI.Graphics();
      if (session.selectedId === view.id) {
        shape.lineStyle(2, 0xffffff, 0.9);
        shape.drawRoundedRect(-visualWidth / 2 - 5, visualTop - 5, visualWidth + 10, visualHeight + 10, 5);
      }
      container.addChild(shape);
      const barTop = visualTop - 28;
      const indicators = createCombatIndicators(view, getTexture);
      indicators.y = barTop;
      container.addChild(indicators);
      // The technical id label is gone; the clickable area now ends just below the feet.
      container.hitArea = new PIXI.Rectangle(-visualWidth / 2 - 8, barTop - 22, visualWidth + 16, 52 - barTop);
      const anchor = enemyAnchors.get(view.id) ?? { getBoundingClientRect: () => new DOMRect() };
      anchor.getBoundingClientRect = () => sceneBounds(container);
      enemyAnchors.set(view.id, anchor);
      bindSceneCard(container, anchor, () => enemyCard(view.id), () => {
        if (inventory.model.stage !== TypeGameStage.Combat || inventory.model.awaitingReward) return;
        const items = inventory.model.slots(TypeInventoryArea.Equipment).map((_, index) => inventory.model.itemAt({ area: TypeInventoryArea.Equipment, index }));
        if (session.Attack(view.id, items)) render();
      });
      app.stage.addChild(container);
    });
    const view = createNPCView(session.selected);
    hoverCards.refresh(true);
    turn.textContent = `Ход ${session.turn} · Герой: ${session.hero.GetParameter(TypeEnemyParameter.Health)} HP · ${session.hero.GetParameter(TypeEnemyParameter.Shield)} щита`;
    panel.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = view.title;
    panel.append(title);
    const icon = createEnemyIcon(view.visual);
    icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', session.selected.EnemyInfo.Name);
    panel.append(icon);
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

  const debug = document.querySelector<HTMLElement>('.debug')!;
  debug.hidden = true;
  function onDebugKeyDown(event: KeyboardEvent): void {
    if (event.code === 'KeyD' && !event.repeat && !(event.target instanceof HTMLInputElement)) debug.hidden = !debug.hidden;
  }
  document.addEventListener('keydown', onDebugKeyDown);
  action('hero-one-hp', () => { session.hero.ChangeParameter(TypeEnemyParameter.Health, 1 - session.hero.GetParameter(TypeEnemyParameter.Health)); return 'У героя 1 HP.'; });
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
    document.removeEventListener('keydown', onDebugKeyDown);
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
