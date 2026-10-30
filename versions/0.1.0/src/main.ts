import * as PIXI from 'pixi.js';
import { resolveImage } from './presentation/images';
import { createSession, loadSession } from './enemies/session';
import { createNPCView } from './enemies/view';
import { InventoryController } from './inventory-controller';
import { HoverCardController, type HoverCardAnchor } from './presentation/hover-card';
import { createEnemyHoverCard, createItemHoverCard } from './presentation/entity-hover-cards';
import { createEnemyIcon, createEnemySprite } from './presentation/enemy-visual';

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
  const heroTexture = getTexture('images/test1.jpg');
  const observer = new ResizeObserver(() => {
    if (disposed) return;
    app.resize(); render();
  });
  observer.observe(canvasHost);

  function render(): void {
    if (disposed) return;
    for (const child of app.stage.removeChildren()) child.destroy({ children: true });
    const enemies = session.deployed;
    const views = enemies.map(createNPCView);
    const width = app.screen.width;
    const height = app.screen.height;
    const hero = new PIXI.Sprite(heroTexture);
    hero.anchor.set(0.5);
    const heroScale = Math.min(width * 0.29 / heroTexture.width, height * 0.8 / heroTexture.height);
    hero.scale.set(heroScale);
    hero.position.set(width * 0.19, height * 0.5);
    app.stage.addChild(hero);
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
      container.hitArea = new PIXI.Rectangle(-visualWidth / 2 - 8, barTop - 22, visualWidth + 16, 104 - barTop);
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

  action('end-turn', () => { session.EndTurn(); return 'Статусы сработали в начале хода.'; });
  action('restore', () => { session.selected.TakeDamage(12); return 'Применено 12 урона: сначала щит, затем здоровье.'; });
  action('burn', () => { session.selected.AddStatus('burning', 3); return 'Горение продлено на 3 хода.'; });
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
