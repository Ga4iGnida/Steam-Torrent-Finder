// ============================================================
// Steam Torrent Finder — background service worker (MV3)
// Потоковый поиск по трекерам: каждый результат уходит в
// content script сразу, как только пришёл.
// ============================================================

importScripts('common.js');

// Настройки по умолчанию — единый источник в common.js (MJ-04)
const DEFAULT_SETTINGS = STF_COMMON.defaultSettings();
const DEFAULT_GROUPS = STF_COMMON.DEFAULT_GROUPS;

// ==== УТИЛИТЫ ====

// Cookies уходят только хостам из белого списка (CR-02):
// rutracker/freetp/online-fix реально гейтятся логином, остальным — omit.
function fetchWithTimeout(url, timeoutMs = 10000, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const creds = opts.credentials || (STF_COMMON.needsCredentials(url) ? 'include' : 'omit');
  // D-1: opts.signal больше не перезаписывает внутренний таймаут-signal.
  // Внешний сигнал мостится во внутренний controller: abort снаружи
  // прерывает fetch, но внутренний timeout при этом продолжает работать.
  const { signal: outerSignal, ...rest } = opts;
  let onOuterAbort = null;
  if (outerSignal) {
    if (outerSignal.aborted) {
      ctrl.abort(outerSignal.reason);
    } else {
      onOuterAbort = () => ctrl.abort(outerSignal.reason);
      outerSignal.addEventListener('abort', onOuterAbort, { once: true });
    }
  }
  return fetch(url, { ...rest, credentials: creds, signal: ctrl.signal })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    })
    .finally(() => {
      clearTimeout(timer);
      if (outerSignal && onOuterAbort) outerSignal.removeEventListener('abort', onOuterAbort);
    });
}

// Валидация магнита (CR-01/SC-01): btih-хэш 40/64 hex или 32 base32,
// параметры без кавычек/угловых скобок. Битый — null.
const MAGNET_RE = /^magnet:\?xt=urn:btih:([a-fA-F0-9]{40}|[a-fA-F0-9]{64}|[A-Za-z2-7]{32})(?:&|$)/;

function sanitizeMagnet(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!MAGNET_RE.test(s)) return null;
  if (/["'<>\\`\s]/.test(s)) return null;  // кавычки, скобки, слэши, backtick, пробелы — не магнит
  return s;
}

// Валидация detailUrl: только http(s), иначе undefined (CR-01)
function sanitizeDetailUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.toString();
  } catch (e) {
    return undefined;
  }
}

function magnetFromHash(hash, name, trackers) {
  const tr = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
  return sanitizeMagnet(`magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}${tr}`);
}

function parseSize(str) {
  const m = /([\d.,]+)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB|TiB)/i.exec(str || '');
  if (!m) return 0;
  const num = parseFloat(m[1].replace(/,/g, '.'));   // «2,4 GB» → 2.4 (MN-07)
  const unit = m[2].toUpperCase().replace(/IB$/, 'B');
  const mul = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return num * (mul[unit] || 1);
}

function fmtSize(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, '') + ' ' + units[i];
}

