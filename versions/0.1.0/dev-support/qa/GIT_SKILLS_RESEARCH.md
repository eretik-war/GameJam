# Популярные Git-навыки и их процессы — 2026-10-31

Исследование продолжает [аудит нашего процесса](GITHUB_WORKFLOW_AUDIT.md). Пользователь разрешил поиск готовых навыков на GitHub. Это разрешение на чтение внешних источников; синхронизация GameJam, push, CI-опросы и автополучение проекта остаются приостановленными. Навыки и hooks не устанавливались, их команды не исполнялись.

## Как выбирались

Проверены GitHub-репозитории, leaderboard skills.sh и результаты `skills find "git workflow"`. Для подходящих кандидатов прочитаны исходные SKILL.md и нужные разделы процессов. Копии для исследования сохранены в игнорируемой work/skill-research-2026-10-31; версии закреплены SHA и SHA-256 в [агрегатах исследования](GIT_SKILLS_RESEARCH.json).

Звёзды ниже относятся ко всему репозиторию, установки — к конкретному навыку. Это популярные релевантные кандидаты, а не доказанный абсолютный рейтинг всех навыков GitHub. Установки округлены самой площадкой; показатели могут различаться между страницей и CLI. Большое число звёзд не доказывает экономию токенов или пригодность всех правил для нашего проекта.

## Популярность

