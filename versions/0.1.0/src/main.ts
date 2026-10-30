import * as PIXI from 'pixi.js';
import { createSession, loadSession } from './enemies/session';
import { createNPCView } from './enemies/view';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

const status = requireElement('status');
try {
  const canvasHost = requireElement('scene');
  const panel = requireElement('parameters');
  const turn = requireElement('turn');
  let session = createSession();
  const app = new PIXI.Application<HTMLCanvasElement>({
    backgroundColor: 0x121f30, antialias: true, autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2), resizeTo: canvasHost,
  });
  canvasHost.appendChild(app.view);
  let disposed = false;
  const observer = new ResizeObserver(() => {
    if (disposed) return;
    app.resize(); render();
  });
  observer.observe(canvasHost);

  function render(): void {
    if (disposed) return;
    for (const child of app.stage.removeChildren()) child.destroy({ children: true });
    const views = session.npcs.map(createNPCView);
    const width = app.screen.width;
    views.forEach((view, index) => {
      const container = new PIXI.Container();
      container.x = width * (index + 1) / (views.length + 1);
      container.y = app.screen.height / 2 - 10;
      const shape = new PIXI.Graphics();
      shape.lineStyle(3, session.selectedId === view.id ? 0xffffff : 0x344760);
      shape.beginFill(view.tint).drawRoundedRect(-40, -44, 80, 88, 18).endFill();
      container.addChild(shape);
      const label = new PIXI.Text(`${view.id}\n${view.health} / ${view.maxHealth}`, {
        fontFamily: 'Arial', fontSize: 18, fill: 0xeef7ff, align: 'center',
      });
      label.anchor.set(0.5, 0);
      label.y = 56;
      container.addChild(label);
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.hitArea = new PIXI.Rectangle(-48, -52, 96, 160);
      container.on('pointertap', () => { session.Select(view.id); render(); });
      app.stage.addChild(container);
    });
    const view = createNPCView(session.selected);
    turn.textContent = `Ход ${session.turn}`;
    panel.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = view.title;
    panel.append(title);
    if (session.selected.EnemyInfo.imageUrl) {
      const image = document.createElement('img');
      image.src = session.selected.EnemyInfo.imageUrl;
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
    const buttons = requireElement('selection');
    buttons.replaceChildren();
    for (const npc of session.npcs) {
      const button = document.createElement('button');
      button.textContent = npc.id;
      button.setAttribute('aria-pressed', String(session.selectedId === npc.id));
      button.addEventListener('click', () => { session.Select(npc.id); render(); });
      buttons.append(button);
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
    session = loadSession(text);
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
    if (event.persisted) { app.stop(); return; }
    disposed = true;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    observer.disconnect();
    app.destroy(true, { children: true, texture: false, baseTexture: false });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  render();
  status.textContent = 'Выберите NPC на поле или кнопкой. Изменения принадлежат только этой копии.';
  requireElement('app').dataset.ready = 'true';
} catch (error) {
  status.textContent = `Не удалось запустить WebGL: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
}