function fmtDate(input) {
  if (!input) return '—';
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Декодирование windows-1251 (DLE-сайты: freetp.org, online-fix.me)
async function decodeWin1251(res) {
  const buf = await res.arrayBuffer();
  return new TextDecoder('windows-1251').decode(buf);
}

// Дата в HTML-раздаче PirateBay: «08-20 19:14» (текущий год) либо «11-21 2021»
function tpbDate(str) {
  const m = /^(\d{2})-(\d{2})\s+(\d{4}|\d{2}:\d{2})$/.exec(String(str || '').replace(/&nbsp;/g, ' ').trim());
  if (!m) return String(str || '').trim();
  const year = /^\d{4}$/.test(m[3]) ? m[3] : String(new Date().getFullYear());
  return `${m[2]}.${m[1]}.${year}`;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim();
}

// Умная токенизация: "p.i.t.t" → {project, pitt} + одиночные буквы тоже в наборе
function tokenizeSmart(phrase) {
  const norm = normalizeTitle(phrase);
  const words = norm.split(' ').filter(Boolean);
  const set = new Set(words);
  const combined = [];
  let singles = [];
  for (const w of words) {
    if (w.length === 1) {
      singles.push(w);
    } else {
      if (singles.length) { combined.push(singles.join('')); singles = []; }
      combined.push(w);
    }
  }
  if (singles.length) combined.push(singles.join(''));
  for (const c of combined) set.add(c);
  return { set, combined };
}

function relevanceScore(title, query) {
  const q = tokenizeSmart(query);
  if (!q.combined.length) return 0;
  const t = tokenizeSmart(title);
  let hit = 0;
  for (const c of q.combined) if (t.set.has(c)) hit++;
  let score = (hit / q.combined.length) * 100;
  if (normalizeTitle(title).includes(normalizeTitle(query))) score += 30;
  return score;
}

// Базовое название без версий/качеств/тегов — для группировки версий
function baseTitleKey(title) {
  let t = String(title || '').toLowerCase();
  // после «|» в release-титулах всегда служебная информация («| RePack от Pioneer»,
  // «| Repack by xatab») — иначе isAlienFix/isAlienGame считают релиз чужой игрой
  // («от», имя релиз-группы не входят в списки шума). Сабтайтлы до пайпа
  // («Name: Rogue Core») не затрагиваются — чужие игры по-прежнему отсекаются.
  const pipe = t.indexOf('|');
  if (pipe !== -1) t = t.slice(0, pipe);
  t = t.replace(/(\[[^\]]*\]|\([^)]*\)|\{[^}]*\})/g, ' ');   // [RU], (2026), {мод}
  t = t.replace(/\b(19|20)\d{2}\b/g, ' ');                    // год
  t = t.replace(/\bv\d+(\.\d+)*\b/g, ' ');                    // v0.9.2
  t = t.replace(/[._-]+/g, ' ');                              // пунктуация → пробелы
  t = t.replace(/\b(update\d*|dlc|build\d*|fitgirl|dodi|repack|gog|steam|codex|flt|proper|early\s*access|official|crack|multi\d*|eng|rus|russ|deu|fra|jpn|pc|mac|linux|switcher|switch|complete|full|final|digital|edition|remaster|tenoke|rune|skidrow|plaza|goldberg|hoodlum|empress|kaos|anomaly|tinofix|online-?fix|steam-?fix|unlocked|p2p)\b/g, ' ');
  t = t.replace(/\b\d+\b/g, ' '); // одиночные цифры от версий
  const norm = normalizeTitle(t);
  if (!norm) return normalizeTitle(title);
  // компактируем одно-буквенные серии: "p i t t" → "pitt" (чтобы совпадало с "PITT")
  const words = norm.split(' ').filter(Boolean);
  const out = [];
  let singles = [];
  for (const w of words) {
    if (w.length === 1) {
      singles.push(w);
    } else {
      if (singles.length) { out.push(singles.join('')); singles = []; }
      out.push(w);
    }
  }
  if (singles.length) out.push(singles.join(''));
  return out.join(' ');
}

// Другая игра с похожим названием: после вычищенного базового имени остались
// содержательные слова («Deep Rock Galactic: Rogue Core», «... Survivor»,
// DLC-подзаголовки). Версии/теги/годы baseTitleKey уже срезал, так что хвост
// всегда означает чужой релиз.
function isAlienGame(title, query) {
  const qk = baseTitleKey(query);
  if (!qk) return false;
  const tk = baseTitleKey(title);
  if (tk === qk) return false;            // ровно наша игра
  if (!tk.startsWith(qk)) return false;   // не наш префикс — это fuzzy, отсечёт порог
  return tk.slice(qk.length).trim().length > 0;
}

// Тот же принцип для fix-сайтов: их заголовки легитимно длиннее
// («играть по сети», «скачать», «онлайн»), так что сетевую мишуру хвоста
// глушим отдельно — если после неё остались содержательные слова (Rogue Core),
// это чужая игра.
const FIX_PAGE_NOISE_RE = /^(онлайн|online|по|сети|играть|интернету|интернет|скачать|порт|торрент|фикс|fix|обновлен|обновлено|последней|до|версии|в|и|лан|lan|бесплатно)$/;
function isAlienFix(title, query) {
  const qk = baseTitleKey(query);
  if (!qk) return false;
  const tk = baseTitleKey(title);
  if (tk === qk) return false;
  if (!tk.startsWith(qk)) return false;
  const leftover = tk.slice(qk.length).trim().split(' ')
    .filter(Boolean)
    .filter(w => !FIX_PAGE_NOISE_RE.test(w));
  return leftover.length > 0;
}

function filterRelevant(results, query, minScore = 40) {
  const out = results
    .map(r => ({ r, s: relevanceScore(r.title, query) }))
    .filter(x => x.s >= minScore)
    .filter(x => x.r.kind === 'fix' ? !isAlienFix(x.r.title, query) : !isAlienGame(x.r.title, query))
    .sort((a, b) => b.s - a.s || (b.r.seeders || 0) - (a.r.seeders || 0))
    .map(x => x.r);
  for (const r of out) r.key = baseTitleKey(r.title); // групповой ключ для аккордеона
  return out;
}

