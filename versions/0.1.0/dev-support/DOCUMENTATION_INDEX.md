# Индекс документации GameJam

Корневые пути относительно GameJam; file ниже — относительно активной versions/0.1.0. Для общего знакомства читать базовый набор. Для конкретного направления выбрать только нужные строки и CODE_MAP; при расширении области снова использовать индекс. Canonical чтение — standards/PROJECT_READING_RULES.md.

root_file: `AGENTS.md` — правила работы нейронки.
root_file: `SYNC_TOOL.md` — короткая обязательная перед любой задачей инструкция: режим, границы, маршрутизация, состав порции, остановки. Чтение не запускает синхронизацию.
root_file: `READ_FIRST_LATEST_PROJECT.md` — режим входа/активная версия.
root_file: `START_HERE.md` — настройка для человека.
root_file: `README.md` — краткий вход с GitHub.
root_file: `PROJECT_MANIFEST.json` — указатели.
root_file: `ENGINE_LOCK.json` — локальный движок/SHA.
root_file: `package.json` — команды/точные пакеты; package-lock.json — весь граф.

file: `dev-support/PROJECT_INSTRUCTIONS.md`
summary: Базовый набор; постоянные правила проекта.

file: `dev-support/project-docs/CURRENT_STATE.md`
summary: Базовый набор; только актуальные статус/разрешение/следующий шаг. Прошлые этапы вынесены в архив по ссылке внутри; архив не читать при обычном входе.

file: `dev-support/project-docs/BATTLE_DIALOGUE.md`
summary: Три реплики только в первом бою, имена младших братьев, неблокирующие реплики при уроне (2 секунды + 1 секунда fade), владельцы и HTTP/file-проверки.

file: `dev-support/project-docs/CODE_MAP.md`
summary: Базовый набор; карта владельцев и потребителей, предметный поиск.

file: `dev-support/project-docs/WORKFLOW.md`
summary: Базовый набор; итерация, работа вдвоём, передача.

file: `dev-support/project-docs/GITHUB_WORKFLOW.md`
summary: При входе/восстановлении читать активный режим: по умолчанию локальная пауза, прямое поручение разрешает разовую синхронизацию, но не автоматику. Остальные разделы — по задаче о Git.

file: `dev-support/qa/GITHUB_WORKFLOW_AUDIT.md`
summary: Анализ затрат Git-процесса по локальным журналам: метрики, причины, реализованная пауза и предлагаемый порядок интеграции. Читать при изменении рабочего процесса.

file: `dev-support/qa/GIT_SKILLS_RESEARCH.md`
summary: Исследование популярных готовых Git/GitHub/context skills: звёзды и установки, исходные процессы, совместимость с GameJam и выборочная рекомендация. Навыки не установлены; синхронизация проекта остаётся на паузе.

file: `dev-support/qa/SYNC_INTEGRATION.md`
summary: Проверка объединения всех локальных доработок с поддержкой/щитовиками/ножками из GitHub, конфликты, регрессии и границы QA.

file: `dev-support/qa/SYNC_TOOL.md`
summary: Проверка единого скрипта: пакет файлов/commits, журнал авторства, изолированный merge, конфликты, продолжения и одновременные push. Пользовательская инструкция — корневой SYNC_TOOL.md.

file: `dev-support/qa/SYNC_CLI_REFERENCE.md`
summary: Полный справочник скрипта: обычная цепочка, продолжение конфликта, подтверждения проверок, реестр задач, планы, состояния, вывод и замеры. Читать только для Git-задачи или конкретного исключения.

file: `dev-support/qa/SYNC_PERFORMANCE.md`
summary: Замеры до/после: подготовка тестовых репозиториев, прогоны проверок при конфликте, число Git-процессов, объём вывода и честные границы вывода о токенах. Читать при изменении протокола.

file: `dev-support/project-docs/PIXIJS_GUIDE.md`
summary: Базовый набор; движок, setup, API v7, lifecycle, offline.

file: `dev-support/project-docs/RUN_COMMANDS.md`
summary: Базовый набор; команды/настройка/ошибки.

file: `dev-support/project-docs/ARCHITECTURE_2D.md`
summary: Базовый набор; слои, инвентарь, действия, save.

file: `dev-support/project-docs/INVENTORY.md`
summary: Реализованный инвентарь: владельцы, 3 активных слота/4×3 кармана, стадии, награды, переносы, границы сохранения. Определения предметов разделены по семействам; актуальная карта — COMBAT_ITEMS.

file: `dev-support/project-docs/COMBAT_ITEMS.md`
summary: Отдельное семейство item.09–12, объединённый каталог/рандом наград, уклонение/перенос, усиление щита/здоровья, владельцы формул и desktop HTTP/file-проверка.

file: `dev-support/qa/INVENTORY.md`
summary: Проверка инвентаря: модель, mouse/touch/keyboard, полные карманы, HTTP/изолированный file и адаптация.

