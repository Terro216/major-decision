# Major Decision

Работающий сайт: **https://decision.ilyamedve.dev**.

Реконструкция сайта из фильма «Трасса 60» (Interstate 60). Синий корпус,
поле вопроса, круглые эмблемы, заставка и объёмные YES / NO повторяют композицию
предоставленных кадров. Адрес: **decision.ilyamedve.dev**.

Работают оболочка на React + TypeScript + Vite и две 3D-последовательности на Three.js.
Реконструкция сопоставлена с исходными видео и кадрами; результаты и границы точности записаны в
[PERCEPTUAL_REVIEW](docs/PERCEPTUAL_REVIEW.md). Вопрос можно задать через `?` или Enter; ответ выбирается один раз случайно 50/50. Примерно за 6.9 секунды шар проходит звезду, штыри, спираль и мишень до YES/NO. Повторный запуск блокируется до сброса или изменения вопроса.
`NEW QUESTION` отменяет анимацию и очищает экран, Shift+Enter добавляет строку. Кириллица поддерживается.
HOROSCOPE, ROMANCE и CAREER видимы, но отключены. Вопрос существует только в памяти
вкладки: аккаунтов, аналитики и сохранения вопросов нет.

Камера независимо выбирает один из двух проверенных маршрутов; каждый
может закончиться YES или NO. Под корпусом можно выбрать RANDOM: LOCAL
(WebCrypto, без сети) или RANDOM.ORG (16 чисел из атмосферного шума,
выбор одного через Math.random). Внешнему сервису вопрос не передаётся.
NEW QUESTION отменяет и ожидание API; ошибка сервиса не подменяется
локальным ответом. Источники и детали — [RANDOMNESS_REVIEW](docs/RANDOMNESS_REVIEW.md).

Реализованы отдельная мобильная компоновка, собственный звук по кнопке SOUND, pause/skip, reduced motion и клавиатура. При отсутствии или потере WebGL доступен SVG-ответ с тем же выбранным исходом. Точный статус выпуска и проверки: [HANDOFF](docs/HANDOFF.md); оставшиеся мелкие отличия от фильма: [PERCEPTUAL_REVIEW](docs/PERCEPTUAL_REVIEW.md).

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

Для вопросов и кириллицы используется локальный Liberation Serif Bold;
Decision Question на основе PT Serif Bold остаётся запасным шрифтом.
WOFF2, лицензии и FONTLOG находятся в `public/fonts/`, исходные TTF и
команды воспроизведения — в [tools/fonts](tools/fonts/README.md).
Логотип, декоративные вопросы и массивные YES/NO — собственные векторные
контуры; `node scripts/make-wordmark.mjs` воспроизводит wordmark и золотой вопрос.

Сохранённый результат 56a находится в ignored-каталоге
`references/review/2026-10-23-release/`: четыре полные последовательности,
оба сравнения «фильм / до / после», ключевые состояния и протоколы проверок.
Фактическое «до» — неизменённые ролики опубликованного `bee1d41`.
Просмотр — [фильм / до / после](docs/visual-comparison.html) и
[четыре сочетания маршрута и ответа](docs/camera-scenarios.html).
Материалы фильма и review не входят в production build или публичный Git.

Для следующего прохода сначала создать новый review-каталог и успешный
полный `check-result.json`, затем запустить preview именно проверенного dist.
На big-one экспортировать с `MD_REVIEW_FPS=30 bash scripts/export-review.sh`
и повторить с `--cross`. В `scripts/prepare-release-media.py` явно передать
новые `--review-dir` и `--work-dir`; для сравнений также указать фактический
`--baseline-dir` и `--calibrated-film-dir references/review/2026-10-21-perceptual`.
Не перезаписывать завершённые пакеты и не возвращаться к старому невыправленному
кадрированию. После обновления ссылок страниц выполнить
`bash scripts/check-review-media.sh`.

После фактического просмотра и public smoke записать manifest:
`python3 scripts/verify-release-review.py --normal-speed --review-dir references/review/<новый-каталог> --collect`.
Повтор без `--collect` проверяет сохранённый результат уже без `.review`.
Полный порядок, идентичность сборки и ограничения — HANDOFF и DEPLOYMENT.

Текущие видео — детерминированный экспорт 30 fps с паузой .5 s на финале,
не измерение FPS устройства. Скорость фильма и реконструкции не меняется.
Прямого видеоплеера у агента нет: все кадры просматриваются на листах,
отдельно проверяются полный браузерный playback 1×, seek и ¼ скорости.

Во время работы периодически запускать `python3 scripts/prune-review.py`
для плана очистки, затем `--apply`: удаляются только воспроизводимые дубли
старых сохранённых итераций после проверки hashes. Два последних пакета,
активные пробы, оригиналы и полезные доказательства остаются. После выпуска
сохранить и проверить компактный пакет, затем удалить созданные scratch-файлы
и остановить временный preview.