// Категории TPB/apibay: 4xx = Games (401 = «Games > PC»). Категория не всегда точна,
// поэтому главный фильтр — релевантность названия (порог 60), а 4xx даёт бонус,
// чтобы настоящие игры шли выше прочих категорий.
function rankPiratebay(results, query) {
  const JUNK_RE = /(1080[pi]|720[pi]|480[pi]|2160[pi]|4k\b|web-?dl|web-?rip|hdtv|dsnp|bluray|remux|x264|x265|xvid|\bepub\b|\bpdf\b|\bmp3\b|\bflac\b|\bs\d{2}e\d{2}\b|pornhub|\.xxx)/i;
  const clean = results.filter(r => {
    if (r.category) {
      if (/^[0-9]/.test(r.category) && !/^4/.test(r.category)) return false;
    }
    return !JUNK_RE.test(r.title);
  });
  const scored = clean
    .map(r => ({ r, s: relevanceScore(r.title, query) + (/^4/.test(r.category) ? 20 : 0) }))
    .filter(x => x.s >= 60)
    .filter(x => x.r.kind === 'fix' || !isAlienGame(x.r.title, query))
    .sort((a, b) => b.s - a.s || (b.r.seeders || 0) - (a.r.seeders || 0))
    .slice(0, 35)
    .map(x => x.r);
  for (const r of scored) r.key = baseTitleKey(r.title); // групповой ключ для аккордеона
  return scored;
}

// ==== КОНТРАКТ ПАРСЕРОВ (MJ-01) ====
// Парсер возвращает { status: 'ok'|'empty'|'unknown', results }.
//   'ok'      — есть результаты;
//   'empty'   — сайт ЧЕСТНО ответил «ничего не найдено» (маркер разметки есть):
//               повторять бессмысленно, runTracker возвращает [] сразу;
//   'unknown' — разметка не распознана / сеть / челлендж: имеет смысл ретрай.
// Обёртка ok() сохраняет старое поведение «просто массив».

function ok(results)      { return { status: 'ok', results: results || [] }; }
function emptyResult()    { return { status: 'empty', results: [] }; }
function unknownResult()  { return { status: 'unknown', results: [] }; }

// ==== ПАРСЕРЫ ТРЕКЕРОВ ====

