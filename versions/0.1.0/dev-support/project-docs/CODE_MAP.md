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
| Привязка карточек к Pixi-целям | src/main.ts; sceneBounds, bindSceneCard | один механизм для противников и анимированного героя; qa/HERO_HOVER.md |
| Упаковка/HTTP/валидация | корень tools/*.mjs | package.json; dev-support/build-manifest.json |
| GitHub/синхронизация | tools/sync.mjs — CLI и компактный вывод; sync-engine.mjs — шаги операции, продолжение, проверки, журнал; sync-support.mjs — Git/файлы/lock/профиль/среда; sync-tasks.mjs — реестр задач и планы; sync-auto.ps1 — консервативный фон | package.json; tools/sync.test.mjs — регрессии; tools/sync-testkit.mjs — шаблонный тестовый репозиторий; tools/sync-bench.mjs — замеры; корневой SYNC_TOOL.md обязателен перед любой задачей; qa/SYNC_CLI_REFERENCE.md — полные параметры; GITHUB_WORKFLOW.md; qa/SYNC_TOOL.md |
| Движок | корень vendor/pixi-js/7.4.3 | ENGINE_LOCK; immutable, не редактировать |

Пути src/tests относительно активной versions/0.1.0. Зависимости — node_modules/package-lock в корне; vendor нужен без npm в готовом HTML. Generated: builds/preview.html и versions/gamejam_0.1.0-offline.html. Исходники не редактируются через эти артефакты.

Области будущей игры: полноценный бой, бонусы предметов, ресурсы/звук, платформа. При добавлении указать владельца, потребителей и проверки здесь. Контракт реализованного инвентаря — [INVENTORY.md](INVENTORY.md).

| Противники/щит/статусы | src/enemies/enemy.ts; status-effects/*.ts | enemies/session.ts, enemies/view.ts, main.ts, tests/domain.test.ts |
| JSON-ассеты Enemy/Attack | корень assets/enemies, assets/attacks; src/enemies/enemy.ts, attack.ts | EnemySession, loadSession, tests/domain.test.ts |
| Изображения и упаковка | корень assets/images; src/presentation/images.ts; tools/build.mjs JPG/PNG dataurl | main.ts, offline/HTTP |
| Слои противников и точки спавна | src/enemies/placement.ts, spawn.ts; assets/enemies/spawn-points.json | EnemyInfo, EnemySession; tests/enemies.test.ts |
| Каталог четырёх камер | assets/enemies/test-enemy.json, camera-enemies.json; src/enemies/enemy.ts | единая фабрика createEnemyFromInfo, EnemySession/loadSession |
| Модульный VisualInfo и точки крепления | assets/enemies/camera-visuals.json; src/enemies/visual-info.ts | createEnemyVisualLayout → presentation/enemy-visual.ts → Pixi, DOM и preview |
| Извлечение и проверка камер | tools/extract-enemy-parts.ps1, preview-enemies.mjs, verify-camera-enemies.mjs | исходники dev-support/art/enemies; qa/MODULAR_ENEMIES.md |
| Фон боевой зоны и наложение инвентаря | assets/images/battle-location.jpg; main.ts первый спрайт; style.css absolute-слои | qa/INVENTORY_OVERLAY.md; сцену и юнитов не смещают |
| Герой: три кадра/idle/положение | src/presentation/hero-animation.ts; createHeroAnimation, placeHero | main.ts renderer/тикер; HERO_ANIMATION.md; qa/HERO_ANIMATION.md |

Контракт противников: [ENEMIES](ENEMIES.md). Проверки объединённой сцены: [SCENE_ASSETS](../qa/SCENE_ASSETS.md).

| Четыре иконки предметов | assets/images/items; src/presentation/item-view.ts, images.ts | tools/extract-item-icons.ps1; tools/verify-item-icons.mjs; qa/ITEM_ICONS.md |

| Герой/урон/бонусы экипировки | assets/heroes/player.json; src/domain/hero.ts, items.ts | heroInfo/heroCombatInfo, Hero.AttackDamage; tests/combat.test.ts |
| Атака/доступная колонка/ответные удары | src/enemies/session.ts; CanTarget/Attack | main.ts; реальные spawn-point, резерв исключён; tests/combat.test.ts |
| Единые боевые параметры/полоски | src/enemies/view.ts createCombatantView; presentation/combat-indicators.ts | герой, камеры, hover, debug; NPC-layout отдельно createNPCView |