file: `dev-support/qa/INVENTORY_OVERLAY.md`
summary: Инвентарь поверх боевой сцены без сдвига: desktop HTTP/file, неизменная геометрия/пиксели противников, фон на всю высоту зоны.

file: `dev-support/project-docs/HERO_ANIMATION.md`
summary: Три прозрачных кадра героя, цикл 0,5 секунды, владелец визуального размещения и lifecycle.

file: `dev-support/qa/HERO_ANIMATION.md`
summary: Проверка длительности цикла, устойчивого экземпляра и положения героя в desktop HTTP/file.

file: `dev-support/standards/INFO_OBJECT_RULES.md`
summary: Базовый набор; до изменения сущностей/каталогов/связей/сохранений.

file: `dev-support/standards/PARAMETER_OBJECT_RULES.md`
summary: Базовый набор; enum/Value, NPCInfo/NPC, эффекты.

file: `dev-support/project-docs/QUALITY_CHECKLIST.md`
summary: Базовый набор; критерии передачи и проверки.

file: `dev-support/project-docs/MOBILE_UI_ASSETS.md`
summary: Базовый набор; UI/ресурсы/звук: до правки размеров, атласов/лицензий.

file: `dev-support/qa/HOVER_CARDS.md`
summary: UI: общие карточки реальных противников, наград и предметов; задержка, drag/lifecycle и браузерные проверки.

file: `dev-support/qa/HERO_HOVER.md`
summary: UI: карточка анимированного героя, данные инвентаря, общая Pixi-привязка и проверка без смещения сцены.

file: `dev-support/standards/UI_SIZE_CONTRACT.json`
summary: UI: числовая принятая геометрия Forest Alchemy; выбирать нужный компонент.

file: `dev-support/standards/ui-size-contract.css`
summary: UI: соответствующая геометрия/раскладки.

file: `dev-support/standards/PROJECT_READING_RULES.md`
summary: Навигация: общий/предметный режим и расширение.

file: `dev-support/standards/SOURCE_PROVENANCE.json`
summary: Обновление snapshot: происхождение и SHA; внешний путь только метаданные.

file: `dev-support/project-docs/WORK_MODES.md`
summary: Выбор глубины проверки/чтения.

file: `dev-support/project-docs/DECISION_LOG.md`
summary: Архитектурный вопрос: только принятые решения.

file: `dev-support/project-docs/RESEARCH_REGISTER.md`
summary: Повторное исследование: проверенные источники/границы.

file: `dev-support/project-docs/EXPERIMENTS.md`
summary: Контролируемые сравнения.

file: `dev-support/project-docs/INCIDENTS.md`
summary: Сбой: причина/восстановление.

file: `dev-support/project-docs/BACKLOG.md`
summary: Планирование: гипотезы без реализации.

file: `dev-support/VERSION.md`
summary: История версии.

file: `assets/RESOURCE_REGISTRY.json`
summary: Добавление/замена ресурсов: лицензии/происхождение.

Отчёт фактических проверок после подготовки: dev-support/qa/VERIFICATION.md. Generated build-manifest принадлежит tools/build.mjs. node_modules/vendor/builds/backups/work и соседние игры не входят в default reading.

file: `dev-support/project-docs/ENEMIES.md`
summary: Камеры/индивидуальные атаки, воздушная поддержка/ауры, щитовики/провокация, общий view, роботизированные ножки и saves v2.

file: `dev-support/qa/SCENE_ASSETS.md`
summary: Проверки объединённой сцены, JSON-ассетов, полосок и статусов; границы desktop/file проверок и интеграции с инвентарём.

file: `dev-support/qa/MODULAR_ENEMIES.md`
summary: Четыре камеры, прозрачные PNG, модуль ножек, точки спавна земля/воздух; проверки desktop HTTP/file и совместимости сохранений.

file: `dev-support/qa/ITEM_ICONS.md`
summary: Четыре PNG предметов, прозрачный фон/непрозрачное тело, размеры по слотам; desktop HTTP/file, переносы и карточки.

file: `dev-support/art/items/README.md`
summary: Источник пользователя, встроенный image_gen, финальный prompt и воспроизводимое разделение на четыре иконки.

file: `dev-support/art/effects/README.md`
summary: Исходная лента из трёх эффектов, удаление шума, прозрачный фон и нарезка по границам в fire.png, blindness.png, stun.png.

file: `dev-support/qa/COMBAT_INTEGRATION.md`
summary: Перенос опубликованной атаки в модульную сцену: реальные колонки спавна, Hero/экипировка/ответы, save v2 и HTTP/file.

file: `dev-support/project-docs/SCENE_SEQUENCE.md`
summary: Девять боёв, общий каталог камер/поддержки/щитовиков, рост до пяти ground/air-точек, награды/переходы и границы сохранения.
