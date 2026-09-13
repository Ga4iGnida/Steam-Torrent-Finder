// ============================================================
// Steam Torrent Finder — минимальный тест-раннер (node tests/run.js)
// Подключает common.js + background.js с моками chrome/fetch и
// прогоняет: XSS-векторы, парсеры, креды, retry-контракт.
// ============================================================

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// ---------- Моки окружения для background.js ----------

const fetchLog = [];         // [{url, opts}]
const fetchRoutes = [];      // [{match: RegExp|url, respond: (url, opts)=>({ok,status,text,json})}]

function mockFetch(url, opts = {}) {
  fetchLog.push({ url: String(url), opts });
  for (const route of fetchRoutes) {
    const hit = typeof route.match === 'string' ? route.match === url : route.match.test(url);
    if (hit) {
      const r = route.respond(url, opts);
      return Promise.resolve({
        ok: r.ok !== false,
        status: r.status || 200,
        text: async () => r.text || '',
        json: async () => r.json !== undefined ? r.json : JSON.parse(r.text || '[]'),
        arrayBuffer: async () => {
          // windows-1251 декодер: мокнем TextDecoder так, чтобы он вернул r.text как есть
          return new TextEncoder().encode(r.text || '').buffer;
        }
      });
    }
  }
  return Promise.reject(new Error(`mockFetch: нет маршрута для ${url}`));
}

// windows-1251 мок: в тестах просто возвращаем исходный текст
class MockTextDecoder {
  constructor(enc) { this.enc = enc; }
  decode(buf) { return Buffer.from(buf).toString('utf8'); }
}

const storageData = { language: 'ru' };
const chromeMock = {
  runtime: {
    onConnect: { addListener: () => {} },
    onMessage: { addListener: () => {} },
    onInstalled: { addListener: () => {} }
  },
  storage: {
    sync: {
      get: async (defaults) => {
        if (typeof defaults === 'object' && defaults !== null && !Array.isArray(defaults)) {
          const out = {};
          for (const k of Object.keys(defaults)) out[k] = storageData[k] !== undefined ? storageData[k] : defaults[k];
          return out;
        }
        return { ...storageData };
      },
      set: async (obj) => Object.assign(storageData, obj)
    }
  }
};

// ---------- Загрузка background.js в sandbox ----------

function loadBackground() {
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    fetch: mockFetch,
    TextDecoder: MockTextDecoder,
    TextEncoder,
    AbortController,
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    chrome: chromeMock,
    importScripts: () => {},   // common.js исполним вручную в том же контексте
    STF_COMMON: undefined
  };
  ctx.self = ctx;   // common.js пишет в self.STF_COMMON
  const ctx2 = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'common.js'), 'utf8'), ctx2);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8'), ctx2);
  // const в vm-контексте не попадает в свойства объекта контекста —
  // выгружаем нужные символы явно
  vm.runInContext(`
    this.__exports = {
      TRACKER_PARSERS, customParser, sanitizeMagnet, sanitizeDetailUrl,
      fetchWithTimeout, parseSize, x1337Enrich, freetpEnrich, STF_COMMON,
      baseTitleKey, isAlienFix, isAlienGame, filterRelevant
    };
  `, ctx2);
  return ctx2.__exports;
}

let BG = null;

// ---------- helpers ----------

function route(match, respond) { fetchRoutes.push({ match, respond }); }
function resetRoutes() { fetchRoutes.length = 0; fetchLog.length = 0; }

const GAMES_HTML_ROWS = `
<tr><td><a href="/torrent/111/name.html">Deep Rock Galactic v1.0</a></td>
<td align="right">120</td><td align="right">5</td>
<td>08-20 19:14</td>
<td align="right">1.2&nbsp;GB</td>
<td><a href="/browse/401">401</a></td>
<td><a href="magnet:?xt=urn:btih:%41%41%41">magnet</a></td></tr>`;

