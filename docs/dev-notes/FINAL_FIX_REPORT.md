# D-1 Fix

## Причина проблемы

`fetchWithTimeout` в `background.js` формировал options для `fetch` так:

```js
return fetch(url, { signal: ctrl.signal, credentials: creds, ...opts })
```

Spread `...opts` стоял **после** `signal`, поэтому внешний `opts.signal` полностью
перезаписывал внутренний таймаут-signal. Следствия:

* внутренний `setTimeout(() => ctrl.abort(), timeoutMs)` по-прежнему срабатывал,
  но `fetch` был подписан на внешний signal — внутренний abort никого не прерывал;
* единственный call site с внешним signal — `grabMirror` для TPB-зеркал
  (`fetchWithTimeout(url, 7000, { signal: ctrl.signal })`) — терял свой 7-секундный
  таймаут: при зависшем зеркале fetch висел до браузерного таймаута/внешнего abort;
* reliability-дефект, не security: client watchdog (40с idle / 120с total) страховал,
  но зеркало не освобождалось вовремя.

Подтверждено vm-тестом до фикса: с `opts.signal` fetch висел >1.5с при таймауте 150мс;
без `opts.signal` внутренний таймаут работал (123мс).

# Changes

Одна функция — `fetchWithTimeout` (`background.js`, строки 17–43). Архитектура не менялась:

```js
const { signal: outerSignal, ...rest } = opts;
let onOuterAbort = null;
if (outerSignal) {
  if (outerSignal.aborted) {
    ctrl.abort(outerSignal.reason);                 // pre-aborted: мгновенный abort
  } else {
    onOuterAbort = () => ctrl.abort(outerSignal.reason);
    outerSignal.addEventListener('abort', onOuterAbort, { once: true });
  }
}
return fetch(url, { ...rest, credentials: creds, signal: ctrl.signal })
  .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res; })
  .finally(() => {
    clearTimeout(timer);
    if (outerSignal && onOuterAbort) outerSignal.removeEventListener('abort', onOuterAbort);
  });
```

Суть: внешний `opts.signal` больше не попадает в `fetch` напрямую — он **мостится**
во внутренний controller через одноразовый listener. Внутренний таймаут-signal всегда
остаётся тем signal, на который подписан `fetch`. Остальные opts (`credentials`,
`headers` и т.д.) передаются как раньше; приоритет явного `opts.credentials` над
needsCredentials-дефолтом сохранён; API (аргументы, возвращаемый промис, выброс
`HTTP <status>`) не изменён. Другой код не тронут: port/epoch, safePost, парсеры,
relevance, credential whitelist, XSS-санитайзеры — без изменений.

# Verification

vm-харнест вне репозитория (audit-rt\d1-verify2.js), мок-fetch «вечно висит» и
отклоняется только по abort, как реальный:

| # | Проверка | Результат |
|---|---|---|
| 1 | timeout с `opts.signal` — прерывается **внутренним** таймаутом (120мс) | ok, 121ms |
| 2 | timeout без `opts.signal` — работает как раньше | ok, 124ms |
| 3 | внешний `outer.abort()` пробрасывается и прерывает fetch | ok, 92ms |
| 4 | pre-aborted `opts.signal` — мгновенное отклонение | ok, 0ms |
| 5a | успешный ответ проходит (путь `res.ok`) | ok |
| 5b | abort после завершения не бросает — listener снят в `finally` | ok |
| 5c | в `fetch` уходит signal внутреннего контроллера (не внешний) | ok |
| 6 | credentials: rutracker=include, apibay=omit, явный `opts.credentials` приоритетен | ok |
| 7 | прочие opts (`headers`) доходят до `fetch` | ok |

Итог: **9 ok, 0 fail**.

# Tests

`node tests/run.js` → **39 passed, 0 failed** (exit 0). Включая критичные для фикса:
`fetchWithTimeout: rutracker credentials include`, `apibay omit`,
`freetp+online-fix include`, piratebayHtml XSS/empty/unknown, контракт ok/empty/unknown.

# Regression

TPB mirror logic проверена живым vm-харнестом (audit-rt\tpb-regress.js): два зеркала,
`thepiratebay.party` отвечает за 30мс, `thepiratebay.bond` «висит»:

* победитель определён через `Promise.any` за ~48мс — магнит и detailUrl валидны
  (`magnet:?xt=urn:btih:<40hex>`, `https://thepiratebay.party/torrent/42`);
* проигравший абортнут `abortLoserMirrors()` после grace-period 1с (PF-01) —
  подтверждено: bond попал в aborted-список;
* failover на apibay не изменён; таймаут зеркал теперь реально работает
  (внутренний 7с больше не отключается внешним signal);
* успешные запросы не ломаются (тест 5a/7 в d1-verify2).

Call sites `fetchWithTimeout` переревизированы (10 мест): только `grabMirror`
передаёт `signal`; остальные — timeout/`credentials:'include'` — поведение без
изменений.

# Security Regression

Security-логика не менялась (изменена только функция `fetchWithTimeout`):

* credential whitelist не изменён: `CREDENTIAL_HOSTS`/`needsCredentials` в
  `common.js` не тронуты; приоритет `opts.credentials` и дефолт
  include/omit подтверждены тестом 6 (rutracker=include, apibay=omit) и
  существующими credential-тестами 39/39;
* custom trackers по-прежнему `omit` (needsCredentials возвращает false для
  произвольных доменов — покрыто тестом «needsCredentials точно по hostname»);
* XSS-санитизация без изменений: `sanitizeMagnet`, `sanitizeDetailUrl`,
  `escapeHtml`, `escapeAttr` не модифицированы; соответствующие тесты зелёные;
* manifest, permissions, content_scripts, messaging — не затронуты.

# Final Status

READY FOR LIVE STEAM ACCEPTANCE
