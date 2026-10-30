# Индекс документации GameJam

Корневые пути относительно GameJam; file ниже — относительно активной versions/0.1.0. Для общего знакомства читать базовый набор. Для конкретного направления выбрать только нужные строки и CODE_MAP; при расширении области снова использовать индекс. Canonical чтение — standards/PROJECT_READING_RULES.md.

root_file: `AGENTS.md` — правила работы нейронки.
root_file: `READ_FIRST_LATEST_PROJECT.md` — режим входа/активная версия.
root_file: `START_HERE.md` — настройка для человека.
root_file: `README.md` — краткий вход с GitHub.
root_file: `PROJECT_MANIFEST.json` — указатели.
root_file: `ENGINE_LOCK.json` — локальный движок/SHA.
root_file: `package.json` — команды/точные пакеты; package-lock.json — весь граф.

file: `dev-support/PROJECT_INSTRUCTIONS.md`
summary: Базовый набор; постоянные правила проекта.

file: `dev-support/project-docs/CURRENT_STATE.md`
summary: Базовый набор; статус/разрешение/следующий шаг.

file: `dev-support/project-docs/CODE_MAP.md`
summary: Базовый набор; карта владельцев и потребителей, предметный поиск.

file: `dev-support/project-docs/WORKFLOW.md`
summary: Базовый набор; итерация, работа вдвоём, передача.

file: `dev-support/project-docs/GITHUB_WORKFLOW.md`
summary: Обязательно при каждом входе/ознакомлении/восстановлении чата: постоянное разрешение на push каждой доработки и статус каждого сообщения; collaborator, Windows-автополучение и конфликты.

file: `dev-support/project-docs/PIXIJS_GUIDE.md`
summary: Базовый набор; движок, setup, API v7, lifecycle, offline.

file: `dev-support/project-docs/RUN_COMMANDS.md`
summary: Базовый набор; команды/настройка/ошибки.

file: `dev-support/project-docs/ARCHITECTURE_2D.md`
summary: Базовый набор; слои, инвентарь, действия, save.

file: `dev-support/project-docs/INVENTORY.md`
summary: Реализованный инвентарь: владельцы, 3 активных слота/4×3 кармана, стадии, награды, переносы, границы сохранения.

file: `dev-support/qa/INVENTORY.md`
summary: Проверка инвентаря: модель, mouse/touch/keyboard, полные карманы, HTTP/изолированный file и адаптация.

file: `dev-support/qa/INVENTORY_OVERLAY.md`
summary: Инвентарь поверх боевой сцены без сдвига: desktop HTTP/file, неизменная геометрия/пиксели противников, фон на всю высоту зоны.

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
summary: Реализованные противники, щит, статусы и границы демо.

file: `dev-support/qa/SCENE_ASSETS.md`
summary: Проверки объединённой сцены, JSON-ассетов, полосок и статусов; границы desktop/file проверок и интеграции с инвентарём.

file: `dev-support/qa/MODULAR_ENEMIES.md`
summary: Четыре камеры, прозрачные PNG, модуль ножек, точки спавна земля/воздух; проверки desktop HTTP/file и совместимости сохранений.