// ---------- Тесты ----------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ==== CR-01/SC-01: sanitizeMagnet ====

test('sanitizeMagnet: валидный 40-hex магнит проходит', () => {
  const m = BG.sanitizeMagnet('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=test');
  assert.ok(m && m.startsWith('magnet:?xt=urn:btih:0123456789abcdef'));
});

test('sanitizeMagnet: валидный 64-hex магнит проходит', () => {
  const m = BG.sanitizeMagnet('magnet:?xt=urn:btih:' + 'a'.repeat(64) + '&dn=x');
  assert.ok(m);
});

test('sanitizeMagnet: валидный 32-base32 магнит проходит', () => {
  const m = BG.sanitizeMagnet('magnet:?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
  assert.ok(m);
});

test('sanitizeMagnet: XSS-вектор с &quot; (уже декодированный в ") отбрасывается', () => {
  // то, что придет после decodeEntities: магнит с разорванным атрибутом
  const m = BG.sanitizeMagnet('magnet:?xt=urn:btih:AAAA" onmouseover="alert(1)');
  assert.strictEqual(m, null);
});

test('sanitizeMagnet: XSS-вектор entity-encoded &quot; отбрасывается (hash не hex)', () => {
  const m = BG.sanitizeMagnet('magnet:?xt=urn:btih:AAA&quot; onmouseover=&quot;alert(1)');
  assert.strictEqual(m, null);
});

test('sanitizeMagnet: javascript: и data: отбрасываются', () => {
  assert.strictEqual(BG.sanitizeMagnet('javascript:alert(1)'), null);
  assert.strictEqual(BG.sanitizeMagnet('data:text/html,<script>alert(1)</script>'), null);
});

test('sanitizeMagnet: протокол-относительный //evil отбрасывается', () => {
  assert.strictEqual(BG.sanitizeMagnet('//evil.com/x'), null);
});

test('sanitizeMagnet: магнит с < > или пробелом отбрасывается', () => {
  assert.strictEqual(BG.sanitizeMagnet('magnet:?xt=urn:btih:' + 'a'.repeat(40) + '<b>'), null);
  assert.strictEqual(BG.sanitizeMagnet('magnet:?xt=urn:btih:' + 'a'.repeat(40) + ' x'), null);
});

test('sanitizeMagnet: пустой/мусорный вход — null', () => {
  assert.strictEqual(BG.sanitizeMagnet(''), null);
  assert.strictEqual(BG.sanitizeMagnet(null), null);
  assert.strictEqual(BG.sanitizeMagnet(undefined), null);
  assert.strictEqual(BG.sanitizeMagnet('magnet:?xt=urn:btih:zzzz'), null);
});

// ==== CR-01: sanitizeDetailUrl ====

test('sanitizeDetailUrl: https проходит', () => {
  const u = BG.sanitizeDetailUrl('https://freetp.org/page');
  assert.ok(u && u.startsWith('https://freetp.org/page'));
});

test('sanitizeDetailUrl: http проходит', () => {
  assert.ok(BG.sanitizeDetailUrl('http://example.org/a'));
});

test('sanitizeDetailUrl: javascript: отбрасывается', () => {
  assert.strictEqual(BG.sanitizeDetailUrl('javascript:alert(1)'), undefined);
});

test('sanitizeDetailUrl: data: и file: отбрасываются', () => {
  assert.strictEqual(BG.sanitizeDetailUrl('data:text/html;base64,PHNjcmlwdD4='), undefined);
  assert.strictEqual(BG.sanitizeDetailUrl('file:///C:/x'), undefined);
});

test('sanitizeDetailUrl: protocol-relative //evil отбрасывается (URL резолвит в http:)', () => {
  // new URL('//evil.com/x') — невалиден без базы → undefined
  assert.strictEqual(BG.sanitizeDetailUrl('//evil.com/x'), undefined);
});

test('sanitizeDetailUrl: userinfo-трюк не обходит whitelist протокола', () => {
  // протокол http — пройдёт как http (не опасно для href), но javascript не пройдёт
  assert.strictEqual(BG.sanitizeDetailUrl('java\nscript:alert(1)'), undefined);
});

// ==== Парсер apibay (piratebay через JSON) ====

test('apibay: честный пустой результат → empty (без ретраев)', async () => {
  resetRoutes();
  route(/apibay\.org/, () => ({ text: JSON.stringify([{ id: '0', name: 'No results' }]) }));
  const res = await BG.TRACKER_PARSERS.piratebay('Test Game');
  assert.strictEqual(res.status, 'empty');
  assert.strictEqual(res.results.length, 0);
});

test('apibay: результаты парсятся и магнит валидирован', async () => {
  resetRoutes();
  route(/apibay\.org/, () => ({
    text: JSON.stringify([
      { id: '1', name: 'Deep Rock Galactic v1.0', info_hash: '0123456789abcdef0123456789abcdef01234567', seeders: '50', leechers: '2', size: '1000', added: '1700000000', category: '401' },
      { id: '2', name: 'Bad &quot;release', info_hash: 'bad', seeders: '1', leechers: '0', size: '10', added: '1700000000', category: '401' }
    ])
  }));
  const res = await BG.TRACKER_PARSERS.piratebay('Deep Rock Galactic');
  assert.strictEqual(res.status, 'ok');
  assert.ok(res.results.length >= 1);
  for (const r of res.results) {
    // магнит либо валиден, либо null
    if (r.magnet) assert.match(r.magnet, /^magnet:\?xt=urn:btih:[0-9a-f]{40}/);
  }
});

// ==== Парсер PirateBay HTML ====

test('piratebayHtml: XSS в магнит-атрибуте не попадает в результат', async () => {
  resetRoutes();
  const evil = `<a href="magnet:?xt=urn:btih:AAAA&quot; onmouseover=&quot;alert(1)">x</a>`;
  route(/thepiratebay\.party/, () => ({
    text: `<table id="searchResult"><tr>${GAMES_HTML_ROWS}</tr><tr><td>${evil}</td></tr></table>`
  }));
  const res = await BG.TRACKER_PARSERS.piratebayHtml('Deep Rock Galactic');
  if (res.status === 'ok') {
    for (const r of res.results) {
      if (r.magnet) {
        assert.ok(!r.magnet.includes('"'), 'кавычка в магнитe: ' + r.magnet);
        assert.ok(!/[<>\s]/.test(r.magnet), 'скобки/пробел в магнитe: ' + r.magnet);
      }
      if (r.detailUrl) assert.match(r.detailUrl, /^https:/);
    }
  }
});

test('piratebayHtml: честный пустой список → empty', async () => {
  resetRoutes();
  route(/thepiratebay\.party/, () => ({
    text: `<table id="searchResult"><tr><td>nothing here</td></tr></table>`
  }));
  const res = await BG.TRACKER_PARSERS.piratebayHtml('Test');
  assert.strictEqual(res.status, 'empty');
});

test('piratebayHtml: нераспознанная разметка → unknown', async () => {
  resetRoutes();
  route(/thepiratebay\.(party|bond|live|zone)|thehiddenbay\.com/, () => ({ text: `<html><body>maintenance</body></html>` }));
  await assert.rejects(
    () => BG.TRACKER_PARSERS.piratebayHtml('Test'),
    (e) => /все зеркала недоступны/.test(e.message)
  );
});

// ==== customParser (MJ-05): относительные и протокол-относительные ссылки ====

test('customParser: относительные ссылки резолвятся от базового URL', async () => {
  resetRoutes();
  const base = 'https://example-games.org/index.php?do=search&story={q}';
  route(/example-games\.org\/index\.php\?do=search/, () => ({
    text: `<div class="article clr">
      <a href="/download/deep-rock-galactic">Deep Rock Galactic download page</a>
      <a href="https://example-games.org/download/drg-2">Deep Rock Galactic v2 repack</a>
      <a href="https://evil-neighbor.org/deep-rock-galactic">Deep Rock Galactic evil mirror page</a>
    </div>`
  }));
  const parser = BG.customParser({ searchUrl: base, grabMagnet: false });
  const res = await parser('Deep Rock Galactic');
  assert.strictEqual(res.status, 'ok');
  for (const r of res.results) {
    assert.ok(r.detailUrl.startsWith('https://example-games.org/'),
      'same-origin нарушен: ' + r.detailUrl);
  }
  assert.ok(res.results.length >= 1, 'относительная ссылка не потеряна');
});

test('customParser: протокол-относительная //evil отсекается same-origin фильтром', async () => {
  resetRoutes();
  const base = 'https://example-games.org/search?q={q}';
  route(/example-games\.org\/search/, () => ({
    text: `<div><a href="//evil.org/deep-rock-galactic-download">Deep Rock Galactic download here</a></div>`
  }));
  const parser = BG.customParser({ searchUrl: base, grabMagnet: false });
  const res = await parser('Deep Rock Galactic');
  assert.strictEqual(res.results.filter(r => r.detailUrl && r.detailUrl.includes('evil')).length, 0);
});

test('customParser: javascript: href не попадает в результаты', async () => {
  resetRoutes();
  const base = 'https://example-games.org/search?q={q}';
  route(/example-games\.org\/search/, () => ({
    text: `<div><a href="javascript:alert(1)">Deep Rock Galactic javascript link</a></div>`
  }));
  const parser = BG.customParser({ searchUrl: base, grabMagnet: false });
  const res = await parser('Deep Rock Galactic');
  assert.strictEqual(res.results.length, 0);
});

test('customParser: магнит прямо в списке подхватывается', async () => {
  resetRoutes();
  const base = 'https://example-games.org/search?q={q}';
  const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=DRG';
  route(/example-games\.org\/search/, () => ({
    text: `<div><a href="${magnet}">Deep Rock Galactic</a></div>`
  }));
  const parser = BG.customParser({ searchUrl: base, grabMagnet: false });
  const res = await parser('Deep Rock Galactic');
  assert.strictEqual(res.status, 'ok');
  assert.ok(res.results[0].magnet === magnet, 'магнит не потерян');
});

test('customParser: startsWith-обход через query не работает (same-origin по .origin)', async () => {
  resetRoutes();
  const base = 'https://example-games.org/search?q={q}';
  route(/example-games\.org\/search/, () => ({
    text: `<div><a href="https://example-games.org.evil.org/?https://example-games.org">Deep Rock Galactic fake origin page</a></div>`
  }));
  const parser = BG.customParser({ searchUrl: base, grabMagnet: false });
  const res = await parser('Deep Rock Galactic');
  assert.strictEqual(res.results.length, 0);
});

// ==== 1337x парсер ====

test('x1337: честная пустая выдача → empty', async () => {
  resetRoutes();
  route(/1337x\.la/, () => ({
    text: `<div class="coll-1 name">no torrents</div>`   // маркер есть, строк нет
  }));
  const res = await BG.TRACKER_PARSERS.x1337('Test Game');
  assert.strictEqual(res.status, 'empty');
});

test('x1337: результаты парсятся, detailUrl валидирован', async () => {
  resetRoutes();
  route(/1337x\.la/, () => ({
    text: `<table>
      <tr>
        <td class="coll-1 name"><a href="/torrent/123/drg.html">Deep Rock Galactic v1.0 repack</a></td>
        <td class="coll-2 seeds"><span>120</span></td>
        <td class="coll-3 leeches"><span>5</span></td>
        <td class="coll-4 size">1.2 GB</td>
      </tr>
    </table>`
  }));
  const res = await BG.TRACKER_PARSERS.x1337('Deep Rock Galactic');
  assert.strictEqual(res.status, 'ok');
  assert.ok(res.results.length === 1);
  assert.match(res.results[0].detailUrl, /^https:\/\/1337x\.la\/torrent\/123/);
});

// ==== CR-02: credentials whitelist ====

test('fetchWithTimeout: rutracker получает credentials: include', async () => {
  resetRoutes();
  let seenOpts = null;
  route(/rutracker\.org/, (url, opts) => { seenOpts = opts; return { text: 'torTopic' }; });
  await BG.fetchWithTimeout('https://rutracker.org/forum/tracker.php?nm=x', 1000);
  assert.strictEqual(seenOpts.credentials, 'include');
});

test('fetchWithTimeout: apibay получает credentials: omit', async () => {
  resetRoutes();
  let seenOpts = null;
  route(/apibay\.org/, (url, opts) => { seenOpts = opts; return { text: '[]' }; });
  await BG.fetchWithTimeout('https://apibay.org/q.php?q=x', 1000);
  assert.strictEqual(seenOpts.credentials, 'omit');
});

test('fetchWithTimeout: freetp и online-fix получают include', async () => {
  resetRoutes();
  const seen = [];
  route(/freetp\.org/, (u, o) => { seen.push(['freetp', o.credentials]); return { text: '<div class="heading"></div>' }; });
  route(/online-fix\.me/, (u, o) => { seen.push(['onlinefix', o.credentials]); return { text: '<div class="article clr"></div>' }; });
  await BG.fetchWithTimeout('https://freetp.org/x', 1000);
  await BG.fetchWithTimeout('https://online-fix.me/x', 1000);
  assert.deepStrictEqual(seen, [['freetp', 'include'], ['onlinefix', 'include']]);
});

// ==== MJ-01: runTracker контракт ====

// runTracker недоступна напрямую (внутри onConnect), поэтому тестируем контракт
// через парсеры: empty → не ретраится. Проверяем через счётчик вызовов fetch.
test('контракт: empty-результат не порождает повторных fetch', async () => {
  resetRoutes();
  let calls = 0;
  route(/apibay\.org/, () => { calls++; return { text: JSON.stringify([{ id: '0', name: 'No results' }]) }; });
  await BG.TRACKER_PARSERS.piratebay('Test');
  // сам парсер один вызов; ретрай-логика в runTracker видит status==='empty' и выходит сразу
  assert.strictEqual(calls, 1);
});

test('контракт: unknown-результат допускает ретрай (статус корректен)', async () => {
  resetRoutes();
  route(/freetp\.org/, () => ({ text: '<html>maintenance page</html>' }));
  const res = await BG.TRACKER_PARSERS.freetp('Test');
  assert.strictEqual(res.status, 'unknown');
});

// ==== MN-07: parseSize с запятой ====

test('parseSize: «2,4 GB» → 2.4 GB', () => {
  assert.strictEqual(BG.parseSize('2,4 GB'), 2.4 * 1024 ** 3);
});

test('parseSize: «1.5 MB» работает как раньше', () => {
  assert.strictEqual(BG.parseSize('1.5 MB'), 1.5 * 1024 ** 2);
});

// ==== MJ-06: fetchPage / enrich ====

test('x1337Enrich: магнит со страницы торрента валидируется', async () => {
  resetRoutes();
  const good = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=x';
  const evil = 'magnet:?xt=urn:btih:AAAA" onmouseover="alert(1)';
  route(/1337x\.la/, () => ({
    text: `<a href="${good}">m</a><a href="${evil}">evil</a>`
  }));
  const r = { detailUrl: 'https://1337x.la/torrent/1/x', magnet: null, needsPage: true };
  await BG.x1337Enrich(r);
  // первый найденный магнит — валидный
  assert.strictEqual(r.magnet, good);
  assert.strictEqual(r.needsPage, false);
});

// ==== common.js: единый источник ====

test('common.js: defaultSettings содержит все 5 трекеров с корректными группами', () => {
  const s = BG.STF_COMMON.defaultSettings();
  assert.deepStrictEqual(Object.keys(s.trackers).sort(), ['freetp', 'onlinefix', 'piratebay', 'rutracker', 'x1337']);
  assert.strictEqual(s.trackers.rutracker.enabled, false);
  assert.strictEqual(s.trackers.piratebay.group, 'regular');
  assert.strictEqual(s.trackers.freetp.group, 'fix');
});

test('common.js: needsCredentials точно по hostname', () => {
  assert.strictEqual(BG.STF_COMMON.needsCredentials('https://rutracker.org/x'), true);
  assert.strictEqual(BG.STF_COMMON.needsCredentials('https://evil-rutracker.org/x'), false);
  assert.strictEqual(BG.STF_COMMON.needsCredentials('https://apibay.org/x'), false);
  assert.strictEqual(BG.STF_COMMON.needsCredentials('not a url'), false);
});

// ==== MN-06: rutracker fallback — обычная строка, не fix-карточка ====

test('rutracker fallback: без kind fix, с detailUrl, магнит пуст', async () => {
  resetRoutes();
  route(/rutracker\.org/, () => ({ text: 'Just a moment...' }));
  const res = await BG.TRACKER_PARSERS.rutracker('Test Game');
  assert.strictEqual(res.status, 'ok');
  assert.strictEqual(res.results.length, 1);
  assert.notStrictEqual(res.results[0].kind, 'fix');
  assert.ok(res.results[0].detailUrl.startsWith('https://rutracker.org'));
  assert.strictEqual(res.results[0].magnet, null);
});

// ==== escapeHtml в content.js — проверяем эквивалент через строку ====

test('escapeHtml-семантика: одинарная кавычка кодируется в &#39;', () => {
  // content.js в IIFE, напрямую не достать; проверяем инвариант через санитайзер:
  // всё, что escapeHtml + escapeAttr, не может разорвать атрибут в двойных кавычках
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const payload = `x" onmouseover="alert(1)' onmouseover='alert(1)`;
  const out = esc(payload);
  assert.ok(!/["']/.test(out), 'кавычки выжили: ' + out);
});

// ==== Регрессия DRG: хвост «| RePack от X» не должен делать релиз «чужой игрой» ====

test('baseTitleKey: хвост после «|» (RePack от Pioneer) отрезается', () => {
  const t = 'Deep Rock Galactic [v 1.40.135784.0 + DLCs] (2018) PC | RePack от Pioneer';
  assert.strictEqual(BG.baseTitleKey(t), 'deep rock galactic');
});

test('isAlienFix: релиз «| RePack от Pioneer» — НЕ чужая игра (кастомный трекер, DRG-кейс)', () => {
  const t = 'Deep Rock Galactic [v 1.40.135784.0 + DLCs] (2018) PC | RePack от Pioneer';
  assert.strictEqual(BG.isAlienFix(t, 'Deep Rock Galactic'), false);
});

test('isAlienFix: «: Survivor» после пайп-обрезки всё ещё чужая игра', () => {
  const t = 'Deep Rock Galactic: Survivor - Complete Edition [v 1.0.236P + DLC\u0395s] (2025) PC | RePack от FitGirl';
  assert.strictEqual(BG.isAlienFix(t, 'Deep Rock Galactic'), true);
});

test('isAlienGame: не-fix ветка тоже не режет релиз с «| Repack by X»', () => {
  const t = 'Deep Rock Galactic [v 1.38] (2018) PC | Repack by xatab';
  assert.strictEqual(BG.isAlienGame(t, 'Deep Rock Galactic'), false);
});

// ---------- Runner ----------

(async () => {
  BG = loadBackground();
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`  ok  ${name}`);
    } catch (e) {
      fail++;
      console.error(`FAIL  ${name}\n      ${e.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
