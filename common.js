// ============================================================
// Steam Torrent Finder — общий источник констант (MJ-04)
// Подключается: background.js (importScripts), popup.html (<script>),
// content.js (manifest content_scripts js: [...]).
// Обычный скрипт, без export/import: переменные попадают в
// глобальную область (window / self / service worker global).
// ============================================================

(function (global) {
  'use strict';

  // Метаданные встроенных трекеров: имя, цвет, вкладка по умолчанию
  const BUILTIN_META = {
    piratebay: { name: 'PirateBay', color: '#e91e63', group: 'regular' },
    x1337: { name: '1337x', color: '#4caf50', group: 'regular' },
    rutracker: { name: 'Rutracker', color: '#ff9800', group: 'regular' },
    freetp: { name: 'FreeTP', color: '#9c27b0', group: 'fix' },
    onlinefix: { name: 'Online-Fix', color: '#00bcd4', group: 'fix' }
  };

  // Папки по умолчанию (вкладки панели поиска)
  const DEFAULT_GROUPS = [
    { id: 'regular', title: { ru: 'Обычные трекеры', en: 'Regular trackers' }, tab: 'regular' },
    { id: 'fix', title: { ru: 'Онлайн-фиксы', en: 'Online fixes' }, tab: 'fix' }
  ];

  // Дефолтные настройки трекеров для chrome.storage.sync (enabled + метаданные)
  const DEFAULT_TRACKERS_DEFAULTS = {
    piratebay: { enabled: true },
    x1337: { enabled: true },
    rutracker: { enabled: false },
    freetp: { enabled: true },
    onlinefix: { enabled: true }
  };

  // Цвета для fallback-рендера, когда конфиг трекера не пришёл
  const TRACKER_COLORS = BUILTIN_META;

  // Хосты, которым реально нужны cookies (логин-гейты): CR-02.
  // Все остальные запросы идут с credentials: 'omit'.
  const CREDENTIAL_HOSTS = new Set(['rutracker.org', 'freetp.org', 'online-fix.me']);

  // Популярные сайты с «неудобным» поиском: пользователь вставляет ЛЮБУЮ
  // ссылку такого сайта, а мы подставляем проверенный шаблон поиска.
  // hostname матчится строго: (^|\.)host$ — поддомены-обман (host.evil.com)
  // не проходят. Форматы проверены живыми запросами.
  const KNOWN_SEARCH_TEMPLATES = [
    { host: 'rutor.info', tmpl: 'https://rutor.info/search/torrent/0/0/0/{q}' },
    { host: 'byxatab.com', tmpl: 'https://byxatab.com/?do=search&subaction=search&story={q}' },
    { host: 'thelastgame.ru', tmpl: 'https://thelastgame.ru/?s={q}' },
    { host: 'small-games.info', tmpl: 'https://small-games.info/?go=search&search_text={q}' }
  ];

  // Подобрать проверенный шаблон поиска по hostname вставленной ссылки
  function knownSearchTemplate(urlStr) {
    try {
      const h = new URL(urlStr).hostname;
      for (const { host, tmpl } of KNOWN_SEARCH_TEMPLATES) {
        const re = new RegExp('(^|\\.)' + host.replace(/\./g, '\\.') + '$', 'i');
        if (re.test(h)) return tmpl;
      }
    } catch (e) { /* не URL — нет шаблона */ }
    return null;
  }

  // Глубокие копии — каждый контекст получает свою, чтобы не мутировать общие
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const api = {
    BUILTIN_META,
    DEFAULT_GROUPS,
    DEFAULT_TRACKERS_DEFAULTS,
    TRACKER_COLORS,
    CREDENTIAL_HOSTS,
    KNOWN_SEARCH_TEMPLATES,
    knownSearchTemplate,
    defaultSettings: function () {
      const trackers = {};
      for (const [key, meta] of Object.entries(BUILTIN_META)) {
        trackers[key] = Object.assign({ enabled: DEFAULT_TRACKERS_DEFAULTS[key].enabled }, meta);
      }
      return { trackers, groups: clone(DEFAULT_GROUPS) };
    },
    // Нужны ли этому URL cookies (exact-match по hostname, CR-02)
    needsCredentials: function (urlStr) {
      try {
        return CREDENTIAL_HOSTS.has(new URL(urlStr).hostname);
      } catch (e) {
        return false;
      }
    }
  };

  global.STF_COMMON = api;
})(typeof self !== 'undefined' ? self : this);
