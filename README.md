# GameJam

Основа 2D-игры: TypeScript, PixiJS 7.4.3 и автономная HTML-сборка. Тема и механика геймджема ещё не выбраны.

```sh
git clone https://github.com/eretik-war/GameJam.git
cd GameJam
npm ci
npm run check
npm run dev
```

Нужны Git и Node.js 22+; CI проверяет Node.js 24.16.0. Игра открывается на http://127.0.0.1:4173. На Windows при блокировке npm.ps1 используйте npm.cmd.

Получить изменения: `npm run sync:pull`. Проверить, сохранить и отправить свои: `npm run sync:push -- "Что изменилось"`.

Включить получение изменений каждые 5 минут на Windows: `npm run sync:auto:install`. Автообновление работает при входе пользователя в Windows, на ветке main и при чистой рабочей папке. При расхождении истории останавливается; локальные правки сохраняются. Каждый участник включает его на своей машине.

[Совместная работа и синхронизация](versions/0.1.0/dev-support/project-docs/GITHUB_WORKFLOW.md) · [Запуск и готовый HTML](START_HERE.md) · [Вход для нейронки](AGENTS.md)
