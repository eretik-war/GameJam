import { CampaignSession, battles, cutscenes, createBattle } from './domain/campaign';
import { SceneTransition } from './presentation/scene-transition';
import { CutsceneController } from './cutscene-controller';
import { BattleDialogueController } from './battle-dialogue-controller';
import { effects } from './enemies/status-effects/catalog';
import { TypeEnemyParameter } from './enemies/enemy';
import { TypeInventoryArea, TypeGameStage } from './domain/inventory';
import * as PIXI from 'pixi.js';
import { resolveImage } from './presentation/images';
import { loadSession } from './enemies/session';
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
  const campaign = new CampaignSession();
  let session = createBattle(battles[0]!, 'preview', campaign.hero);
  const transition = new SceneTransition();
  let rewardTimer: ReturnType<typeof setTimeout> | undefined;
  let battleFinished = false;
  let battleIntroShown = false;
  let preview = false;
  const attackMotionMs = 120;
  let combatBusy = false;
  let motion: { id: string; elapsed: number } | undefined;
  const enemySprites = new Map<string, PIXI.Container>();
  let finishWait: (() => void) | undefined;
  let waitRemaining = 0;
  let waitFirstTick = false;
  function waitCombat(ms: number): Promise<void> {
    waitRemaining = ms;
    waitFirstTick = true;
    return new Promise(resolve => { finishWait = resolve; });
  }
  function applyMotion(): void {
    if (!motion) return;
    const offset = Math.sin(Math.PI * Math.min(1, motion.elapsed / attackMotionMs)) * app.screen.width * 0.025;
    if (motion.id === session.hero.id && hero) {
      placeHero(hero, app.screen.width, app.screen.height);
      hero.x += offset;
    } else {
      const sprite = enemySprites.get(motion.id);
      if (sprite) sprite.x = -offset / sprite.parent.scale.x;
    }
  }
  async function attack(id: string): Promise<void> {
    if (combatBusy || !session.CanTarget(id)) return;
    combatBusy = true;
    battleLayout.inert = true;
    requireElement('app').dataset.combatBusy = 'true';
    try {
      const items = inventory.model.slots(TypeInventoryArea.Equipment).map((_, index) => inventory.model.itemAt({ area: TypeInventoryArea.Equipment, index }));
      const sequence = session.AttackSequence(id, items);
      while (!disposed) {
        let step: IteratorResult<string> | undefined;
        battleDialogue.perform(() => { step = sequence.next(); });
        if (!step) break;
        if (step.done) break;
        motion = { id: step.value, elapsed: 0 };
        requireElement('app').dataset.combatActor = step.value;
        render();
        await waitCombat(attackMotionMs);
        if (disposed) return;
        motion.elapsed = attackMotionMs; applyMotion(); motion = undefined;
      }
      if (!disposed) { checkVictory(); render(); }
    } catch (error) { if (!disposed) status.textContent = String(error); }
    finally {
      motion = undefined; combatBusy = false;
      delete requireElement('app').dataset.combatActor;
      requireElement('app').dataset.combatBusy = 'false';
      if (!disposed) battleLayout.inert = cutscene.active || campaign.complete;
    }
  }
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
  const battleLayout = document.querySelector<HTMLElement>('.inventory-layout')!;
  const cutscene = new CutsceneController((choice) => {
    if (transition.busy) return;
    if (choice === "restart") { void switchScene(false, false, true); return; }
    if (preview) { preview = false; void switchScene(false); }
    else void switchScene(true);
  });
  requireElement('app').append(cutscene.element);
  const heroTextures = HERO_FRAME_PATHS.map(getTexture);
  let hero: PIXI.AnimatedSprite | undefined;
  const battleDialogue = new BattleDialogueController(canvasHost, id => id === session.hero.id
    ? (hero ? sceneBounds(hero) : undefined) : enemyAnchors.get(id)?.getBoundingClientRect(),
    () => disposed || transition.busy || cutscene.active || campaign.complete, () => hoverCards.hide());
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
      if (!battleDialogue.active && event.pointerType !== 'touch' && !event.buttons) hoverCards.request(anchor, resolve);
    });
    target.on('pointerout', () => hoverCards.leave(anchor));
    target.on('pointertap', event => {
      if (battleDialogue.active || transition.busy || cutscene.active || campaign.complete || event.button !== 0) return;
      onTap?.(); hoverCards.open(anchor, resolve);
    });
  }
  app.ticker.add(delta => {
    if (!cutscene.active && hero?.playing) hero.update(delta);
    if (document.hidden || disposed) return;
    const ms = waitFirstTick ? 0 : app.ticker.deltaMS;
    waitFirstTick = false;
    if (motion) { motion.elapsed += ms; applyMotion(); }
    if (finishWait) {
      waitRemaining -= ms;
      if (waitRemaining <= 0) { const resolve = finishWait; finishWait = undefined; resolve(); }
    }
    battleDialogue.update(app.ticker.elapsedMS);
  });
  let locationTexture = getTexture('images/battle-location.jpg');
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
    enemySprites.clear();
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
      const body = new PIXI.Container();
      body.addChild(sprite); container.addChild(body); enemySprites.set(view.id, body);
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
        if (combatBusy || battleDialogue.active || transition.busy || campaign.complete || cutscene.active || battleFinished || inventory.model.stage !== TypeGameStage.Combat || inventory.model.awaitingReward) return;
        void attack(view.id);
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
    applyMotion();
    app.renderer.render(app.stage);
    battleDialogue.render();
  }

  function action(id: string, handler: () => string): void {
    requireElement(id).addEventListener('click', () => {
      if (combatBusy || battleDialogue.active || transition.busy || campaign.complete) return;
      try { const message = battleDialogue.perform(handler); if (message !== undefined) status.textContent = message; checkVictory(); render(); }
      catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    });
  }

  const debug = document.querySelector<HTMLElement>('.debug')!;
  debug.hidden = true;
  function onDebugKeyDown(event: KeyboardEvent): void {
    if (!transition.busy && !campaign.complete && !cutscene.active && event.code === 'KeyD' && !event.repeat && !(event.target instanceof HTMLInputElement)) debug.hidden = !debug.hidden;
  }
  document.addEventListener('keydown', onDebugKeyDown);
  action('open-cutscene', () => {
    if (battleFinished || inventory.model.awaitingReward) return 'Сначала завершите текущую награду.';
    preview = true; void switchScene(false, true); return 'Тестовая катсцена.';
  });
  action('hero-one-hp', () => { session.hero.ChangeParameter(TypeEnemyParameter.Health, 1 - session.hero.GetParameter(TypeEnemyParameter.Health)); return 'У героя 1 HP.'; });
  action('end-turn', () => { session.EndTurn(); return 'Статусы сработали в начале хода.'; });
  action('restore', () => { session.selected.TakeDamage(12); return 'Применено 12 урона: сначала щит, затем здоровье.'; });
  action('burn', () => { const effect = effects[Math.floor(Math.random() * effects.length)]!; const turns = effect.typeId === 'stun' ? 1 : 3; session.selected.AddStatus(effect.typeId, turns); return effect.name + ' · +' + turns + ' ход.'; });
  action('save', () => { localStorage.setItem('gamejam.enemies.v2', session.Save()); return 'Снимок текущего боя сохранён. Цепочка и инвентарь не сохраняются.'; });
  action('load', () => {
    const text = localStorage.getItem('gamejam.enemies.v2');
    if (!text) throw new Error('Сохранение ещё не создано.');
    const restored = loadSession(text);
    hoverCards.hide();
    if (battleFinished || inventory.model.awaitingReward) return 'Загрузка недоступна после победы.';
    if (restored.npcs.map(e => e.id).join() !== session.npcs.map(e => e.id).join()) return 'Это сохранение другого боя.';
    campaign.hero = restored.hero;
    session = restored;
    battleDialogue.open(session, false);
    return 'Прогресс восстановлен.';
  });
  function onVisibilityChange(): void {
    if (disposed) return;
    if (document.hidden) app.stop(); else if (!cutscene.active) app.start();
  }
  function onPageShow(): void {
    if (!disposed && !document.hidden && !cutscene.active) app.start();
  }
  function onPageHide(event: PageTransitionEvent): void {
    hoverCards.hide();
    if (event.persisted) { app.stop(); return; }
    disposed = true;
    finishWait?.(); finishWait = undefined;
    document.removeEventListener('keydown', onDebugKeyDown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    observer.disconnect();
    if (rewardTimer) clearTimeout(rewardTimer);
    transition.dispose();
    cutscene.dispose();
    battleDialogue.dispose();
    inventory.dispose();
    hoverCards.destroy();
    app.destroy(true, { children: true, texture: false, baseTexture: false });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  inventory.campaignMode = true;
  inventory.onRewardChosen = () => {
    if (rewardTimer || !battleFinished) return;
    rewardTimer = setTimeout(() => { rewardTimer = undefined; if (!disposed) void switchScene(true); }, 3000);
  };
  function checkVictory(): void {
    if (campaign.current.type !== 'battle' || cutscene.active || battleFinished || campaign.complete) return;
    if (!session.hero.alive) { status.textContent = 'Герой погиб. Прохождение остановлено.'; return; }
    if (session.npcs.every(enemy => !enemy.alive)) {
      battleFinished = true; hoverCards.hide(); debug.hidden = true;
      inventory.finishCombat();
    }
  }
  async function prepareImages(paths: readonly string[]): Promise<void> {
    await Promise.all(paths.map(path => new Promise<void>((resolve,reject) => {
      const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('Не удалось загрузить ' + path)); image.src = resolveImage(path);
    })));
  }
  async function showCurrent(): Promise<void> {
    cutscene.hide(); battleDialogue.hide(); debug.hidden = true; hoverCards.hide();
    const isCutscene = campaign.current.type === 'cutscene';
    requireElement('app').dataset.step = campaign.current.id;
    if (campaign.complete) {
      const end = document.createElement('section'); end.className = 'campaign-end'; end.textContent = 'Тестовая последовательность завершена'; requireElement('app').append(end);
      battleLayout.inert = true; app.stop(); return;
    }
    requireElement('app').classList.toggle('showing-cutscene', isCutscene);
    battleLayout.inert = isCutscene;
    if (isCutscene) { app.stop(); const info = cutscenes.find(c => c.typeId === campaign.current.contentId)!; await prepareImages([info.background]); cutscene.open(info); }
    else {
      const info = battles.find(b => b.typeId === campaign.current.contentId)!;
      await prepareImages([info.background]);
      session = campaign.createBattle(); enemyAnchors.clear(); battleFinished = false;
      locationTexture = getTexture(info.background); inventory.startCombat();
      battleDialogue.open(session, !battleIntroShown); battleIntroShown = true; render();
      if (!document.hidden) app.start();
    }
  }
  async function switchScene(advance: boolean, showPreview = false, restart = false): Promise<void> {
    if (transition.busy || disposed) return;
    requireElement('app').inert = true; cutscene.blocked = true; battleLayout.inert = true; debug.hidden = true; hoverCards.hide(); battleDialogue.hide();
    try {
      await transition.run(async () => {
        if (restart) {
          if (rewardTimer) clearTimeout(rewardTimer); rewardTimer = undefined;
          campaign.restart(); inventory.reset(); preview = false; battleFinished = false; battleIntroShown = false;
          session = createBattle(battles[0]!, "preview", campaign.hero); enemyAnchors.clear();
          await showCurrent(); return;
        }
        if (showPreview) { requireElement('app').classList.add('showing-cutscene'); app.stop(); cutscene.open(); return; }
        if (advance) { campaign.advance(campaign.current.id); await showCurrent(); }
        else { cutscene.hide(); requireElement('app').classList.remove('showing-cutscene'); battleDialogue.resume(); render(); if (!document.hidden) app.start(); }
      });
    } catch (error) { status.textContent = String(error); console.error(error); }
    finally { requireElement('app').inert = false; cutscene.blocked = false; battleLayout.inert = cutscene.active || campaign.complete; if (cutscene.active) cutscene.element.querySelector('button')?.focus(); }
  }
  render();
  void showCurrent().then(() => { requireElement('app').dataset.ready = 'true'; }).catch(error => { status.textContent = String(error); console.error(error); });
  status.textContent = 'Выберите противника нажатием на него. Изменения принадлежат только этой копии.';
} catch (error) {
  status.textContent = `Не удалось запустить игру: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
}
