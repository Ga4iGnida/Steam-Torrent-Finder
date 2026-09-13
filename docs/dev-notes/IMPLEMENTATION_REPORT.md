# IMPLEMENTATION_REPORT — Steam Torrent Finder

Дата: 13.09.2026. Базис: AUDIT.md + IMPLEMENTATION_SPEC.md, независимая верификация всех находок (Phase 0), затем реализация по фазам 1–7.

---

## Summary

Все находки аудита (2 Critical, 3 Major из перечня MJ, Minor, UX, Perf, SC) проверены независимо по исходникам — **все признаны VALID**, отклонённых пунктов спека не имеет. Реализованы все фазы: критическая безопасность (XSS/credentials), мажорные дефекты (ретраи, watchdog, перерендер, дублирование конфигов, relative URLs, дубли enrichment), UX/перф, тесты, red-team.

Ключевые числа:
- **39/39** unit-тестов зелёные (новый `tests/run.js`, vm-харнест с моками fetch/chrome).
- **23/23** red-team векторов отбиты (после усиления `sanitizeMagnet`).
- Изменённые файлы: `manifest.json`, `common.js` (новый), `background.js`, `content.js`, `popup.js`, `popup.html`, `styles.css`, `tests/run.js` (новый).

Архитектура не переписывалась: порт-протокол стриминга, epoch-гарды, Promise.any failover, windows-1251 декодер, релевантность — сохранены как были.

---

## Security Fixes

