# Противники и статусы

## Каталог и экземпляры

Корневые assets/enemies/test-enemy.json и camera-enemies.json задают четыре типа камер: enemy.trainee (розовая; прежний ID сохранён), enemy.camera.teal, enemy.camera.blue, enemy.camera.gold. Пока все четыре — наземные стрелки с прежними HP/щитом и attack.test. EnemyInfo содержит имя, role, замороженные числовые Parameters, Placement и attackIds. Placement — объект TypeEnemyPlacementParameter.Layer + Value из TypeBattleLayer (ground/air); placement.ts проверяет значение. Это статическое свойство типа.

src/enemies/enemy.ts владеет загрузкой, каталогом, getEnemyInfo и createEnemyFromInfo. Enemy хранит instance ID, ссылку на общий Info, независимые текущие параметры и статусы. ChangeParameter/TakeDamage владеют изменением HP/щита; урон сначала расходует щит. Ноль HP означает смерть. Игровые данные не зависят от Pixi.

assets/attacks/test-attack.json → src/enemies/attack.ts: неизменяемая тестовая AttackInfo, только typeId и имя. Выполнение атак не реализовано.

## Модульное представление

assets/enemies/camera-visuals.json — единственный источник размеров камер, PNG, точек крепления и модулей. Каждый вариант хранит собственный список attachments: детали можно добавлять/снимать независимо от других типов. src/enemies/visual-info.ts проверяет ссылки, совместимость роли/слоя и замораживает вложенные VisualInfo, связанные с игровым Info через typeId. Сокеты: underside, top, rear, lens. Пока заполнен только underside: shooter-leg допускается только для role=shooter и ground. Pivot/scale и socket повторяют предоставленную сборку. Исходники — [art/enemies](../art/enemies/README.md).

createEnemyVisualLayout рассчитывает части и полные границы по общей политике. presentation/enemy-visual.ts использует результат для Pixi-сцены и DOM-иконки debug-панели; tools/preview-enemies.mjs использует тот же resolver и компоновщик. Живые спрайты, текстуры, события и lifecycle принадлежат renderer/main.ts. Собранные PNG не дублируются в runtime: камера и ножки остаются отдельными частями.

Корневой assets/images/enemies содержит четыре camera-*.png и shooter-leg.png. Камеры вырезаны с сохранением пикселей/alpha; общий canvas не обрезает жёлтый вариант. test1.jpg остаётся героем. Статусы используют fire.jpg, blindness.png, stun.jpg и regeneration.png. Прежние tes2.jpg/testeffect.jpg сохранены, runtime их больше не загружает. presentation/images.ts разрешает пути; tools/build.mjs встраивает JPG/PNG как data URI для HTTP и file://.

src/enemies/view.ts предоставляет одну карточку текущих/базовых HP/щита, размещения, роли и статусов. Над полным силуэтом: зелёная полоска HP, синяя щита, выше иконки статусов. Доли ограничены 100%; нулевая база даёт пустую полоску. Выбранный Enemy обведён белой рамкой; hit-area включает голову и ножки. Hover использует тот же createNPCView. Из origin/main объединены фон battle-location.png (первый неинтерактивный спрайт, cover) и absolute-наложение инвентаря. Общий контракт наложений принадлежит MOBILE_UI_ASSETS; сцену/юнитов они не сдвигают.

## Точки спавна

assets/enemies/spawn-points.json сохраняет исходные нормализованные координаты. spawn-1 (0.53, 0.30) и spawn-2 (0.75, 0.30) — air. spawn-3 (0.91, 0.50), spawn-4 (0.53, 0.75), spawn-5 (0.75, 0.75) — ground. Интерпретация разметки пользователя: правая и две нижние позиции наземные, верхние воздушные.

SpawnPointInfo имеет собственный параметр TypeSpawnPointParameter.Layer + Value TypeBattleLayer. spawn.ts владеет справочником и canSpawn/spawnEnemy: несовпадающий слой или занятая точка — ошибка. EnemySession владеет связью instance ID → spawn-point ID; renderer берёт координаты оттуда вместо выбора по индексу массива.

Новая сцена занимает три наземные точки (enemy-3/4/5) розовым, бирюзовым и голубым типами. Жёлтый готов в каталоге/preview. Воздушных типов в runtime пока нет, две воздушные точки пусты. Четыре визуала не означают четыре одновременно занятых наземных места.

## Статусы и сохранение

IStatusEffect содержит typeId, name, imageUrl и Tick. Burning использует images/fire.jpg и наносит 3 урона за тик. Blindness даёт 50% промаха через Enemy.CanAttack, Stun запрещает атаку до следующего BeginTurn, Regeneration восстанавливает 3 HP с ограничением базовым максимумом. Каталог содержит отдельный неизменяемый экземпляр каждого типа. Debug-кнопка случайно выбирает один из четырёх эффектов: stun на 1 ход, остальные на 3.

Повторное наложение складывает длительность. В начале общего хода статусы обрабатываются по порядку наложения, затем срок уменьшается и истёкшие удаляются. Смерть снимает статусы. Сохранение хранит ID эффекта и длительность. Полноценный исполнитель атак отсутствует; будущая атака должна вызывать CanAttack до истечения соответствующих статусов.

schemaVersion 2 и ключ gamejam.enemies.v2 сохранены. Enemy сохраняет typeId, ID и состояние; сессия добавляет spawnPointId (null — резерв). loadSession восстанавливает любой из четырёх типов через единый каталог, проверяет занятость/слой, дубли и параметры до замены текущей сессии.

Старые v2 без spawnPointId сохраняют исходный состав, выбранного, ход и значения. Подходящие точки назначаются с приоритетом выбранного; лишние наземные экземпляры остаются в сохранённом резерве. Отдельного UI резерва нет, EndTurn обрабатывает прежний состав. Старые NPC-сохранения не мигрируют. Инвентарь не входит в enemy-save.

## Изменение ассета

1. Добавить игровой JSON и зарегистрировать его в enemyCatalog. parameters содержит ровно health/shield без дублей, HP > 0, щит >= 0; placement/role и ссылки attackIds проверяются загрузчиком.
2. Добавить VisualInfo с тем же typeId в camera-visuals.json. Состав/размеры/сокеты редактировать здесь, без копий формулы в main или CURRENT_STATE. Изображение зарегистрировать в presentation/images.ts и RESOURCE_REGISTRY активной версии.
3. Спавнить совместимые типы через spawn.ts и сохранять связь в EnemySession. Начальная позиция справочника не является состоянием EnemyInfo.
4. Для статуса реализовать отдельный IStatusEffect, зарегистрировать в status-effects/catalog.ts, добавить изображение в общий реестр.
5. Выполнить npm run check, собрать preview и проверить desktop HTTP/file. Текущие результаты — [MODULAR_ENEMIES](../qa/MODULAR_ENEMIES.md); прежняя сцена — [SCENE_ASSETS](../qa/SCENE_ASSETS.md).
