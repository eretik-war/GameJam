# Запуск и команды

Все команды выполнять в корне GameJam, где package.json. Node.js22+; исходное окружение Windows x64, Node24.16.0/npm12.0.2. Путь папки можно изменить: tools вычисляют его относительно своих файлов.

| Команда | Результат |
|---|---|
| npm ci | Точное восстановление node_modules по lock; нужен интернет, кроме полного локального npm cache |
| npm run typecheck | TypeScript strict, включая несовместимость enum |
| npm test | Тесты независимости Info/параметров, восстановления и ошибочных данных |
| npm run validate | Указатели/индекс/локальные ссылки, точные пакеты, SHA-256 vendor |
| npm run build | Автономный preview в versions/0.1.0/builds/preview.html |
| npm run build:offline | Preview + versions/gamejam_0.1.0-offline.html и build-manifest |
| npm run check | typecheck → test → test:sync → offline build → validate |
| node tools/preview-enemies.mjs | Каталог четырёх модульных камер в versions/0.1.0/builds/camera-catalog.html |
| node tools/verify-camera-enemies.mjs | После offline build и preview: Chrome desktop HTTP/file, выбор/статусы/сохранения, PNG в builds; CHROME_PATH переопределяет путь Chrome |
| npm run test:sync | Две временные Git-копии: обновление, локальные правки, расхождение, проверки перед push и lock |
| npm run sync:pull | Получить origin/main; обновить чистую папку только fast-forward |
| npm run sync:push -- "Описание" | Проверить проект, сохранить и отправить все неигнорируемые изменения |
| npm run sync:status | Ветка, локальные правки, ahead/behind и последняя попытка |
| npm run sync:auto:install | Windows: получать изменения каждые 5 минут при входе пользователя |
| npm run sync:auto:status | Windows: состояние, последний результат и следующий запуск задачи |
| npm run sync:auto:remove | Windows: отключить автополучение этой копии |
| npm run dev | Только локальный HTTP127.0.0.1:4173; пересборка при обновлении страницы, Ctrl+C останавливает |

В PowerShell использовать npm.cmd вместо npm при запрете npm.ps1. Не требуется ослаблять execution policy. Для другого порта: $env:GAMEJAM_PORT='4174', затем npm.cmd run dev. В других оболочках задать эту переменную их обычным способом.

## Если что-то не работает

- node/npm не найдены: установить Node с официальной страницы, открыть новый терминал, проверить PATH.
- Cannot find package: в корне выполнить npm ci. При переносе node_modules между ОС/архитектурами тоже восстановить npm ci; esbuild содержит платформенный бинарник.
- esbuild binary missing: проверить наличие optionalDependencies, не использовать --omit=optional; повторить npm ci и проверить вывод. Не скачивать исполняемые файлы с произвольных сайтов. npm12 может сообщить о блокировке postinstall; если тесты/сборка работают с установленным @esbuild/win32-x64, дополнительное разрешение не требуется.
- Белый экран/сообщение WebGL: открыть обычный браузер с WebGL/аппаратным ускорением и консоль. Ошибка должна быть видна в status. Демо не имеет Canvas-fallback.
- Сохранение не работает: браузер мог запретить localStorage/file origin. Сообщение сохраняется в status; попробовать dev HTTP. Переименование/перемещение HTML может изменить область сохранения. Это не облако и не перенос прогресса между браузерами.
- Порт занят: выбрать другой GAMEJAM_PORT. Исходный src/index.html отдельно не запускается: в нём placeholders, нужен build.

Для Git-команд нужен установленный Git; для push — собственный доступ к GitHub и настроенные user.name/user.email. Совместная работа, конфликты и установка на второй машине: [GITHUB_WORKFLOW](GITHUB_WORKFLOW.md).

Прямой file:// и HTTP проверяются отдельно; актуальные результаты находятся в dev-support/qa/VERIFICATION.md.
