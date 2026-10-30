# Карта кода и владельцев

| Область | Вход/владелец | Потребители/проверка |
|---|---|---|
| Ключи и объекты параметров | src/domain/parameters.ts | NPC; runtime-проверка JSON; tests/enum-types.ts |
| NPCInfo, каталог/фабрика, текущее Value | src/domain/npc.ts; NPC.ChangeParameter | session/view; tests/domain.test.ts |
| Выбор/ход/сохранение | src/domain/session.ts; GameSession/loadSession | main; round-trip/невалидные saves |
| VisualInfo и общая карточка данных | src/presentation/npc-view.ts; createNPCView | canvas и DOM main.ts |
| Ввод, Pixi-сцена, подписки/lifecycle | src/main.ts | UI и resize; браузерные проверки |
| Разметка и адаптация | src/index.html, src/style.css | build; визуальная матрица |
| Типы и экземпляры предметов | src/domain/items.ts; ItemInfo, Item, createItemFromInfo | InventorySession; tests/inventory.test.ts |
| Инвентарь, стадии, награды и переносы | src/domain/inventory.ts; InventorySession | src/inventory-controller.ts; tests/inventory.test.ts |
| Общее представление предмета | src/presentation/item-view.ts; createItemView, createItemIcon | слоты, карманы, награды и drag ghost |
| Ввод инвентаря/диалог/lifecycle | src/inventory-controller.ts; InventoryController | main.ts; qa/INVENTORY.md |
| Всплывающие карточки персонажей/предметов | src/presentation/hover-card.ts; HoverCardView, HoverCardController | main.ts Pixi anchors / bindDelegated / refresh / destroy; qa/HOVER_CARDS.md |
| Данные карточек реальных сущностей | src/presentation/entity-hover-cards.ts; createEnemyHoverCard, createHeroHoverCard, createItemHoverCard | enemies/view.ts, InventorySession и item-view.ts → единый HoverCardView |
| Упаковка/HTTP/валидация | корень tools/*.mjs | package.json; dev-support/build-manifest.json |
| GitHub/синхронизация | tools/sync.mjs, tools/sync-auto.ps1; .github/workflows/check.yml | package.json; tools/sync.test.mjs; GITHUB_WORKFLOW.md |
| Движок | корень vendor/pixi-js/7.4.3 | ENGINE_LOCK; immutable, не редактировать |

Пути src/tests относительно активной versions/0.1.0. Зависимости — node_modules/package-lock в корне; vendor нужен без npm в готовом HTML. Generated: builds/preview.html и versions/gamejam_0.1.0-offline.html. Исходники не редактируются через эти артефакты.

Области будущей игры: полноценный бой, бонусы предметов, ресурсы/звук, платформа. При добавлении указать владельца, потребителей и проверки здесь. Контракт реализованного инвентаря — [INVENTORY.md](INVENTORY.md).

| Противники/щит/статусы | src/enemies/enemy.ts; status-effects/*.ts | enemies/session.ts, enemies/view.ts, main.ts, tests/domain.test.ts |
| JSON-ассеты Enemy/Attack | корень assets/enemies, assets/attacks; src/enemies/enemy.ts, attack.ts | EnemySession, loadSession, tests/domain.test.ts |
| Изображения и упаковка | корень assets/images; src/presentation/images.ts; tools/build.mjs JPG/PNG dataurl | main.ts, offline/HTTP |
| Фон боевой зоны и наложение инвентаря | assets/images/battle-location.png; main.ts первый спрайт; style.css absolute-слои | qa/INVENTORY_OVERLAY.md; сцену и юнитов не смещают |
| Герой: три кадра/idle/положение | src/presentation/hero-animation.ts; createHeroAnimation, placeHero | main.ts renderer/тикер; HERO_ANIMATION.md; qa/HERO_ANIMATION.md |

Контракт противников: [ENEMIES](ENEMIES.md). Проверки объединённой сцены: [SCENE_ASSETS](../qa/SCENE_ASSETS.md).

| Карточка героя | src/presentation/entity-hover-cards.ts; createHeroHoverCard; main.ts heroAnchor | Hero через createNPCView и InventorySession; qa/HERO_HOVER.md |