const TRACKER_PARSERS = {

  // ---- PirateBay: живой классический HTML (party → org), затем apibay JSON ----
  async piratebay(query) {
    try {
      const htmlRes = await this.piratebayHtml(query);
      if (htmlRes.status === 'ok') return htmlRes;
    } catch (e) {
      console.warn('[SteamTorrentFinder] TPB HTML:', e.message);
    }

    const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, 10000);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return emptyResult();
    // apibay при пустом результате отдаёт [{id:"0",name:"No results..."}]
    if (data.length === 1 && data[0].id === '0') return emptyResult();

    const TR = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://exodus.desync.com:6969/announce'
    ];

    const scraped = data
      .filter(t => t.id !== '0')
      .map(t => {
        const sizeB = parseInt(t.size, 10) || 0; // apibay отдаёт байты
        const title = decodeEntities(t.name || '');
        return {
          tracker: 'piratebay',
          title,
          seeders: parseInt(t.seeders, 10) || 0,
          leechers: parseInt(t.leechers, 10) || 0,
          sizeBytes: sizeB,
          sizeRaw: fmtSize(sizeB),
          dateRaw: fmtDate(parseInt(t.added, 10) * 1000),
          category: String(t.category || ''),
          magnet: magnetFromHash(t.info_hash, title, TR),
          detailUrl: sanitizeDetailUrl(`https://piratebay.org/torrent/${t.id}`)
        };
      })
      .filter(r => r.title);

    return ok(rankPiratebay(scraped, query));
  },

  // Классическая HTML-раздача PirateBay: магнит прямо в списке, свежие версии,
  // которые не всегда попадают в apibay. Разметка: таблица #searchResult,
  // строка <tr> содержит <a href="magnet:?xt=urn:btih:...">
  async piratebayHtml(query) {
    // Живые зеркала из registry piratebayproxy.info. Последнее успешное
    // пробуем первым (PF-01: кэш зеркала), остальные — как раньше.
    const mirrors = [
      'https://thepiratebay.party',
      'https://thepiratebay.bond',
      'https://thehiddenbay.com',
      'https://piratebay.live',
      'https://thepiratebay.zone'
    ];
    if (lastGoodTpbMirror) {
      const i = mirrors.indexOf(lastGoodTpbMirror);
      if (i > 0) { mirrors.splice(i, 1); mirrors.unshift(lastGoodTpbMirror); }
    }

    const searchPath = `/search/${encodeURIComponent(query)}/0/99/0`;
    const grabMirror = async (h) => {
      const ctrl = new AbortController();
      mirrorControllers.push(ctrl);
      try {
        const res = await fetchWithTimeout(`${h}${searchPath}`, 7000, { signal: ctrl.signal });
        const html = await res.text();
        if (!html.includes('searchResult')) {
          throw new Error(`${h}: разметка не распознана`);            // unknown → ретрай осмыслен
        }
        if (!html.includes('magnet:?')) {
          return emptyResult();                                       // честное «пусто» (MJ-01)
        }
        return { h, html };
      } finally {
        const i = mirrorControllers.indexOf(ctrl);
        if (i >= 0) mirrorControllers.splice(i, 1);
      }
    };

    let hit = null;
    let emptySeen = null;
    try {
      // Promise.any: побеждает первый осмысленный ответ. Если какой-то
      // трекер честно сказал «пусто», запоминаем — это лучше «все зеркала
      // упали», но приоритет ниже найденных магнитов.
      const attempts = mirrors.map(async h => {
        const r = await grabMirror(h);
        if (r && r.status === 'empty') { emptySeen = r; throw new Error('empty'); }
        return r;
      });
      hit = await Promise.any(attempts);
      abortLoserMirrors();
    } catch (e) {
      abortLoserMirrors();
      if (emptySeen) return emptySeen;          // разметка есть, магнитов нет — пусто
      throw new Error('все зеркала недоступны');
    }
    const host = hit.h;
    const html = hit.html;
    lastGoodTpbMirror = host;

    const results = [];
    const rows = html.split(/<tr[^>]*>/).slice(1);
    const TOR_RE = /href="(?:https?:\/\/[^"]*?)?\/torrent\/(\d+)\/([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
    const CAT_RE = /href="(?:https?:\/\/[^"]*?)?\/browse\/(\d+)"/i;
    const DATE_RE = /<td>(\d{2}-\d{2}(?:&nbsp;|\s+)(?:\d{4}|\d{2}:\d{2}))<\/td>/;
    const SIZE_RE = /<td align="right">([\d.,]+(?:&nbsp;|\s+)(?:B|KB|MB|GB|TB|KiB|MiB|GiB|TiB))<\/td>/i;

    for (const row of rows) {
      const magM = /href="(magnet:\?xt=urn:btih:[^"]+)"/i.exec(row);
      if (!magM) continue;
      const torM = TOR_RE.exec(row);
      if (!torM) continue;
      const title = decodeEntities(torM[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (!title || title.length < 3) continue;

      const catM = CAT_RE.exec(row);
      const dateM = DATE_RE.exec(row);
      const sizeM = SIZE_RE.exec(row);
      const numTds = [...row.matchAll(/<td align="right">(\d+)<\/td>/g)].map(x => +x[1]);

      const sizeStr = sizeM ? sizeM[1].replace(/&nbsp;/g, ' ') : '—';
      results.push({
        tracker: 'piratebay',
        title,
        seeders: numTds[0] || 0,
        leechers: numTds[1] || 0,
        sizeBytes: parseSize(sizeStr),
        sizeRaw: sizeStr,
        dateRaw: dateM ? tpbDate(dateM[1]) : '—',
        category: catM ? catM[1] : '',
        magnet: sanitizeMagnet(decodeEntities(magM[1])),
        detailUrl: sanitizeDetailUrl(`${host}/torrent/${torM[1]}`)
      });
    }
    return ok(rankPiratebay(results, query));
  },

  // ---- FreeTP.org (DLE, windows-1251): игра с патчем для игры по сети ----
  async freetp(query) {
    const url = `https://freetp.org/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, 15000);
    const html = await decodeWin1251(res);
    // Маркер пустой выдачи DLE: строка «по вашему запросу ничего не найдено»
    if (/по вашему запросу.*не найдено|nothing found/i.test(html) && !html.includes('<div class="heading">')) {
      return emptyResult();
    }
    if (!html.includes('<div class="heading">')) return unknownResult();  // челлендж/заглушка
    const results = [];
    const re = /<div class="heading">[^<]*<a href="(https?:\/\/freetp\.org\/[^"]+)"[^>]*>([\s\S]*?)<\/a><\/div>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const title = decodeEntities(m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (!title || title.length < 3) continue;
      results.push({
        tracker: 'freetp',
        title,
        seeders: null,
        leechers: null,
        sizeBytes: 0,
        sizeRaw: '—',
        dateRaw: '—',
        magnet: null,
        kind: 'fix',
        detailUrl: sanitizeDetailUrl(m[1])
      });
    }
    const ranked = filterRelevant(results, query, 80).slice(0, 10);
    // Версию / дату изменения / размер дообогащаем со страниц релиза (топ-5, не грузим всё)
    await Promise.all(ranked.slice(0, 5).map(freetpEnrich));
    return ok(ranked);
  },

  // ---- Online-fix.me (DLE, windows-1251): релизы с онлайн-фиксом ----
  async onlinefix(query) {
    const url = `https://online-fix.me/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, 15000);
    const html = await decodeWin1251(res);
    if (/по вашему запросу.*не найдено|nothing found/i.test(html) && !html.includes('<div class="article clr">')) {
      return emptyResult();
    }
    if (!html.includes('<div class="article clr">')) return unknownResult();
    const results = [];
    const blocks = html.split(/<div class="article clr">/).slice(1);
    for (const b of blocks) {
      const titleM = /<h2 class="title">([\s\S]*?)<\/h2>/.exec(b);
      if (!titleM) continue;
      const title = decodeEntities(titleM[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (!title) continue;
      const bigM = /<a class="big-link" href="([^"]+)"/.exec(b);
      const timeM = /<time datetime="([^"]+)"/.exec(b);
      const editM = /<div class="edit">([\s\S]*?)<\/div>/.exec(b);
      const desc = editM
        ? decodeEntities(editM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        : '—';
      results.push({
        tracker: 'onlinefix',
        title,
        seeders: null,
        leechers: null,
        sizeBytes: 0,
        sizeRaw: desc,
        dateRaw: timeM ? fmtDate(timeM[1]) : '—',
        magnet: null,
        kind: 'fix',
        detailUrl: sanitizeDetailUrl(bigM ? bigM[1] : undefined)
      });
    }
    return ok(filterRelevant(results, query, 80).slice(0, 10));
  },

  // ---- 1337x (HTML-скрейпинг по строкам таблицы) ----
  async x1337(query) {
    // Сначала ищем в категории Games; при пустом — общий поиск.
    // Зеркала: 1337x.la основной, 1337x.to резервный
    const hosts = ['1337x.la', '1337x.to'];
    let html = null, lastErr = null, hostUsed = hosts[0];
    for (const host of hosts) {
      const urls = [
        `https://${host}/category-search/${encodeURIComponent(query)}/Games/1/`,
        `https://${host}/search/${encodeURIComponent(query)}/1/`
      ];
      for (const u of urls) {
        try {
          const res = await fetchWithTimeout(u, 12000);
          html = await res.text();
          if (html && html.includes('coll-1')) { hostUsed = host; break; }
        } catch (e) { lastErr = e; }
      }
      if (html && html.includes('coll-1')) break;
    }
    if (html === null) throw lastErr || new Error('нет ответа');
    const rows = html.split(/<tr[^>]*>/).slice(1);
    const results = [];

    for (const row of rows) {
      const linkM = /<a href="(\/torrent\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
      if (!linkM) continue;
      let title = linkM[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      title = decodeEntities(title);
      if (!title || title.length < 4 || /^\W+$/.test(title)) continue;

      const seedsM = /coll-2 seeds[^>]*>\s*([\d,]+)\s*</.exec(row);
      const leechM = /coll-3 leeches[^>]*>\s*([\d,]+)\s*</.exec(row);
      const sizeM = /coll-4[^>]*>\s*([\d.,]+\s*(?:B|KB|MB|GB|TB))\s*</i.exec(row);
      // дата: на .la это coll-date («May. 13th '19»), на .to — coll-5
      const dateM = /class="coll-date"[^>]*>\s*([^<]+?)\s*</.exec(row) || /coll-5[^>]*>\s*([^<]+?)\s*</.exec(row);

      const sizeStr = sizeM ? sizeM[1].replace(/&nbsp;/g, ' ') : '—';
      results.push({
        tracker: 'x1337',
        title,
        seeders: seedsM ? parseInt(seedsM[1].replace(/,/g, ''), 10) || 0 : 0,
        leechers: leechM ? parseInt(leechM[1].replace(/,/g, ''), 10) || 0 : 0,
        sizeBytes: parseSize(sizeStr),
        sizeRaw: sizeStr,
        dateRaw: dateM ? fmt1337Date(decodeEntities(dateM[1]).trim()) : '—',
        magnet: null,          // магнит добираем со страницы торрента (x1337Enrich)
        needsPage: true,
        detailUrl: sanitizeDetailUrl(`https://${hostUsed}${linkM[1]}`)
      });
    }
    // Магнит + точная дата аплоада со страницы торрента (top 5, параллельно)
    const ranked = filterRelevant(results, query, 70).slice(0, 20);
    if (!ranked.length) return emptyResult();   // разметка есть, релевантности нет — честное пусто
    await Promise.all(ranked.slice(0, 5).map(x1337Enrich));
    return ok(ranked);
  },

  // ---- Rutracker (HTML-скрейпинг; работает только если юзер залогинен в браузере —
  // fetch с credentials берёт его cookies, иначе сайт либо CF-проверка, либо страница входа) ----
  async rutracker(query) {
    const url = `https://rutracker.org/forum/tracker.php?nm=${encodeURIComponent(query)}`;
    try {
      const res = await fetchWithTimeout(url, 10000, { credentials: 'include' });
      const html = await res.text();
      // CF-челлендж «Just a moment...» для незнакомых/гостевых запросов
      if (/just a moment/i.test(html)) throw new Error('Cloudflare-проверка');
      // Гость: поиск缩影 «Вход» — без аккаунта раздел недоступен
      if (html.includes('tlogin') || /ограничен|войдите|log-in|Активные задачи/i.test(html) && !html.includes('torTopic')) {
        throw new Error('нужен вход на rutracker.org в браузере');
      }
      if (!html.includes('torTopic')) return emptyResult();

      const results = [];
      const topicRe = /<a[^>]*class="torTopic[^"]*"[^>]*href="(?:https?:\/\/[^"]*)?\/forum\/viewtopic\.php\?t=?(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = topicRe.exec(html)) !== null) {
        const title = decodeEntities(m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
        if (!title) continue;
        results.push({
          tracker: 'rutracker',
          title,
          seeders: 0,
          leechers: 0,
          sizeBytes: 0,
          sizeRaw: '—',
          dateRaw: '—',
          magnet: null,
          needsPage: true,
          detailUrl: sanitizeDetailUrl(`https://rutracker.org/forum/viewtopic.php?t=${m[1]}`)
        });
      }
      const ranked = filterRelevant(results, query, 55).slice(0, 15);
      if (!ranked.length) return emptyResult();
      return ok(ranked);
    } catch (e) {
      // CF-челлендж/логин/HTTP 403: скрейп из service worker бессилен —
      // JS-проверка Cloudflare в воркере не исполняется. Но обычная навигация
      // в браузерной вкладке CF проходит, поэтому отдаём псевдо-результат
      // со ссылкой на страницу поиска: юзер кликает и ищет уже на сайте.
      // Раньше это был kind:'fix' и псевдо-результат рендерился fix-карточкой
      // (MN-06): теперь обычная строка, рендерится как versionRow «Открыть».
      const lang = (await chrome.storage.sync.get({ language: 'ru' })).language;
      return ok([{
        tracker: 'rutracker',
        title: lang === 'en'
          ? `Open "${query}" search on Rutracker`
          : `Открыть поиск «${query}» на Rutracker`,
        seeders: null,
        leechers: null,
        sizeBytes: 0,
        sizeRaw: 'в новой вкладке',
        dateRaw: '—',
        magnet: null,
        detailUrl: sanitizeDetailUrl(url)
      }]);
    }
  }
};

// ==== ПОТОКОВЫЙ ПОИСК (порт из content script) ====

// «May. 13th '19» / «May. 13th '19» | «May. 13th» (текущий год) → 13.05.2019
const MONTHS_1337 = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function fmt1337Date(s) {
  const m = /^([A-Z][a-z]{2})\.\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s*'(\d\d))?$/.exec(s.replace(/\u00a0/g, ' ').trim());
  if (!m) return s;
  const mo = MONTHS_1337[m[1]];
  if (!mo) return s;
  const now = new Date();
  let year = m[3] !== undefined ? 2000 + parseInt(m[3], 10) : now.getFullYear();
  if (m[3] === undefined) {
    const t = new Date(year, mo - 1, m[2]);
    if (t - now > 2 * 24 * 3600 * 1000) year -= 1; // «May. 13th» без года = прошлый год, если дата ещё не настала
  }
  return `${String(m[2]).padStart(2, '0')}.${String(mo).padStart(2, '0')}.${year}`;
}

// ==== Унифицированное дообогащение (MJ-06) ====
// Общая загрузка страницы релиза (с опциональной windows-1251) и
// декларативные экстракторы вместо трёх почти одинаковых функций.

async function fetchPage(url, { enc1251 = false, timeoutMs = 12000 } = {}) {
  const res = await fetchWithTimeout(url, timeoutMs);
  return enc1251 ? decodeWin1251(res) : res.text();
}

// Дообогащение релиза 1337x со страницы торрента:
// полный магнит (кнопка загрузки вместо «Открыть»), дата аплоада
async function x1337Enrich(r) {
  if (!r.detailUrl || r.magnet) return;
  try {
    const html = await fetchPage(r.detailUrl);
    const magM = /href="(magnet:\?xt=urn:btih:[^"]+)"/.exec(html);
    if (magM) {
      r.magnet = sanitizeMagnet(decodeEntities(magM[1])) || undefined;
      if (r.magnet) r.needsPage = false;
    }
    const upM = /<strong>Date uploaded<\/strong>\s*<span>([^<]+)<\/span>/.exec(html);
    if (upM && upM[1]) {
      const fmted = fmt1337Date(decodeEntities(upM[1]).trim());
      if (fmted) r.dateRaw = fmted;
    }
  } catch (e) {
    /* страница не открылась — остаётся ссылка «детали ↗» */
  }
}

