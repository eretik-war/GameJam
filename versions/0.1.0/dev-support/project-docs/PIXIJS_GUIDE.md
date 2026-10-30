# PixiJS: настройка и рабочий API

## Что установлено

В проект включён PixiJS 7.4.3 из проверенного профиля WebGames; это точная выбранная версия, а не заявление о самой новой. Исполняемый локальный файл/лицензия/хеши — ENGINE_LOCK.json. npm-пакет pixi.js той же версии даёт полные typings; TypeScript 5.9.3 и esbuild 0.25.12 закреплены package-lock. Обновление на v8+ — отдельная миграция API, не автоматическое исправление примера.

Pixi — 2D-рендерер с вводом, не готовая система инвентаря, ходов или сохранений. Модель пишем независимо от него. Официальные ссылки: [FAQ](https://pixijs.com/faq), [руководство v7](https://pixijs.com/7.x/guides/basics/getting-started), [scene graph](https://pixijs.com/7.x/guides/basics/scene-graph). Подробности TypeScript enum: [Handbook](https://www.typescriptlang.org/docs/handbook/enums.html).

## Первый запуск разработки

В корне: npm ci при отсутствии зависимостей, npm run check, npm run dev. Node.js 22+, проверено с 24.16.0/npm12.0.2 на Windows x64. В исходниках import * as PIXI from 'pixi.js'. Сборщик использует локальный vendor как global PIXI, typings берёт из установленного пакета. В HTML нет CDN, сетевого resolver или внешних модулей. Node нужен для разработки; готовому HTML нужен только браузер.

## API именно v7

new PIXI.Application(options) синхронно создаёт приложение; canvas — app.view. Не переносить v8 app.init()/app.canvas без миграции. Сцена — дерево Container; Sprite использует Texture; Graphics рисует простые примитивы; Text — текст. eventMode='static' и pointertap объединяют мышь/касание, hitArea совпадает с областью нажатия. В демо клавиатурный выбор доступен через обычные кнопки DOM.

## Размеры, ресурсы и lifecycle

ResizeObserver/app.resize следуют фактическому контейнеру. Ограничивать resolution/DPR (в примере 2); размер текстуры и размер кнопки на экране различны. Использовать атлас, общий cache и стабильные artKey/typeId. При добавлении текстур встроить bytes/data URI в offline, проверить декодирование и upload в WebGL. Не использовать fetch соседних файлов при file://. Текущий пример использует только Graphics/Text и не содержит загрузчика изображений/аудио.

Тикер отвечает за анимацию, а команды — за пошаговые правила. На hidden приложение останавливается, на возврате запускается; renderer уничтожает только свои объекты. Общие текстуры не уничтожать при закрытии одной карточки. При добавлении звука AudioContext запускается после жеста; mute/visibility/реклама не создают вторую музыку.

## Offline и инструменты

buildGame в tools/build.mjs объединяет шаблон, CSS, точный локальный движок с MIT и game bundle. CSP блокирует соединения (connect-src 'none'); inline scripts и unsafe-eval включены для выбранной сборки Pixi7. Готовый HTML не требует Node/сервер/внешний Foundation. localStorage при file:// зависит от браузера и пути; ошибка должна быть видна пользователю. HTTP-проверка не подтверждает file://. Платформенного SDK в стартере нет.
