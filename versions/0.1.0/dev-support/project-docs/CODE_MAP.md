# Карта кода и владельцев

| Область | Вход/владелец | Потребители/проверка |
|---|---|---|
| Ключи и объекты параметров | src/domain/parameters.ts | NPC; runtime-проверка JSON; tests/enum-types.ts |
| NPCInfo, каталог/фабрика, текущее Value | src/domain/npc.ts; NPC.ChangeParameter | session/view; tests/domain.test.ts |
| Выбор/ход/сохранение | src/domain/session.ts; GameSession/loadSession | main; round-trip/невалидные saves |
| VisualInfo и общая карточка данных | src/presentation/npc-view.ts; createNPCView | canvas и DOM main.ts |
| Ввод, Pixi-сцена, подписки/lifecycle | src/main.ts | UI и resize; браузерные проверки |
| Разметка и адаптация | src/index.html, src/style.css | build; визуальная матрица |
| Упаковка/HTTP/валидация | корень tools/*.mjs | package.json; dev-support/build-manifest.json |
| GitHub/синхронизация | tools/sync.mjs, tools/sync-auto.ps1; .github/workflows/check.yml | package.json; tools/sync.test.mjs; GITHUB_WORKFLOW.md |
| Движок | корень vendor/pixi-js/7.4.3 | ENGINE_LOCK; immutable, не редактировать |

Пути src/tests относительно активной versions/0.1.0. Зависимости — node_modules/package-lock в корне; vendor нужен без npm в готовом HTML. Generated: builds/preview.html и versions/gamejam_0.1.0-offline.html. Исходники не редактируются через эти артефакты.

Области будущей игры: инвентарь, полноценный бой, ресурсы/звук, платформа. Сейчас у них нет реализованных модулей; не выдумывать их пути. При добавлении указать владельца, потребителей и проверки здесь.

| Противники/щит/статусы | src/enemies/enemy.ts; status-effects/*.ts | enemies/session.ts, enemies/view.ts, main.ts, tests/domain.test.ts |
Новый контракт и границы демо: ENEMIES.md.

| JSON-ассеты Enemy/Attack | корень assets/enemies, assets/attacks; src/enemies/enemy.ts, attack.ts | EnemySession, loadSession, tests/domain.test.ts |
| Изображения и упаковка | корень assets/images; src/presentation/images.ts; tools/build.mjs JPG dataurl | main.ts, offline/HTTP |