// Дообогащение релиза FreeTP со страницы релиза:
// версия из имени торрент-файла, дата «Изменена», размер
async function freetpEnrich(r) {
  try {
    const html = await fetchPage(r.detailUrl, { enc1251: true });

    // «Изменена: 5-09-2026, 08:10» -> 05.09.2026 08:10
    const updM = /<b>Изменена:<\/b>\s*(\d{1,2})-(\d{1,2})-(\d{4})[\s,]*(\d{2}:\d{2})?/.exec(html);
    if (updM) {
      const [, d, mo, y, hm] = updM;
      r.dateRaw = `${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}.${y}${hm ? ' ' + hm : ''}`;
    }

    // «Скачать How to Fish v1.0.12 Portable.torrent» -> «v1.0.12 Portable»
    let ver = null;
    const verM = /Скачать\s+[^<]*?\s(v?\d+\.\d+(?:\.\d+)*[^<]*?)\.torrent/i.exec(html);
    if (verM) ver = decodeEntities(verM[1].replace(/&nbsp;/g, ' ').trim());
    else {
      const rawM = /Скачать\s+([^<]{4,90}?)\.torrent/i.exec(html);
      if (rawM) ver = decodeEntities(rawM[1].replace(/&nbsp;/g, ' ').trim());
    }

    // «[0.6 GB] + Встроен Онлайн фикс» -> «0.6 GB»
    const sizeM = /\[(\d[\d.,]*\s*(?:KB|MB|GB|TB))\]/i.exec(html);
    r.sizeRaw = [ver, sizeM && sizeM[1]].filter(Boolean).join(' · ') || '—';
  } catch (e) {
    /* сеть подвела — оставляем «—» как было */
  }
}

