# CI на big-one

## Плавность и камера Freestyle — текущая версия

[CI 40104957491](https://github.com/Terro216/major-decision/actions/runs/40104957491)
для `2f3907fa7b70263ace073758d027f4ab7a28219a` прошёл **74/74 за 37.8 min**.
Все шаги, upload и cleanup успешны 24 октября 2026 в 15:38 UTC.
Source: `85ad87127c3f01880c4228220da0e76af5f27bf048d9522a13fb0289075c84c3`.
HTML: `3ca9313b0b87deb79738f99c11504c37e0fdb5cf119ca873a64907947f1915c8`.
Все 66 inputs сверены на DE и big-one; 12 app-файлов совпали с Docker-образом
и публичным HTTPS. Digest/CRC ZIP проверены на обоих хостах.
Артефакт `12565282742`, 3 088 890 bytes, SHA-256
`90fb1811addd514c0f46ef20a897f65170b8ef3fb6112ec31a05509e28c4db6b`.
Материалы: `references/review/2026-10-24-playback/ci/`.

Runner после job: running / 0 restarts, `_work` пуст, PID peak 279,
PID denials 0, OOM/OOM kills 0. Memory max events 2117 — накопленный счётчик
давления, не OOM. Лимиты 2 CPU / 1536 MiB / 512 PID; Docker socket отсутствует,
сеть только isolated. Предыдущий run `40104359022` намеренно отменён перед
исправлением стыков камеры и не считается полным успехом.
Публикация и cleanup завершены: [HANDOFF](HANDOFF.md).

## Исторический выпуск Movie / Freestyle

[CI 40026615698](https://github.com/Terro216/major-decision/actions/runs/40026615698)
для `67e6e637b506c9bbf12063624dec4fb8425c3238` прошёл **71/71 за 37.8 min**.
Все шаги, upload и cleanup hook завершились успешно 23 октября 2026 UTC.
Source fingerprint — `3edc0d858f9a90e8716179faa5e2efa8c68d97215b480f78787998fef2fa6061`,
Все 65 входных файлов сверены на DE и big-one. Digest/CRC артефакта проверены;
все 11 app-файлов побайтно совпали с финальным Docker-образом. Артефакт
`12535191398`, 3 090 050 bytes, SHA-256
`1d3b8f90265d3ce1430fbf2983c14f3da9e1a06fe2d4895df4eed8289570396a`.
HTML: `d10f13e49c48af72916729d0cdab4a69ef302990b84f4ba83ca7b0f805ff99ba`.
Материалы — `references/review/2026-10-23-modes/ci/`; фактический статус
публикации и публичных проверок — [HANDOFF](HANDOFF.md).

Предыдущие запуски этого прохода остановлены намеренно и не считаются полным
успехом: `40022049540` — перед исправлением начального ракурса Freestyle;
`40022547067` — после обнаружения устаревшего ожидания клавиатурного обхода.
Во втором запуске успели пройти 58 сценариев. Новый тест проверяет фокус
Movie → Freestyle, переключение пробелом и затем Browser Frame.

## Исторический выпуск 56a

Полный [CI 40003483461](https://github.com/Terro216/major-decision/actions/runs/40003483461)
для `9f3843b09f3107305616cdacc90f3044b8a048e4` прошёл **57/57 за 47.0 min**
23 октября 2026. Все шаги, upload и cleanup hook успешны. Source:
`6cb1073a9c43405762595fc1c0de03846f1a7e178f81e7a59e811a6fb8463a77`.
Digest/CRC артефакта, все 61 текущих inputs и все 11 app-файлов проверены;
приложение побайтно совпало с production `3ac676a`. Отличия от опубликованного
r4 ограничены тремя тестовыми файлами. Артефакт, отчёты и проверка сохранены
в `references/review/2026-10-23-release/`.

Исходный r4 прошёл 57/57 за 46.1 min. Два следующих CI дали 56/57:
`39987179788` пропустил running после позднего возврата click;
`39995090989` превысил 12 s ожидания полного playback. Первая проверка
теперь наблюдает реальные состояния внутри страницы ещё до click;
ожидания полного playback в shell/randomness ограничены 30 s, обычные
assertions остаются 12 s. Адресные повторы прошли 6/6 и 12/12, затем весь
актуальный CI — 57/57. Runtime, реальные часы, все проверки и ресурсы
сохранены. Подробная диагностика неуспешных попыток — в [архиве HANDOFF](HANDOFF_HISTORY.md).

После последнего job `_work` пуст, runner running / 0 restarts,
PID peak 279, PID denials 0, OOM/OOM kills 0. Memory max events 620
показывают давление памяти, но не OOM. Docker socket отсутствует,
сеть только isolated, mount только `ci/.state`. Лимиты остаются
2 CPU / 1536 MiB / 512 PID. Протокол — `ci-runner-final.json`.

Историческая проверка визуальной версии `bee1d41` —
[run 39641569860](https://github.com/Terro216/major-decision/actions/runs/39641569860):
48/48 за 24.1 min, все шаги успешны. Digest артефакта и 47 исходных файлов
проверены; девять статических файлов совпали с production. Runner online/idle,
`_work` пуст, PID peak 279, denials 0, OOM kills 0. Итоговые доказательства —
`references/review/2026-10-21-fidelity/`; результаты 46/46 ниже исторические.

## Устройство runner и workflow

Workflow `.github/workflows/ci.yml` запускает build и весь Playwright-набор
на runner `major-decision-big-one` только для `main` и действий владельца
`Terro216`. Внешние PR не являются trigger. Публикация сайта остаётся отдельной
адресной операцией после проверки образа, видео и production smoke.

`ci/compose.yaml` отделён от веб-сервиса. Контейнер runner работает как
UID/GID 1001, с 2 CPU, 1536 MiB, 512 PID и shm 256 MiB. В нём находятся
браузеры Playwright, виртуальный аудиовыход и GitHub runner. Нет Docker socket,
host network, production checkout или учётных данных других приложений.
После job удаляются только его внутренние checkout, зависимости и временные
артефакты; отчёты GitHub хранятся семь дней.

Единственная сеть runner — internal bridge с gateway mode `isolated`.
Выход осуществляется через отдельный Squid, который разрешает HTTPS CONNECT
только GitHub, GitHub artifact storage и npm registry. Частные адреса,
loopback/link-local и остальные назначения отвергаются. Прокси не публикует
порт на хост и не хранит access log. Режим isolated также убирает адрес
хостового bridge из сети runner. Основание: [Docker gateway modes](https://docs.docker.com/engine/network/port-publishing/#gateway-modes)
и [GitHub runner proxy](https://docs.github.com/en/actions/how-tos/manage-runners/use-proxy-servers).

Подсети `172.30.240.32/28` (isolated) и `172.30.240.48/28` (egress)
проверены на отсутствие пересечений. На big-one Docker работает с
`iptables: false`, а существующий NAT охватывает только `172.16.0.0/12`;
автоматически выделенная сеть `192.168.*` не имеет рабочего выхода.
Для CI правила firewall хоста не изменяются.

Публичный репозиторий требует отдельной осторожности с self-hosted CI:
никакие PR/workflow из недоверенных веток нельзя запускать на этом runner.
GitHub [рекомендует self-hosted runners для private repositories](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).
Здесь runner ограничен одной собственной кодовой базой, owner/main workflow
и сетью без доступа к production. В настройках репозитория внешние PR должны
требовать подтверждения для каждого внешнего участника (`all_external_contributors`).
Не добавлять `pull_request_target` или checkout внешнего PR.

## Установка и восстановление

Все Docker-команды выполняются на big-one. Builder ограничивается отдельно.
Из корня проекта:

```sh
docker buildx create --name major-decision-ci-build --driver docker-container --driver-opt memory=1536m,cpu-quota=200000,cpu-period=100000 --bootstrap
docker buildx build --builder major-decision-ci-build --load -t major-decision-ci:20261021-hook ci
docker buildx rm major-decision-ci-build
mkdir -m 700 -p ci/.state
docker compose -f ci/compose.yaml up -d --no-build --pull never egress
```

Перед регистрацией проверить, что через egress доступны GitHub/npm, а
произвольный домен и частные IP отвергаются; прямой выход runner также
недоступен. Registration token получать через уже авторизованный `gh` на
рабочем хосте и передавать только в stdin:

```sh
gh api --method POST repos/Terro216/major-decision/actions/runners/registration-token --jq .token |
  docker compose -f ci/compose.yaml run --rm -T --no-deps runner register
docker compose -f ci/compose.yaml up -d --no-build --pull never runner
```

Не выводить token, `.secrets` или runner credential files в терминал/чат.
Долгоживущий PAT на сервер не устанавливается. Регистрация хранится в
ignored `ci/.state/.secrets` с правами 0600. Это JSON-bundle трёх штатных
файлов runner; остальные файлы его рабочего контейнера воспроизводимы.
21.10 пользователь явно отменил отдельный backup и recovery export для этого
проекта. Исходники и конфигурация сайта находятся в Git; регистрацию runner
при утрате создают заново. Экспорт секретов и обновление Bitwarden не нужны
и не являются условием завершения выпуска.

После утраты регистрации удалить только старую запись runner в GitHub и
зарегистрировать новую; сборка самого сайта не зависит от этой регистрации.
Обычный restart/recreate восстанавливает конфигурацию из bundle. Compose CI
классифицируется отдельно от web stack; restart policy обеспечивает перезапуск
после reboot, а bootstrap не пытается зарегистрировать runner автоматически.

При обновлении обоих контейнеров сначала дождаться idle и остановить только
runner, затем обновить egress и запустить runner. Это сохраняет выход старой
сессии до её завершения. В проходе 21 октября одновременный recreate обоих
контейнеров сопровождался конфликтом старой сессии в течение 164 s; runner
затем подключился с прежним ID 2 без повторной регистрации.

В GitHub проверять состояние online/idle и результат job для конкретного
commit SHA. Зелёный локальный контейнер и подготовленный YAML не доказывают
успешный GitHub CI. Фактический run ID, SHA и network checks
фиксируются в HANDOFF после выполнения.

Первый реальный run выявил недостаточный лимит 256 PID: cgroup записала
14 отказов fork/clone, Firefox упал при navigation, OOM kills = 0.
Тот же Firefox-сценарий отдельно с виртуальным аудиовыходом прошёл (8.9 s).
Для runner с его собственным job worker лимит увеличен до 512; текущий
`check-remote.sh` также использует 512 PID. CPU, память, seccomp,
capabilities и сеть не расширены.

Второй полный run прошёл 46/46 за 24.4 min, PID peak 277, PID denials 0,
OOM kills 0. Workflow завершился ошибкой только в завершающем hook:
GitHub требует расширение языка в его пути. В образе `20261021-hook`
COPY, chmod и `ACTIONS_RUNNER_HOOK_JOB_COMPLETED` используют путь
`/usr/local/bin/major-decision-job-complete.sh`.
Основание: [GitHub job hooks](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts).

Исправление подтверждено полным [run 39526378203](https://github.com/Terro216/major-decision/actions/runs/39526378203):
46/46 за 24.8 min, все шаги включая hook успешны. После job runner online/idle,
`_work` пуст, PID peak 276, PID denials 0, OOM kills 0. Артефакт сохранён
локально в ignored review; его digest и исходники проверены, девять статических
файлов побайтно совпали с production.