### CR-01 — XSS через неэкранированные href/атрибуты (магнит, detailUrl)
- `content.js`: новый `escapeAttr(str)` = escapeHtml (включая `'`→`&#39;`, SC-02) + замена `[\s'`]` → `%20/%27/%60` (defense-in-depth для значений в атрибутах).
- Все точки вставки: `href="${escapeAttr(r.magnet)}"`, `href="${escapeAttr(r.detailUrl)}"` в `versionRow`/`fixCard`; `data-key`, `style --tc`, attempt-текст — через `escapeHtml`.
- `background.js`: `sanitizeMagnet(raw)` — белый список `/^magnet:\?xt=urn:btih:(40hex|64hex|32base32)(?:&|$)/`, reject `["'<>\\\`\s]`; невалидный → `null`. `sanitizeDetailUrl(u)` — `new URL`, протокол только `http:/https:` (протокол-относительные, `javascript:`, `data:`, userinfo-трюки отсекаются), иначе `undefined`.
- Санитайзеры применены во **всех** точках присвоения: apibay `magnetFromHash`, TPB HTML магнит, 1337x detailUrl, rutracker, freetp/onlinefix detailUrl, enrichment, customParser (магнит в списке и resolve href).

### CR-02 — credentials:include на все запросы
- `fetchWithTimeout`: креды теперь из whitelist `CREDENTIAL_HOSTS = { rutracker.org, freetp.org, online-fix.me }` (exact hostname match, `STF_COMMON.needsCredentials`). Все остальные хосты (включая все зеркала TPB, apibay, 1337x, произвольные URL кастомных трекеров) — `credentials: 'omit'`. Rutracker сохраняет include (login-gated).

### SC-01 / SC-02
- Покрыты выше: валидация магнита/URL (SC-01), `&#39;` в escapeHtml (SC-02).

---

## Bug Fixes

### MJ-01 — ретраи на честной пустой выдаче
- Контракт парсеров: `{status:'ok'|'empty'|'unknown', results}`.
- `empty` (apibay `id:'0'`; TPB «searchResult есть, магнитов нет»; x1337 `coll-1` без строк; rutracker без torTopic; freetp/onlinefix маркеры «не найдено») → возврат сразу, **без ретраев**.
- `unknown` (нераспознанная разметка, пустой ответ) → ретрай до 3 попыток с паузой 2500мс. Зацикливания нет (покрыто тестом).

### MJ-02 — watchdog 75с короче легального worst-case
- `content.js`: activity-based watchdog — `WATCHDOG_IDLE = 40с`, сбрасывается на `started` и каждом `trackerResult`; отдельный абсолютный лимит `MAX_TOTAL_TIMEOUT = 120с`, не сбрасывается. Таймеры чистятся в `clearSearchTimers()`.

### MJ-03 / PF-03 — полный innerHTML-перерендер + переподписка слушателей
- Перерендер теперь **по блокам**: `renderTrackerBlock` обновляет только `div[data-tracker=…]` пришедшего трекера; состояние аккордеона (`openGroups`) сохраняется.
- Один делегированный click-листенер на `#stf-groups` (вешается в `setModalHtml`, пересоздаётся вместе с телом модалки — epoch-безопасно). `bindTabs` остался (один раз на открытие модалки).

### MJ-04 — дублирование дефолтов в 3 файлах
- Новый `common.js` (plain script, `self.STF_COMMON`): `BUILTIN_META`, `DEFAULT_GROUPS`, дефолтные enabled-флаги, `TRACKER_COLORS`, `CREDENTIAL_HOSTS`, `defaultSettings()`.
- Подключение: `importScripts('common.js')` в SW; `<script src=common.js>` в popup.html; `manifest.json` content_scripts `js: [common.js, content.js]`. Единый источник правды.

### MJ-05 — customParser терял относительные ссылки
- Regex `href="([^"#]+)"`, resolve через `new URL(href, baseUrl)`, same-origin строго по `.origin` (не `startsWith` — обход через query `https://evil.com/?https://site` не работает). Относительные и абсолютные same-origin ссылки сохраняются; `javascript:`/кросс-домен отбрасываются. Магнит напрямую в списке — подхватывается (с санитизацией, dedupe).

### MJ-06 — три почти одинаковых enrich
- Хелпер `fetchPage(url,{enc1251,timeoutMs})`; `x1337Enrich`/`freetpEnrich` переведены на него, единая валидация магнита через `sanitizeMagnet`.

### Минорные
- **MN-01**: GitHub-заглушка из popup.html удалена.
- **MN-02**: EN-локализация статических надписей popup (чекбоксы windows-1251/магнит, заголовки удаления) через I18N + `applyLang`.
- **MN-03**: бесконечные setTimeout-ретраи монтирования кнопки убраны — `init` максимум 10 попыток × 800мс, основное монтирование на MutationObserver.
- **MN-04**: пустой catch в `safePost` → `console.warn` с деталями.
- **MN-05**: проверка дубликатов имён папок в popup (case-insensitive, ru/en).
- **MN-06**: rutracker fallback-псевдорезультат больше не `kind:'fix'` — рендерится обычной строкой со ссылкой.
- **MN-07**: `parseSize` принимает запятую («2,4 GB» → 2.4).

---

## UX Changes

- **UX-01**: при прерывании поиска (abort) панель показывает empty-state вместо пустой вкладки.
- **UX-02**: во время активного поиска видна подсказка «Закрытие панели остановит поиск» (`stf-close-hint`, I18N ru/en).
- **UX-03**: номер попытки отображается в строке ошибки трекера («попытка N», приходит в `trackerResult.attempt`).
- **UX-04**: кнопка «Проверить» в popup для кастомного трекера: одноразовый тест-фетч шаблона (без кред), ответ — количество результатов и до 3 заголовков, статус в `#testCustomHint`.

---

## Performance Changes

- **PF-01**: зеркала TPB — кэш последнего удачного зеркала (пробуется первым), `AbortController` на каждое зеркало, проигравшие абортятся через ~1с после победителя; HTML-ретраи не крутятся, если apibay уже дал результат. До 15 фетчей → обычно 1–2.
- **PF-02**: MutationObserver в content-скрипте с debounce 300мс вместо 2 querySelector на каждый мутации.

---

## Tests

Новый `tests/run.js` (~450 строк, node, без зависимостей): vm-контекст с моками `fetch` (роуты по regex + журнал вызовов), `chrome.storage/runtime`, `TextDecoder`; `common.js`+`background.js` исполняются в контексте, экспорт через `__exports`.

Покрытие (39 тестов):
- `sanitizeMagnet` — 9 кейсов (40/64 hex, base32, `&quot;`, javascript:, `//evil`, `< >` и пробелы, мусор);
- `sanitizeDetailUrl` — 6 кейсов (javascript:, data:, file:, protocol-relative, userinfo);
- парсеры apibay/piratebayHtml/x1337 — empty/unknown/parse + XSS-векторы в магнит-атрибутах;
- customParser — относительные ссылки, `//evil`, `javascript:`, магнит в списке, startsWith-обход;
- credentials — rutracker/freetp/online-fix → include, apibay → omit;
- контракт пустоты — empty не порождает повторных фетчей, unknown допускает ретрай;
- `parseSize` запятая, enrich-валидация магнита, `defaultSettings`, `needsCredentials`, rutracker-fallback без `kind:'fix'`, `&#39;` в escapeHtml.

Запуск: `node tests/run.js` → **39 passed, 0 failed**.

---

## Regression Review

Сохранено без изменений (проверено тестами и ревью кода):
- Порт-протокол стриминга + `Promise.all` + `safePost` + `finally done`;
- epoch-гарды (`searchEpoch`, stall/watchdog) — делегированный слушатель пересоздаётся вместе с `#stf-groups`, старые замыкания мертвы вместе со старым DOM;
- Promise.any failover зеркал; TextDecoder windows-1251;
- `baseTitleKey`/`tokenizeSmart`/`relevanceScore`/`isAlienGame`/`isAlienFix` — не тронуты (сортировка/группировка/релевантность как были);
- Санитизация раскладки папок (`loadLayout`), `fmt1337Date` future-check, `normalizeUrlTemplate`, миграции popup-стейта;
- Дефолтные enabled-флаги сохранены (rutracker выключен по умолчанию).

Наблюдения при дебаге: отсечение «чужих» игр в customParser — штатная работа `isAlienGame` (не регрессия).

---

## Red Team (Phase 6)

23 атакующих вектора (vm-скрипт, удалён после прохода) — **23/23 отбиты**:
- магнит: newline/tab в параметрах, 41/63-hex границы, base32 с невалидными символами 0/1/8/9, отсутствие `xt`, backtick в `dn`, регистры `urn:`/`btih` — все невалидные → `null`;
- после red-team-прохода `sanitizeMagnet` усилен: backtick добавлен в reject-список (defense-in-depth, хотя escapeAttr уже гасил `%60`);
- URL: `\\`, `JAVASCRIPT:`/`vbscript:`/`blob:`, CR/LF внутри, userinfo, порт, `data:` в query — не обходят whitelist;
- XSS-полезные нагрузки в `name` (apibay JSON), `href` с entity-кавычками (customParser, TPB HTML) — не выживают в магнитах/URL;
- ретрай-контракт: unknown останавливается на 3 попытках, зацикливания нет;
- `escapeAttr`-инвариант: 8 векторов на разрыв двойного атрибута — не разрывается.

---

## Remaining Risks

1. **Кастомные трекеры с обфусцированной разметкой**: generic-парсер вытащит только plain `<a href>`; если сайт отдаёт ссылки через JS — результата не будет (unknown → ретрай → ошибка). Это ожидаемое ограничение, не уязвимость.
2. **TPB зеркала захардкожены**: при глобальной смерти всех 5 поиск TPB падает с ошибкой (корректный empty-state, но без автообновления списка зеркал).
3. **`MAX_TOTAL_TIMEOUT=120с`** — компромисс: очень медленные трекеры могут быть обрезаны абсолютным лимитом.
4. **Freetp/online-fix креды** оставлены `include` по спеке (DLE-движки, логин редко нужен) — сузить можно позже, если появится решение аудитора.
5. Тесты не покрывают UI-слой `content.js` (рендер/делегирование) — только DOM-инварианты escapeAttr в red-team. Ручная проверка на живом Steam-странице перед релизом рекомендуется.

---

## Changed Files

| Файл | Статус | Что изменено |
|---|---|---|
| `common.js` | **новый** | единый источник констант (MJ-04) |
| `background.js` | переписан частично | CR-01/02, MJ-01/05/06, PF-01, MN-04/06/07, UX-04 handler, UX-03 attempt |
| `content.js` | переписан частично | CR-01 escapeAttr, MJ-02 watchdog, MJ-03 блочный рендер, UX-01/02/03, MN-03, PF-02, SC-02 |
| `popup.js` | изменён | MJ-04 из common, UX-04 «Проверить», MN-02/05 |
| `popup.html` | изменён | common.js, UX-04 кнопка/hint, MN-01 (GitHub удалён), CSS hint |
| `styles.css` | изменён | `.stf-close-hint` |
| `manifest.json` | изменён | `common.js` в content_scripts |
| `tests/run.js` | **новый** | 39 тестов |
| `IMPLEMENTATION_REPORT.md` | **новый** | этот отчёт |

---

## Final Verdict

Оба Critical закрыты с проверкой на обход (red-team 23/23). Мажорные дефекты (ретраи на пустых, watchdog, перерендер, дублирование, relative URLs, дубли enrichment) устранены минимальными изменениями без ломки работающих интеграций. Регрессионная поверхность проверена: протокол поиска, парсинг, ранжирование, failover, магниты, раскладка папок, epoch-гарды — сохранены.

**Готово к ручному приёмочному тесту на живой странице Steam** (загрузка распакованного расширения, поиск по 5 трекерам, кастомный трекер + «Проверить», сворачивание панелей во время поиска). Блокирующих дефектов не осталось.