// ==== Генерик-парсер кастомных трекеров ====
// Пользователь даёт шаблон поиска (например
// https://online-fix.top/index.php?do=search&subaction=search&story={q}),
// мы тянем страницу, тащим все same-site ссылки с текстом, чистим
// релевантностью. grabMagnet — вторым заходом дёргаем страницы релизов
// и выдираем магнит, если он там есть.
function customParser(conf) {
  return async (query) => {
    const su = String(conf.searchUrl || '');
    if (!su.includes('{q}')) throw new Error('шаблон поиска без {q}');
    const url = su.replace('{q}', encodeURIComponent(query));
    const res = await fetchWithTimeout(url, 15000);
    const html = conf.enc1251 ? await decodeWin1251(res) : await res.text();
    if (!html) throw new Error('пустой ответ');

    let origin = '';
    try { origin = new URL(url).origin; } catch (e) { /* origin не решает */ }

    const results = [];
    const seen = new Set();
    // MJ-05: относительные ссылки тоже валидны — резолвим от базового URL,
    // сравнение same-origin строго по .origin (не startsWith — против
    // «https://evil.com/?https://freetp.org/» трюка).
    const re = /<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const rawHref = decodeEntities(m[1]);
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (!text || text.length < 4) continue;

      // Прямой магнит в списке — тоже результат
      const mag = sanitizeMagnet(rawHref.startsWith('magnet:') ? rawHref : null);

      let resolved = null;
      try {
        const u = new URL(rawHref, url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') resolved = null;
        else if (origin && u.origin !== origin) resolved = null;
        else resolved = u;
      } catch (e) { resolved = null; }

      if (mag) {
        const dedupeKey = 'magnet:' + mag;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        results.push({
          tracker: null,
          title: text,
          seeders: null, leechers: null,
          sizeBytes: 0,
          sizeRaw: '—',
          dateRaw: '—',
          magnet: mag,
          detailUrl: undefined
        });
        continue;
      }
      if (!resolved) continue;
      const du = resolved.toString();
      if (seen.has(du)) continue;
      seen.add(du);
      results.push({
        tracker: null,
        title: text,
        seeders: null, leechers: null,
        sizeBytes: 0,
        sizeRaw: '—',
        dateRaw: '—',
        magnet: null,
        kind: 'fix',
        detailUrl: du
      });
    }

    const ranked = filterRelevant(results, query, 65).slice(0, 10);
    if (!ranked.length) {
      // html был, но распознаваемых ссылок нет: страница-заглушка → unknown (ретрай осмыслен)
      return unknownResult();
    }

    if (conf.grabMagnet) {
      await Promise.all(ranked.slice(0, 5).map(async r => {
        try {
          const dhtml = await fetchPage(r.detailUrl, { enc1251: !!conf.enc1251 });
          const mag = /href="(magnet:\?xt=urn:btih:[^"]+)"/i.exec(dhtml);
          if (mag) {
            const sm = sanitizeMagnet(decodeEntities(mag[1]));
            if (sm) {
              r.magnet = sm;
              r.kind = undefined;   // обычный трекер: кнопка «Магнит»
            }
          }
        } catch (e) { /* страница не далась — остаётся «Открыть» */ }
      }));
    }
    return ok(ranked);
  };
}

