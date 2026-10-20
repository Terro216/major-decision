# Major Decision

Реконструкция сайта из фильма «Трасса 60» (Interstate 60). Синий корпус,
поле вопроса, круглые эмблемы, заставка и объёмные YES / NO повторяют композицию
предоставленных кадров. Планируемый адрес: **decision.ilyamedve.dev**.

Работают оболочка на React + TypeScript + Vite и две 3D-последовательности на Three.js.
Реконструкция сопоставлена с исходными видео и кадрами; результаты и границы точности записаны в
[VISUAL_REVIEW](docs/VISUAL_REVIEW.md). Вопрос можно задать через `?` или Enter; ответ выбирается один раз случайно 50/50. Примерно за 6.9 секунды шар проходит звезду, штыри, спираль и мишень до YES/NO. Повторный запуск блокируется до сброса или изменения вопроса.
`NEW QUESTION` отменяет анимацию и очищает экран, Shift+Enter добавляет строку. Кириллица поддерживается.
HOROSCOPE, ROMANCE и CAREER видимы, но отключены. Вопрос существует только в памяти
вкладки: аккаунтов, аналитики и сохранения вопросов нет.

Камера независимо выбирает один из двух проверенных маршрутов; каждый
может закончиться YES или NO. Под корпусом можно выбрать RANDOM: LOCAL
(WebCrypto, без сети) или RANDOM.ORG (16 чисел из атмосферного шума,
выбор одного через Math.random). Внешнему сервису вопрос не передаётся.
NEW QUESTION отменяет и ожидание API; ошибка сервиса не подменяется
локальным ответом. Источники и детали — [RANDOMNESS_REVIEW](docs/RANDOMNESS_REVIEW.md).

Этап 2 ещё не принят пользователем. Мобильная компоновка, звук и дальнейшая доступность — следующий этап [плана](docs/PLAN.md). При отсутствии или потере WebGL доступен SVG-ответ с тем же выбранным исходом. Production-публикация остаётся отдельным этапом.

## Разработка

Node >=22.12. В `/home/me/server` команды Node/npm/Docker выполняются через SSH-shim
на **big-one**. Сборки, preview и браузерные проверки также запускаются там.

```sh
npm ci
npm run dev -- --port 5173 --strictPort
npm run build
```

Dev-сервер слушает только `127.0.0.1` на big-one. Для просмотра с рабочего компьютера:

```sh
ssh -N -L 5173:127.0.0.1:5173 big-one
```

Открыть `http://localhost:5173/`. Параметр `?review=1` показывает переключатели
START / YES / NO, PLAY YES / PLAY NO, PAUSE / RESUME и ползунок времени. Пример фиксированного кадра: `?review=1&outcome=no&t=4.65`. Вне review исход и время из URL игнорируются. Переключатель BROWSER FRAME скрывает
декоративную старую рамку браузера. Это отдельный слой, не часть самого сайта.

В review также есть скорость ½× / ¼×, камеры TOP / SIDE / INLET и OPAQUE TUBE.
ROUTE выбирает LEFT / RIGHT независимо от ответа; FILM PAIR возвращает
исходные пары фильма. Пример: `?review=1&outcome=no&scenario=left&t=5.45`.
Вне review сценарий из URL игнорируется.
Диагностический пример: `?review=1&outcome=yes&t=4.30&view=mouth&opaque=1`.
Размеры, ось трубы, контакты и мишень общие для рендера и расчётов; радиус шара
постоянный. История прежних пересечений — в [MOTION_REVIEW](docs/MOTION_REVIEW.md); текущая проверка входа, спирали и переходов — в [MOTION_CONTINUITY_REVIEW](docs/MOTION_CONTINUITY_REVIEW.md).

Проверочный preview использует порт 4175 на big-one; актуальное состояние
и команды записаны в [HANDOFF](docs/HANDOFF.md).

## Проверки и контекст

```sh
python3 scripts/check-references.py
bash scripts/check-remote.sh
```

Вторая команда проверяет TypeScript, собирает production-версию и запускает
Playwright-сценарии в изолированном контейнере на big-one: 2 CPU, 1536 MiB,
один worker. Снимки, записи и протокол появляются в `.review/`; build копируется в `.review/dist/` только после успешного прогона. `.review/check-result.json` и `build-inputs.json` фиксируют статус и SHA-256 входных файлов. Можно передать Playwright-фильтр: `bash scripts/check-remote.sh --grep "review seek"`.
Сборочные каталоги могут быть исключены из Mutagen; это нормально.

- [Разбор кадров и последовательности](docs/REFERENCE.md)
- [Этапы и критерии готовности](docs/PLAN.md)
- [Текущее состояние и передача контекста](docs/HANDOFF.md)
- [Готовый промпт для нового чата](docs/NEXT_CHAT_PROMPT.md)
- [Визуальные расхождения](docs/VISUAL_REVIEW.md) и [фильм / до / после с общей перемоткой](docs/visual-comparison.html)
- [Доводка камеры, мишени и индикатора](docs/FRAMING_REVIEW.md)
- [Материалы, свет и объёмные буквы](docs/MATERIAL_REVIEW.md)
- [Ранние ракурсы и веер штырей](docs/EARLY_CAMERA_REVIEW.md)
- [Раскладка поля, спирали и нижнего входа](docs/LAYOUT_REVIEW.md)
- [Полная визуальная доводка этапа 2](docs/FINAL_VISUAL_REVIEW.md)
- [Оба маршрута с каждым ответом](docs/camera-scenarios.html) и [внешняя случайность](docs/RANDOMNESS_REVIEW.md)
- [Оригинальные референсы и контрольные суммы](references/README.md)

PT Serif Bold для вопросов и кириллицы находится в `public/fonts/` с OFL-лицензией. Логотип, вопросы и массивные YES/NO — собственные векторные контуры. `node scripts/make-wordmark.mjs` воспроизводит wordmark и золотой вопрос; прежняя Alfa Slab One сохранена в `tools/fonts/` как материал первого этапа, но больше не используется генератором.

Сохранённый компактный результат находится в ignored-каталоге
`references/review/2026-10-20-motion/`: полные видео, сравнения проблемных мест,
архив исходников «до» и контрольные суммы. Просмотр —
[фильм / до / после](docs/visual-comparison.html) и
[четыре сочетания маршрута и ответа](docs/camera-scenarios.html).
Старые каталоги `.review/before-*` отсутствовали на старте прохода 20 октября;
прежние скрипты сравнения остаются историей и требуют тех старых архивов.

Текущий цикл после успешных тестов и запуска preview на big-one:

```sh
node scripts/check-preview.mjs
bash scripts/export-review.sh
# Следующую Python-команду выполнять на big-one:
python3 scripts/prepare-motion-review.py after
bash scripts/export-review.sh --cross
# Эти две Python-команды также выполнять на big-one:
python3 scripts/prepare-motion-review.py cross
python3 scripts/prepare-motion-review.py comparisons
bash scripts/check-review-media.sh
bash scripts/check-randomness.sh
```

После фактического просмотра записать его manifest, затем локально выполнить
`python3 scripts/verify-motion-review.py --collect`. Обычный запуск без
`--collect` сверяет сохранённый результат уже без рабочей `.review`.
Полный порядок, идентичность сборки и ограничения — HANDOFF.

Видео — детерминированный экспорт 24 fps с паузой .5 s на финале,
не измерение FPS пользовательского устройства. Живой прогон на ¼ скорости
проверяется отдельно. Сырые кадры и временные записи удаляются после
проверки компактного набора; оригинальные MP4/PNG сохраняются всегда.
