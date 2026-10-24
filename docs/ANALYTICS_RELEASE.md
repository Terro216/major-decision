# Выпуск аналитики — 24 октября 2026

Обновление `fd4d9847e6d20133621abdb9423f2b5a513ebed6` опубликовано на
https://decision.ilyamedve.dev в 14:51:55 UTC. Добавлен счётчик просмотров
Plausible: только production host, без query/hash и значений вопроса.
Разрешён существующий analytics origin в CSP. Игровая логика не менялась.

## Доказательства

- [CI 40101404640](https://github.com/Terro216/major-decision/actions/runs/40101404640):
  71/71 за 35.3 min; `testExit=0`, selection `all`.
- Все 66 build inputs совпали с точным коммитом; source fingerprint:
  `d956fe24af6a9c201b9fc3f9e80494a64f056b637344888d8c5014768cf6ac16`.
- 12 файлов candidate dist побайтно совпали с артефактом CI. HTML SHA256:
  `c63720d2c84350d173d215e3931c902c9d4f506e82843d73391183d548fc4f91`.
- Candidate smoke 8/8 и public HTTPS smoke 8/8: Movie/Freestyle × left/right
  × YES/NO, Cyrillic, WebGL, sound/reset, disabled tabs, storage, HTTP headers
  и приватные пути. Public smoke дополнительно сверил HTML/source с CI.
- Настоящий browser pageview принят Plausible (202, без dropped header),
  запись подтверждена в ClickHouse, site ID 27. Это тестовый визит.
- Production image ID:
  `sha256:7bd5d48346d0ac4a2ca5d335ba3e336d4aa90e0104b7d7fa3237ec5e26bf3e65`.
  Контейнер healthy, 0 restarts; Compose/Caddy routing не изменялись.

Неизменяемый tag: `analytics-major-decision:20261024-fd4d9847e6d2`.
`major-decision:latest` при выпуске указывает на него.
Откат: назначить `major-decision:before-analytics-20261024` tag `latest`
и выполнить адресный Compose up по [DEPLOYMENT](DEPLOYMENT.md).
Сохранённый прежний image совпадает с `release-modes-20261023`.

Первые локальные smoke-запуски прерваны из-за неверного mount `/tmp` в
одноразовом Playwright-контейнере: GPU-процессу не хватало прав на shared
memory. После переноса отчётов в `/qa` оба полных прогона завершились.
Это не изменение приложения. Проверки выполнялись на big-one, 4 CPU /
1536 MiB, без доступа к звуковым устройствам хоста.

Параллельный коммит `9cbd5bd` с плавностью и камерой не входит в этот образ
и не подтверждается этими проверками. Его собственный выпуск описывается
отдельно в [PLAYBACK_REVIEW](PLAYBACK_REVIEW.md).