// ==== Кэш зеркал TPB (PF-01) ====
let lastGoodTpbMirror = null;
const mirrorControllers = [];   // AbortController всех в полёте зеркал

// Победитель определён — остальным ~1 с на доиграть и обрываем (PF-01)
function abortLoserMirrors() {
  setTimeout(() => {
    while (mirrorControllers.length) {
      try { mirrorControllers.pop().abort(); } catch (e) { /* уже прерван */ }
    }
    mirrorControllers.length = 0;
  }, 1000);
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'searchPort') return;

  port.onMessage.addListener(async msg => {
    if (!msg || msg.type !== 'search' || !msg.gameName) return;

    const gname = String(msg.gameName).trim();
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const trackerConfig = settings.trackers || DEFAULT_SETTINGS.trackers;

    // Встроенные парсеры + кастомные трекеры (conf.custom, поиск по шаблону)
    const enabled = Object.entries(trackerConfig)
      .filter(([key, conf]) => conf.enabled && (conf.custom || TRACKER_PARSERS[key]))
      .map(([key, conf]) => [key, conf]);

    // Отправка на закрытый клиентом порт не должна ронять остальные трекеры;
    // ошибка логируется (MN-04), а не глотается молча.
    const safePost = (m) => {
      try { port.postMessage(m); } catch (e) {
        console.warn('[SteamTorrentFinder] safePost:', e && e.message);
      }
    };

    port.postMessage({ type: 'started', total: enabled.length });

    // Запускаем параллельно; каждый результат шлём сразу.
    // Fix-сайты капризны: первый заход часто упирается в челлендж и отдаёт
    // пустую страницу (или вообще сеть рвёт). Пробуем до 3 раз с паузой.
    // Контракт MJ-01: 'empty' → отдаём [] сразу (повторы бессмысленны),
    // 'unknown'/исключение → ретрай. onAttempt — для UX-03 (номер попытки в UI).
    const runTracker = async (key, conf, onAttempt) => {
      const parse = () => conf.custom ? customParser(conf)(gname) : TRACKER_PARSERS[key](gname);
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (onAttempt) onAttempt(attempt);
        try {
          const parsed = await parse();
          if (!parsed || parsed.status === 'ok') {
            const results = parsed ? parsed.results : [];
            if (results && results.length) return results;
            continue;   // 'ok' c пустым массивом — трактуем как unknown
          }
          if (parsed.status === 'empty') return [];      // честное пусто — сразу
          // 'unknown' → ретрай
        } catch (e) {
          lastErr = e;
        }
        if (attempt < 3) await new Promise(res => setTimeout(res, 2500));
      }
      if (lastErr) throw lastErr;   // три сетевых фейла — покажем «не отвечает»
      return [];                    // три честных пустых / нераспознанных — «0 найдено»
    };

    const attemptCounters = {};
    try {
      await Promise.all(enabled.map(async ([key, conf]) => {
        attemptCounters[key] = 0;
        try {
          const results = await runTracker(key, conf, (n) => { attemptCounters[key] = n; });
          safePost({ type: 'trackerResult', tracker: key, results, error: null, attempt: attemptCounters[key] });
        } catch (e) {
          console.warn(`[SteamTorrentFinder] ${key}:`, e.message);
          safePost({ type: 'trackerResult', tracker: key, results: [], error: e.message, attempt: attemptCounters[key] });
        }
      }));
    } finally {
      // 'done' обязан уйти даже при сбое — иначе клиент зависнет навсегда
      safePost({ type: 'done' });
    }
  });
});

// ==== UX-04: проверка кастомного трекера из попапа ====
// Попап не держит порт — отвечает через runtime message. Одна пробная
// загрузка по шаблону, без ретраев, cookies не нужны.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'testCustom') return;   // не наш — не respond, не блокируем канал
  (async () => {
    try {
      const conf = msg.conf || {};
      const parsed = await customParser({ ...conf, grabMagnet: false })('test');
      sendResponse({
        type: 'testCustomResult', id: msg.id,
        ok: parsed.status === 'ok', count: parsed.results.length,
        titles: parsed.results.slice(0, 3).map(r => r.title)
      });
    } catch (e) {
      sendResponse({ type: 'testCustomResult', id: msg.id, ok: false, count: 0, titles: [], error: e && e.message });
    }
  })();
  return true;   // канал остаётся открыт для async sendResponse
});

// При установке — настройки по умолчанию
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!existing.trackers) {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
});
