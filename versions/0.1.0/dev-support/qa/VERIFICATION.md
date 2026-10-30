# Проверка основы GameJam

Дата: 2026-10-30. Версия0.1.0, PixiJS7.4.3. Окружение: Windows x64, Node24.16.0, npm12.0.2; headless Chromium 148.0.7778.96, программный WebGL/SwiftShader.

## Автоматические проверки

- npm run check: TypeScript strict включая @ts-expect-error для чужого enum;4 теста модели; offline build; точные npm locks, SHA-256 vendor, пути индекса и локальные Markdown-ссылки — passed.
- project-start/scripts/validate-project-start.ps1 — valid,0 errors/0 warnings до окончательного отчёта; повторная проверка после подготовки зафиксирована в project-start-validation.json.
- Чистая перенесённая копия исходников/документов/tools/vendor/config без node_modules: npm ci + npm run check — passed, HTML побайтово совпал. tools не обращались к внешнему Foundation; исходный абсолютный root манифеста не требуется для сборки. Полный вывод: transfer-smoke.json.
- Игровой HTML скопирован в отдельную папку без соседних ресурсов; открывался напрямую file://. HTTP проверялся отдельно через локальный dev-server.

| Конфигурация | Экран | Запуск | Проверено | Ошибки |
|---|---|---|---|---|
| desktop-http | 1280×720 | http | действия/save-load/resize/input | 0 |
| desktop-file | 1280×720 | direct-file-isolated-folder | действия/save-load/resize/input | 0 |
| mobile-320x568 | 320×568 | direct-file-isolated-folder | WebGL/геометрия | 0 |
| mobile-390x844 | 390×844 | direct-file-isolated-folder | действия/save-load/resize/input | 0 |
| mobile-568x320 | 568×320 | direct-file-isolated-folder | действия/save-load/resize/input | 0 |
| mobile-844x390 | 844×390 | direct-file-isolated-folder | WebGL/геометрия | 0 |

В действиях проверены: ход/HP, независимость второй копии, выбор DOM/canvas, +15 с ограничением максимума, сохранение/загрузка и сохранность после reload, resize без потери состояния. В мобильных действиях использован touchscreen tap. В каждой конфигурации нет горизонтального overflow, кнопки не ниже52px, нет console/pageerror в том числе при закрытии контекста, нет внешних запросов. Скриншоты просмотрены для desktop и узкого portrait/landscape. Raw: browser-results.json и соответствующие PNG.

## Артефакт

- versions/gamejam_0.1.0-offline.html
- Размер: 470137 bytes (около459КиБ); SHA-256: 3be7e524f47d9c3f8c911615a230e263df66c5559100bbe880dd15dfe93824b9
- Runtime: engine 456112, game 9427, CSS 1706 bytes. Лицензия MIT встроена. Арт/музыка/SDK отсутствуют, platform ZIP не выпускался.

## Общие документы

Обновлено 11 документов/роутеров WebGames/Foundation по прямому поручению: добавлены PROJECT_READING_RULES и PARAMETER_OBJECT_RULES; входы, AGENTS, Info, workflow, индекс и история получили ссылки. Исходные байты существовавших файлов и before/after hashes сохранены в versions/0.1.0/backups/shared-docs-2026-10-30 от корня проекта. Engine/shared builder/registry и runtime других игр не изменялись. Локальные переносимые snapshots имеют standards/SOURCE_PROVENANCE.json.

## Практические границы

Проверка выполнена программным WebGL на этой машине, не на физическом телефоне/Safari/Firefox. Ручную проверку на целевых устройствах выполнить перед сдачей джема. При file:// localStorage зависит от браузера/пути; это локальный прогресс. Для разработки на новом компьютере нужен Node; npm ci скачивает пакеты. Готовый HTML работает без Node и сети. Художественные ресурсы, их offline resolver, звук, инвентарь, окончательные правила боя и SDK добавляются вместе с выбранной игрой. Это готовая техническая основа, не завершённая игра.