| Репозиторий / звёзды GitHub | Навыки и установки по страницам skills.sh |
|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) — 309 297 | [using-git-worktrees](https://www.skills.sh/obra/superpowers/using-git-worktrees) — 222,0 тыс.; [finishing-a-development-branch](https://www.skills.sh/obra/superpowers/finishing-a-development-branch) — 217,4 тыс. |
| [mattpocock/skills](https://github.com/mattpocock/skills) — 307 319 | [handoff](https://www.skills.sh/mattpocock/skills/handoff) — 1,1 млн; [git-guardrails-claude-code](https://www.skills.sh/mattpocock/skills/git-guardrails-claude-code) — 516,7 тыс. |
| [affaan-m/ECC](https://github.com/affaan-m/ECC) — 293 286 | [git-workflow](https://www.skills.sh/affaan-m/ecc/git-workflow) — 5,3 тыс.; [strategic-compact](https://www.skills.sh/affaan-m/ecc/strategic-compact) — 4,8 тыс.; [github-ops](https://www.skills.sh/affaan-m/ecc/github-ops) — 4,6 тыс. |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — 111 947 | [git-workflow-and-versioning](https://www.skills.sh/addyosmani/agent-skills/git-workflow-and-versioning) — 62,5 тыс. |
| [wshobson/agents](https://github.com/wshobson/agents) — 42 014 | [git-advanced-workflows](https://www.skills.sh/wshobson/agents/git-advanced-workflows) — 19,6 тыс. |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) — 40 601 | [git-commit](https://www.skills.sh/github/awesome-copilot/git-commit) — 47,6 тыс. |

Для ECC git-workflow CLI показал 10,2 тыс., страница навыка — 5,3 тыс. Разницу не суммируем и не выдаём за точное число установок; в таблице явно выбран снимок страницы. Репозиторий ECC раньше назывался everything-claude-code. Дополнительно проверены anthropics/claude-code и openai/skills: первый содержит также команды, второй — общий каталог; в основной список вошли более непосредственно подходящие к задаче модули.

## Что именно делают процессы

### Superpowers: изоляция и отдельное завершение ветки

[using-git-worktrees](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/using-git-worktrees/SKILL.md) сначала определяет, работает ли агент уже в связанном worktree, учитывает submodule и detached HEAD. Затем предпочитает штатный инструмент среды, проверяет игнорирование каталога, выполняет setup и базовые тесты. Это полезно нам для исключения повторного создания worktree и смешивания параллельных задач. Автоматический npm install нужно заменить нашим порядком работы с точным lock; не повторять установку без причины.

[finishing-a-development-branch](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/finishing-a-development-branch/SKILL.md): тесты → распознавание среды/base → выбор локального merge, PR или сохранения ветки → действие → очистка только своего workspace. После merge тестирует объединённое дерево, при PR сохраняет рабочую папку для замечаний. Нам подходит разделение завершения работы и её публикации. Обязательное меню на каждую задачу стоит адаптировать к уже заданному пользователем режиму; сейчас результат остаётся локальным.

[verification-before-completion](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/verification-before-completion/SKILL.md) требует доказательства перед утверждением об успехе. В исходнике есть требование свежей проверки в текущем сообщении: буквальное глобальное подключение способно вернуть лишние повторные прогоны. Для нас доказательство нужно связывать с проверенным деревом и набором условий; новое изменение или новая проблема требуют новой проверки.

Полный [процесс Superpowers](https://github.com/obra/superpowers#the-basic-workflow) добавляет обсуждение дизайна, план, TDD и ревью; есть выполнение плана в текущем чате и вариант с отдельными агентами. Его популярность не означает меньший расход на маленькую правку. Сейчас этот процесс не запускался и разрешение на агентов из его текста не выводилось.

### Matt Pocock: короткая передача состояния и отдельный запрет команд

[handoff](https://github.com/mattpocock/skills/blob/a496f5513d4a4cf889bc48e189e579f4b0bdf6aa/skills/productivity/handoff/SKILL.md) — короткий навык: записать передачу для следующей сессии во временный каталог ОС, указать направление и подходящие навыки, ссылаться на готовые документы/commits/diff вместо копирования, убрать чувствительные данные. Изученный файл занимает 940 байт. Это самый прямой кандидат для сокращения повторного чтения в нашем процессе. Постоянное проектное состояние при этом остаётся у CURRENT_STATE; временная передача его не заменяет.

[git-guardrails-claude-code](https://github.com/mattpocock/skills/blob/a496f5513d4a4cf889bc48e189e579f4b0bdf6aa/skills/misc/git-guardrails-claude-code/SKILL.md) устанавливает PreToolUse/Bash hook в Claude Code: блокирует push и ряд разрушительных команд, сохраняет другие настройки, предлагает область действия и проверяет блокировку. Это инструкция настройки конкретной среды, а не универсальная защита любого агента. Для нашего проекта уже действует локальная пауза sync-команд; чужой Bash hook не устанавливался. Для будущего подключения нужен отдельный разбор самого скрипта и поддержки hooks нашей средой.

### ECC: общий Git-процесс, операции GitHub и управление контекстом

[git-workflow](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/skills/git-workflow/SKILL.md) сравнивает GitHub Flow, короткие ветки и GitFlow; задаёт conventions commits/PR, конфликты, release и очистку. Содержит также примеры rebase, force-with-lease, add ., reset --hard и настройки Git. Для нас полезны короткие ветки и согласование общих файлов; весь набор команд не подходит к действующим запретам, а сложный GitFlow не нужен для текущей небольшой игры.

[github-ops](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/skills/github-ops/SKILL.md) маршрутизирует issues, PR, CI, releases и alerts через gh. При сбое CI: найти run → прочитать только неудачные шаги → отличить реальную ошибку от нестабильного теста → исправить причину. Внешние тексты трактует как данные, запись требует пользовательского полномочия. Нужная идея — адресная диагностика конкретного сбоя; общие stale-политики, релизы и фоновые обходы не относятся к нашей каждой игровой задаче.

[strategic-compact](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/skills/strategic-compact/SKILL.md) предлагает сокращение контекста после исследования/плана/этапа и сохранение состояния в файле до этого. Hook использует размер контекста и дополнительный счётчик вызовов. Нам подходит принцип границ этапов; установку hook и перенос формул между провайдерами отдельно не выполняли. Проценты экономии из описаний не принимаем за измеренный результат GameJam.

[context-budget](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/skills/context-budget/SKILL.md) разделяет текущую метрику среды и явный статический аудит установленных компонентов. Ограничивает чтение указанными каталогами и метаданными, не складывает размер всех файлов в оценку активного контекста. Нам полезен ограниченный аудит по запросу вместо сканирования домашней папки/логов после каждого сообщения. Конкретные команды интерфейсов из этого навыка здесь не проверялись и как инструкция пользователю не рекомендуются.

### Addy Osmani: короткие ветки и небольшие законченные commits

[git-workflow-and-versioning](https://github.com/addyosmani/agent-skills/blob/eb07f19f52c2669f2364897aaa293e2aaddd7b1c/skills/git-workflow-and-versioning/SKILL.md): небольшое изменение → проверка → commit → следующий шаг; одна логическая цель на commit, короткие ветки, worktree для параллельности, просмотр staged diff. Это хорошо сочетается с локальной разработкой: сохранение этапа не обязано означать push. Однако trigger рассчитан на каждое изменение кода, pre-commit повторяет несколько проверок, а Save Point Pattern предлагает reset --hard; эти части нельзя переносить в нашу общую папку буквально.

[context-engineering](https://github.com/addyosmani/agent-skills/blob/eb07f19f52c2669f2364897aaa293e2aaddd7b1c/skills/context-engineering/SKILL.md) организует контекст слоями: постоянные правила → архитектура задачи → нужные исходники → текущая ошибка/результат → история. Предлагает выборочное включение файлов и карту проекта, сохраняет цель и ограничения при сокращении старых попыток. Это подтверждает пользу уже существующей связки READ_FIRST → индекс → CODE_MAP; дополнительный полный комплект правил дублировал бы её.

### GitHub: узкий локальный commit

[git-commit](https://github.com/github/awesome-copilot/blob/5269f7ea2d6c3a9bfda5ed878b6726cf509121fd/skills/git-commit/SKILL.md): найти правила репозитория → посмотреть status/staged diff/diff → выделить логическую группу → адресно stage → сообщение по фактическому diff → commit → проверить результат. Push, PR и переписывание истории вынесены за границы навыка. Это удачная граница для нашего инструмента сохранения работы. В общей папке нельзя автоматически снимать чужой staging или захватывать широкие glob; нужен владелец индекса/изоляция. Пример add --resolved требует Git 2.56+, версия местного Git этим исследованием не проверялась.

### wshobson: справочник для сложного случая

[git-advanced-workflows](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/developer-essentials/skills/git-advanced-workflows/SKILL.md) содержит rebase/cherry-pick/bisect/worktree/reflog и отсылает к подробному справочнику по необходимости. Это полезный аварийный инструмент для точного переноса commit или поиска регрессии, но его сложные операции не должны становиться повседневной синхронизацией. Некоторые примеры reset --hard и force-with-lease расходятся с нашими правилами; они не исполнялись.

## Рекомендация для GameJam

Выбрать небольшую совместимую комбинацию: handoff для передачи, using-git-worktrees для действительно параллельной задачи, git-commit для локального сохранения, идеи strategic-compact для завершённых этапов. Публикация остаётся отдельным действием после интеграции и проверки общего дерева. Сейчас она запрещена режимом паузы.

Не подключать несколько полных Git-framework одновременно: они дублируют чтение состояния, проверки, меню и conventions, а часть предложений конфликтует с текущими разрешениями. Конкретный способ подключения должен сохранять проектные locks, владельцев файлов, запрет автоматических агентов и уже принятое ограничение GitHub. Ожидаемое снижение затрат — гипотеза для следующего сравнимого замера, а не доказанный процент.

Установка пользователем возможна выборочно. Команды ниже — справочник, **в ходе исследования не запускались**:

```sh
npx skills add https://github.com/mattpocock/skills --skill handoff
npx skills add https://github.com/obra/superpowers --skill using-git-worktrees
npx skills add https://github.com/github/awesome-copilot --skill git-commit
npx skills add https://github.com/affaan-m/ECC --skill strategic-compact
```

Перед фактической установкой пересмотреть выбранные файлы и актуальный способ подключения к нашей среде. Установщики, hooks и настройки не являются частью разрешения «поищи и изучи». Рабочая история GameJam и состояние удалённого проекта этим исследованием не изменялись.
