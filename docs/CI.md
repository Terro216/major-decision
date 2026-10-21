# CI на big-one

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
Имя `.secrets` входит в существующий recovery allowlist дерева `server`.
После первой регистрации проверить включение в big-one slice collector,
равенство приватной синхронизированной копии на DE и обновить encrypted
recovery export по серверному runbook. DE slice намеренно собирает только
собственные хостовые секреты; файл проекта входит через big-one slice. Загрузка нового
зашифрованного вложения в Bitwarden выполняется владельцем через свой клиент.

После утраты регистрации удалить только старую запись runner в GitHub и
зарегистрировать новую; сборка самого сайта не зависит от этой регистрации.
Обычный restart/recreate восстанавливает конфигурацию из bundle. Compose CI
классифицируется отдельно от web stack; restart policy обеспечивает перезапуск
после reboot, а bootstrap не пытается зарегистрировать runner автоматически.

В GitHub проверять состояние online/idle и результат job для конкретного
commit SHA. Зелёный локальный контейнер и подготовленный YAML не доказывают
успешный GitHub CI. Фактический run ID, SHA, network checks и backup-проверка
фиксируются в HANDOFF после выполнения.

Первый реальный run выявил недостаточный лимит 256 PID: cgroup записала
14 отказов fork/clone, Firefox упал при navigation, OOM kills = 0.
Тот же Firefox-сценарий отдельно с виртуальным аудиовыходом прошёл (8.9 s).
Для runner с его собственным job worker лимит увеличен до 512; standalone
QA сохраняет прежние 256. CPU, память, seccomp, capabilities и сеть не расширены.

Второй полный run прошёл 46/46 за 24.4 min, PID peak 277, PID denials 0,
OOM kills 0. Workflow завершился ошибкой только в завершающем hook:
GitHub требует расширение языка в его пути. В образе `20261021-hook`
COPY, chmod и `ACTIONS_RUNNER_HOOK_JOB_COMPLETED` используют путь
`/usr/local/bin/major-decision-job-complete.sh`.
Основание: [GitHub job hooks](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts).
