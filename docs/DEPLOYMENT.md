# Выпуск и восстановление Major Decision

Приложение — статический React/Vite build без базы, аккаунтов, backend,
пользовательских файлов и секретов. Вопрос и настройки существуют только
в памяти вкладки. Синтезированный звук запускается кнопкой SOUND. По умолчанию
случайность локальная; RANDOM.ORG включается отдельно и получает только
фиксированные запросы квоты/чисел, без вопроса и cookies.

## Хост и образ

Production-адрес: `https://decision.ilyamedve.dev`. Проект Compose, контейнер
и образ: `major-decision`; сервис: `web`. Только порт 8080 во внешней сети
`caddy_net`; публикация на host-порт не нужна. Caddy получает маршрут из
labels. Не перезапускать общий Caddy вручную.

Dockerfile закрепляет Node 22 и nginx по digest. Контекст допускает только
явно перечисленные файлы приложения; `references/`, `.review`, `.git`,
документация и исходные шрифты в `tools/` в него не входят. Финальный образ
содержит nginx и `dist`, без Node, исходников и зависимостей разработки.

Nginx работает как `nginx`, с readonly root, `/tmp` на tmpfs 16 MiB,
без Linux capabilities, с `no-new-privileges`, лимитами 0.5 CPU / 64 MiB /
64 PID. `/healthz` возвращает `ok`. Access log выключен; CSP допускает
локальные ресурсы, `https://analytics.ilyamedve.dev` для счётчика посещений
и опциональный `https://www.random.org` для fetch.
HTML и release metadata не кешируются; именованные хешем assets кешируются
как immutable. Методы кроме GET/HEAD запрещены, неизвестные пути дают 404.

## Подготовка

Сначала проверить shims: `command -v node npm docker`; runtime должен быть
на big-one. Файлы синхронизируются Mutagen, Git остаётся локальным.

```sh
python3 scripts/check-references.py
bash scripts/check-remote.sh
```

Проверки выполняются в отдельном Playwright-контейнере с 2 CPU / 1.5 GiB,
одним worker и временным виртуальным аудиовыходом. Устройства звука хоста
не подключаются. `check-result.json` и `build-inputs.json` в `.review`
связывают результат с содержимым проверенных файлов. Лог успешной старой
версии не подтверждает новую сборку. Проверки геометрии и пикселей не
заменяют просмотр полных последовательностей.

Собирать образ на big-one в ограниченном BuildKit builder. В аргументы
`SOURCE_SHA` и `VCS_REF` передать fingerprint проверенных inputs и Git-ревизию
(для dirty tree явно указать это в ревизии). `release.json` и image labels
сохраняют эту идентичность. После сборки сравнить HTML/assets с проверенным
`dist`; nginx-конфигурацию и Compose фиксировать отдельно в отчёте выпуска.

Перед публичным переключением запустить этот же образ как временный
`major-decision-candidate` на `127.0.0.1:4176:8080`, без Caddy labels,
с теми же ограничениями контейнера. `scripts/smoke-production.mjs` проверяет
настоящий nginx, недоступность приватных файлов, все восемь сочетаний
Movie/Freestyle × левый/правый маршрут × YES/NO,
кириллицу, WebGL, звук, reset и отсутствие вопроса в запросах/storage.
Ему нужны URL, каталог отчёта и актуальный `check-result.json`.
В выпуске 23 октября клиент smoke использовал 4 CPU / 1536 MiB / 512 PID:
2 CPU не хватило для screenshot в пределах 30 s. Ограничения nginx не
менялись; основной QA и CI используют прежние 2 CPU.

## Адресное переключение

До переключения сохранить ID текущего образа (если контейнер уже есть),
его rollback tag, Compose и метаданные соседних контейнеров: ID, StartedAt,
restart count и health. Для первого выпуска предыдущего приложения нет:
откат означает удалить только новый маршрут/контейнер.

После успешной проверки кандидата присвоить ему `major-decision:latest` и
сохранить отдельный неизменяемый release tag. Затем из каталога проекта:

```sh
docker compose up -d --no-deps --no-build --pull never --wait --wait-timeout 90 web
```

`MAJOR_DECISION_TAG` может явно выбрать сохранённый tag; при работе через
SSH shim его нужно передать в удалённое окружение (`SHIM_FORWARD`) либо
выполнить команду непосредственно на big-one. Не полагаться на локальную
переменную, которую shim не пересылает.

После старта проверить Docker health, image ID, права/лимиты и restart count;
публичные DNS, HTTP→HTTPS, сертификат, `/healthz`, HTML/assets/release metadata;
реальный браузерный smoke по HTTPS. Сверить ID/StartedAt/restart count соседей.
Только после этого включать стек в ordered `production-stacks.yml` и
добавлять успешные HTTP/container checks Gatus и запись каталога портала.

## Откат и восстановление

Текущий выпуск плавности и камеры Freestyle, ревизия `2f3907f`:
`major-decision:release-playback-r2-20261024`. `latest` указывает на тот же image.
Прежняя production-версия `fd4d984` с аналитикой сохранена как
`major-decision:rollback-playback-20261024` (image `sha256:7bd5d48346d0ac4a2ca5d335ba3e336d4aa90e0104b7d7fa3237ec5e26bf3e65`).
Для отката на big-one присвоить этому сохранённому образу `major-decision:latest`,
затем выполнить адресный `compose up` для `web` и публичный smoke. Точные
image/source/HTML hashes и результаты текущего выпуска — в HANDOFF.
Старые production rollback tags, включая `rollback-modes-20261023` и
`rollback-perceptual-20261023`, также сохранены.

При обновлении выбрать прежний сохранённый image tag и повторить адресный
`compose up` выше. При первом выпуске остановить и удалить только сервис
`web` этого проекта; автоматическое удаление его labels снимет маршрут Caddy.
Не выполнять общий `compose down`, prune, restart Caddy или bootstrap всех
сервисов для отката одного сайта.

Для восстановления достаточно опубликованной Git-ревизии с lockfile,
Dockerfile, nginx.conf, Compose и сети `caddy_net`; затем build → scoped up →
публичный smoke. Рабочий `latest` и один предыдущий production image сохраняются.
Отдельных volumes, app-data backup, копии на DE или новых recovery credentials
сайту не нужно. Film originals нужны для художественной сверки, а не для
сборки/работы сайта; хранить их отдельно, с исходным manifest.

Выпуск 24.10.2026 проверен по публичному HTTPS; точные hashes, production
smoke, мониторинг, CI и границы проверки записаны в HANDOFF. Регистрация
отдельного CI-runner хранится в локальном ignored bundle и описана в CI.md.
Пользователь отменил отдельный backup/recovery export: после утраты
регистрации runner регистрируется заново, сайт восстанавливается из Git.
