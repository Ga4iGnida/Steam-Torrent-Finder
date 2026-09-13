// ============================================================
// Steam Torrent Finder — content script
// Кнопка рядом с названием игры + модалка с потоковыми
// результатами (каждый трекер появляется по мере ответа)
// ============================================================

(() => {
  'use strict';

  // Константы из common.js (MJ-04): подключён перед content.js в manifest
  const TRACKER_COLORS = (window.STF_COMMON && window.STF_COMMON.TRACKER_COLORS) || {};
  const DEFAULT_GROUPS_UI = (window.STF_COMMON && window.STF_COMMON.DEFAULT_GROUPS) || [
    { id: 'regular', title: { ru: 'Обычные трекеры', en: 'Regular trackers' }, tab: 'regular' },
    { id: 'fix', title: { ru: 'Онлайн-фиксы', en: 'Online fixes' }, tab: 'fix' }
  ];

  let searchTimer = null;
  let cachedGameName = null;   // название, взятое ДО вставки кнопки
  let searchPort = null;
  let expectedTotal = 0;
  let searchEpoch = 0;         // токен поколения поиска (защита от гонок)
  let watchdogTimer = null;    // сторожевой таймер бездействия (MJ-02)
  let maxTotalTimer = null;    // абсолютный потолок поиска (MJ-02)
  let stallTimer = null;       // страховка от неответившего background
  const openGroups = new Set(); // развёрнутые группы аккордеона
  // Сколько попыток сделал трекер на текущий момент (UX-03: показ в статусе)
  const trackerAttempts = new Map();

  // Абсолютный потолок всего поиска (MJ-02): активность сбрасывает
  // бездействие-watchdog, но не этот таймер.
  const MAX_TOTAL_TIMEOUT = 120000;
  // Пауза бездействия: ни 'started', ни 'trackerResult' за это время — timeout
  const WATCHDOG_IDLE = 40000;

  // ==== Локализация (язык переключается в попапе) ====
  let uiLang = 'ru';

  const I18N_UI = {
    ru: {
      searchBtn: 'Искать торренты',
      searchingBtn: 'Ищем…',
      btnTitle: 'Найти эту игру на торрент-трекерах',
      noGameName: 'Не удалось определить название игры',
      panelTitle: 'Торренты',
      closeTitle: 'Закрыть (Esc)',
      searchingFor: (name) => `Ищем «${name}» на трекерах…`,
      polled: (n, total, name) => `Опрошено: ${n} из ${total} · «${name}»`,
      closeStopsHint: 'Закрытие панели остановит поиск',
      stalled: '<b>Расширение не запустило поиск.</b> Перезагрузите страницу Steam и попробуйте ещё раз.',
      timeout: 'Поиск занял слишком много времени и был остановлен. Проверьте интернет / VPN и попробуйте ещё раз.',
      portLost: 'Порт поиска оборвался (возможно, расширение перезагрузили). Обновите страницу и попробуйте снова.',
      finished: (n) => `Поиск завершён. Всего: ${n}`,
      foundCount: (n) => `${n} найдено`,
      nothingFound: 'Ничего не найдено.',
      nothingFoundHint: 'Проверьте интернет / VPN. Включите больше трекеров в настройках расширения (иконка панели Chrome).',
      noTrackersOnTab: 'На этой вкладке нет трекеров.',
      tabBreakdown: 'Трекеры по вкладкам: ',
      whoFailed: 'Не ответили:',
      notResponding: (err) => `не отвечает (${err})`,
      attemptNote: (n) => `попытка ${n}`,
      noResults: 'ничего не найдено',
      variants: (n) => plural(n, ['разновидность', 'разновидности', 'разновидностей']),
      versions: (n) => plural(n, ['версия', 'версии', 'версий']),
      moreVersions: (n) => `… ещё ${n} ${plural(n, ['версия', 'версии', 'версий'])} (не показаны)`,
      colName: 'Название', colSeeds: 'Сиды', colSize: 'Размер', colDate: 'Дата', colAction: 'Действие',
      details: 'детали ↗',
      magnet: 'Магнит',
      open: 'Открыть',
      tooltipMagnet: 'Добавить в торрент-клиент',
      tooltipOpenFix: 'Открыть страницу релиза (взять онлайн-фикс)',
      tooltipOpenPage: 'Открыть страницу торрента (взять магнит)'
    },
    en: {
      searchBtn: 'Search torrents',
      searchingBtn: 'Searching…',
      btnTitle: 'Find this game on torrent trackers',
      noGameName: 'Could not detect the game name',
      panelTitle: 'Torrents',
      closeTitle: 'Close (Esc)',
      searchingFor: (name) => `Searching for "${name}" on trackers…`,
      polled: (n, total, name) => `Polled: ${n} of ${total} · "${name}"`,
      closeStopsHint: 'Closing the panel stops the search',
      stalled: '<b>The extension did not start the search.</b> Reload the Steam page and try again.',
      timeout: 'The search took too long and was stopped. Check your internet / VPN and try again.',
      portLost: 'The search connection dropped (maybe the extension reloaded). Refresh the page and try again.',
      finished: (n) => `Search finished. Total: ${n}`,
      foundCount: (n) => `${n} found`,
      nothingFound: 'Nothing found.',
      nothingFoundHint: 'Check internet / VPN. Enable more trackers in the extension settings (Chrome toolbar icon).',
      noTrackersOnTab: 'No trackers on this tab.',
      tabBreakdown: 'Trackers per tab: ',
      whoFailed: 'Did not respond:',
      notResponding: (err) => `not responding (${err})`,
      attemptNote: (n) => `attempt ${n}`,
      noResults: 'nothing found',
      variants: (n) => n === 1 ? 'variant' : 'variants',
      versions: (n) => n === 1 ? 'version' : 'versions',
      moreVersions: (n) => `… ${n} more (not shown)`,
      colName: 'Name', colSeeds: 'Seeders', colSize: 'Size', colDate: 'Date', colAction: 'Action',
      details: 'details ↗',
      magnet: 'Magnet',
      open: 'Open',
      tooltipMagnet: 'Add to torrent client',
      tooltipOpenFix: 'Open release page (get the online fix)',
      tooltipOpenPage: 'Open torrent page (get the magnet)'
    }
  };

  function t(key) { return I18N_UI[uiLang][key]; }

  function loadLang() {
    if (loadLang.done) return;
    loadLang.done = true;
    try {
      chrome.storage.sync.get({ language: 'ru' }, stored => {
        uiLang = stored.language === 'en' ? 'en' : 'ru';
        refreshStaticTexts();
      });
      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'sync' || !changes.language) return;
          uiLang = changes.language.newValue === 'en' ? 'en' : 'ru';
          refreshStaticTexts();
        });
      }
    } catch (e) { /* вкладка вне контекста расширения */ }
  }

  // Обновить уже созданные надписи (кнопка, вкладки) при смене языка
  function refreshStaticTexts() {
    const btn = document.getElementById('stf-search-btn');
    if (btn && !btn.classList.contains('stf-loading-btn')) {
      const label = btn.querySelector('.stf-btn-label');
      if (label) label.textContent = t('searchBtn');
      btn.title = t('btnTitle');
    }
    // Подписи вкладок панели (вкладка = папка)
    document.querySelectorAll('#stf-tabs .stf-tab').forEach(b => {
      const x = tabsList.find(x => x.id === b.dataset.tab);
      if (x) b.textContent = x.label;
    });
    const title = document.querySelector('.stf-title');
    if (title) title.textContent = t('panelTitle');
    const close = document.getElementById('stf-close');
    if (close) close.title = t('closeTitle');
    const hint = document.getElementById('stf-close-hint');
    if (hint) hint.textContent = t('closeStopsHint');
  }

  // ==== Название игры ====
  function cleanGameName(raw) {
    return String(raw || '')
      .replace(/🔍\s*Искать торренты/g, '')       // остатки кнопки
      .replace(/Искать торренты/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getGameName() {
    if (cachedGameName) return cachedGameName;

    const h1 = document.querySelector('#appHubAppName, .apphub_AppName');
    if (h1) {
      cachedGameName = cleanGameName(h1.textContent);
      if (cachedGameName) return cachedGameName;
    }

    const title = document.title.replace(/ on Steam$/i, '').replace(/ in Steam$/i, '').trim();
    if (title && !/^steam$/i.test(title)) {
      cachedGameName = cleanGameName(title);
      if (cachedGameName) return cachedGameName;
    }

    const m = window.location.pathname.match(/\/app\/\d+\/([^/]+)/);
    if (m) {
      cachedGameName = cleanGameName(decodeURIComponent(m[1].replace(/_/g, ' ')));
      return cachedGameName;
    }
    return null;
  }

  // ==== Кнопка ====
  function createButton() {
    if (document.getElementById('stf-search-btn')) return;

    const appNameEl = document.querySelector('#appHubAppName, .apphub_AppName');
    if (!appNameEl) return;   // без бесконечного setTimeout: за повторами
    // следит MutationObserver + ограниченный init (MN-03)

    // ВАЖНО: кэшируем название ДО вставки кнопки внутрь h1
    cachedGameName = cleanGameName(appNameEl.textContent) || cachedGameName;

    const btn = document.createElement('button');
    btn.id = 'stf-search-btn';
    btn.type = 'button';
    btn.innerHTML = `<span class="stf-btn-label">${escapeHtml(t('searchBtn'))}</span>`;
    btn.title = t('btnTitle');
    btn.addEventListener('click', () => {
      const name = getGameName();
      if (!name) {
        openModal();
        setModalHtml(`<div class="stf-error">${escapeHtml(t('noGameName'))}</div>`);
        return;
      }
      searchOnTrackers(name);
    });

    appNameEl.appendChild(btn);
  }

  // ==== Поиск (потоковый, через порт) ====

  // Полная остановка текущего поиска: порт + таймеры + кнопка.
  // Каждый вызов инкрементит эпоху — обработчики старых портов
  // после этого молча выходят (не трогают DOM нового поиска).
  function stopSearch() {
    searchEpoch++;
    clearSearchTimers();
    if (searchPort) {
      try { searchPort.disconnect(); } catch (e) {}
      searchPort = null;
    }
    setButtonLoading(false);
  }

  function clearSearchTimers() {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
    if (maxTotalTimer) { clearTimeout(maxTotalTimer); maxTotalTimer = null; }
  }

  // MJ-02: бездействие-watchdog сбрасывается на каждую активность
  // ('started' / 'trackerResult'); maxTotalTimer не сбрасывается никогда.
  function resetIdleWatchdog(epoch, onTimeout) {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      if (epoch !== searchEpoch) return;
      onTimeout();
    }, WATCHDOG_IDLE);
  }

  function searchOnTrackers(gameName) {
    // Если расширение только что перезагружали, старый контент-скрипт orphan:
    // chrome.runtime выкинут — не майнить консоль, а честно сказать юзеру
    if (!chrome.runtime || !chrome.runtime.connect) {
      setButtonLoading(false);
      openModal();
      setModalHtml('<div class="stf-empty">🧟 Расширение обновилось. Перезагрузите страницу (F5) и попробуйте снова.</div>');
      return;
    }
    // гасим предыдущий поиск, если он ещё шёл, и берём свежую эпоху
    stopSearch();
    const epoch = ++searchEpoch;
    trackerAttempts.clear();

    setButtonLoading(true);
    openModal();
    setModalHtml(`
      <div class="stf-status" id="stf-status">
        <span class="stf-spinner-mini"></span> ${t('searchingFor')(escapeHtml(gameName))}
      </div>
      <div class="stf-close-hint" id="stf-close-hint">${escapeHtml(t('closeStopsHint'))}</div>
      <div class="stf-tabs" id="stf-tabs">
        ${tabsList.map((x, i) => `<button type="button" class="stf-tab${i === 0 ? ' stf-tab-active' : ''}" data-tab="${escapeHtml(x.id)}">${escapeHtml(x.label)}</button>`).join('')}
      </div>
      <div class="stf-groups" id="stf-groups"></div>
    `);
    activeTab = tabsList[0].id;
    bindTabs();

    let done = false;
    const state = new Map(); // tracker -> {results, error}
    expectedTotal = 0;

    const onIdleTimeout = () => {
      finalize(gameName, state, true, `⏱️ ${t('timeout')}`);
      stopSearch();
    };

    // Страховка: если background вообще не прислал 'started' за 12 с —
    // расширение сломано/не перезагружено. Не даём висеть «Ищем…» вечно.
    stallTimer = setTimeout(() => {
      if (epoch !== searchEpoch) return;
      const statusEl = document.getElementById('stf-status');
      if (statusEl) {
        statusEl.innerHTML = `⚠️ ${t('stalled')}`;
      }
      stopSearch();
    }, 12000);

    // MJ-02: бездействие-watchdog (сбрасывается активностью) + абсолютный потолок
    resetIdleWatchdog(epoch, onIdleTimeout);
    maxTotalTimer = setTimeout(() => {
      if (epoch !== searchEpoch) return;
      if (!done) {
        finalize(gameName, state, true, `⏱️ ${t('timeout')}`);
        stopSearch();
      }
    }, MAX_TOTAL_TIMEOUT);

    const port = chrome.runtime.connect({ name: 'searchPort' });
    searchPort = port;

    port.onMessage.addListener(msg => {
      if (epoch !== searchEpoch) return;
      if (msg.type === 'started') {
        expectedTotal = msg.total || 0;
        clearTimeout(stallTimer);
        stallTimer = null;
        resetIdleWatchdog(epoch, onIdleTimeout);
        renderStatus(gameName, state);
      } else if (msg.type === 'trackerResult') {
        state.set(msg.tracker, msg);
        trackerAttempts.set(msg.tracker, msg.attempt || 0);
        resetIdleWatchdog(epoch, onIdleTimeout);
        renderTrackerBlock(gameName, state, msg.tracker);
        renderStatus(gameName, state);
        updateTotal(state);
      } else if (msg.type === 'done') {
        done = true;
        clearSearchTimers();
        finalize(gameName, state);
        try { port.disconnect(); } catch (e) {}
        if (searchPort === port) searchPort = null;
        setButtonLoading(false);
      }
    });

    port.onDisconnect.addListener(() => {
      if (epoch !== searchEpoch) return; // это старый порт, убитый stopSearch()
      searchPort = null;
      clearSearchTimers();
      if (!done) {
        finalize(gameName, state, true);
        setButtonLoading(false);
      }
    });

    port.postMessage({ type: 'search', gameName });
  }

  // ==== Инкрементальный рендер (MJ-03) ====
  // Один <div data-tracker=...> на трекер: при ответе трекера обновляется
  // только его блок, остальные не трогаются — слушатели выживают.
  // Клики по аккордеону делегированы на #stf-groups (один слушатель).

  function renderStatus(gameName, state) {
    const statusEl = document.getElementById('stf-status');
    if (!statusEl) return;
    const n = expectedTotal || state.size;
    statusEl.innerHTML = `<span class="stf-spinner-mini"></span> ${t('polled')(Math.min(state.size, n), n, escapeHtml(gameName))}`;
  }

  function ensureTrackerBlock(tracker) {
    const groupsEl = document.getElementById('stf-groups');
    if (!groupsEl) return null;
    let block = groupsEl.querySelector(`[data-tracker="${escapeHtml(tracker)}"]`);
    if (!block) {
      block = document.createElement('div');
      block.dataset.tracker = tracker;
      groupsEl.appendChild(block);
    }
    return block;
  }

  function renderTrackerBlock(gameName, state, tracker) {
    panelState = state;
    panelGameName = gameName;
    const g = state.get(tracker);
    if (!g) return;
    if (keyTab[tracker] !== activeTab) return;   // трекер не на активной вкладке
    const block = ensureTrackerBlock(tracker);
    if (!block) return;
    block.innerHTML = compileGroup(tracker, g.results, g.error);
  }

  // Полная перерисовка активной вкладки (переключение таба)
  function renderActiveTab(state) {
    const groupsEl = document.getElementById('stf-groups');
    if (!groupsEl) return;
    groupsEl.innerHTML = '';
    for (const [key, g] of state.entries()) {
      if (keyTab[key] !== activeTab) continue;
      const block = document.createElement('div');
      block.dataset.tracker = key;
      block.innerHTML = compileGroup(key, g.results, g.error);
      groupsEl.appendChild(block);
    }
    const isDone = expectedTotal > 0 && state.size >= expectedTotal;
    if (isDone) {
      const block = emptyTabBlock(state);
      if (block) groupsEl.innerHTML = block;
    }
  }

  function emptyTabBlock(st) {
    const entries = [...st.entries()];
    const list = entries.filter(([, g]) => keyTab[g.tracker] === activeTab);
    if (list.length === 0) {
      // Трекеры есть (пришли ответы), но ни один не лежит на активной вкладке —
      // показываем breakdown, иначе пользователь видит пустоту и не понимает почему
      if (st.size === 0) return '';
      const counts = {};
      for (const [, g] of entries) {
        const tabId = keyTab[g.tracker] || '?';
        counts[tabId] = (counts[tabId] || 0) + 1;
      }
      const breakdown = tabsList.map(x => `${x.label}: ${counts[x.id] || 0}`).join(' · ');
      return `<div class="stf-empty">${t('noTrackersOnTab')}<small>${t('tabBreakdown')} ${escapeHtml(breakdown)}</small></div>`;
    }
    if (list.every(([, g]) => g.results.length === 0)) {
      const errs = list.filter(([, g]) => g.error).map(([, g]) => (trackerMeta[g.tracker] || TRACKER_COLORS[g.tracker] || { name: g.tracker }).name);
      return `
        <div class="stf-empty">
          ${t('nothingFound')}
          <small>${t('nothingFoundHint')}</small>
          ${errs.length ? `<div class="stf-empty-note">${t('whoFailed')} ${errs.join(', ')}.</div>` : ''}
        </div>`;
    }
    return '';
  }

  function finalize(gameName, state, aborted = false, abortMsg = null) {
    const statusEl = document.getElementById('stf-status');
    if (statusEl) {
      if (aborted) {
        statusEl.innerHTML = abortMsg || `⚠️ ${t('portLost')}`;
      } else {
        statusEl.innerHTML = t('finished')(countTotal(state));
      }
    }
    updateTotal(state);

    // Пустая активная вкладка показывается и при прерывании (UX-01):
    // раньше `if (aborted) return;` оставлял юзера с пустотой без объяснений.
    const el = document.getElementById('stf-groups');
    if (el) {
      const block = emptyTabBlock(state);
      if (block) el.innerHTML = block;
    }
  }

  function updateTotal(state) {
    const headerTotal = document.querySelector('.stf-total');
    if (headerTotal) headerTotal.textContent = t('foundCount')(countTotal(state));
  }

  function countTotal(state) {
    return [...state.values()].reduce((s, g) => s + (g.results?.length || 0), 0);
  }

  // ==== Компиляция группы одного трекера (аккордеон по версиям) ====
  function compileGroup(tracker, results, error) {
    const conf = trackerMeta[tracker] || TRACKER_COLORS[tracker] || { name: tracker, color: '#888' };

    if (error && (!results || results.length === 0)) {
      const attempts = trackerAttempts.get(tracker) || 0;
      const attemptHtml = attempts > 1 ? ` · ${t('attemptNote')(attempts)}` : '';
      return `
        <div class="stf-tracker-group">
          <div class="stf-tracker-label">
            <span class="stf-badge" style="--tc:${escapeHtml(conf.color)}">${escapeHtml(conf.name)}</span>
            <span class="stf-count stf-count-err" title="${escapeHtml(error)}">⚠️ ${t('notResponding')(escapeHtml(error))}${escapeHtml(attemptHtml)}</span>
          </div>
        </div>`;
    }

    if (!results || results.length === 0) {
      return `
        <div class="stf-tracker-group">
          <div class="stf-tracker-label">
            <span class="stf-badge" style="--tc:${escapeHtml(conf.color)}">${escapeHtml(conf.name)}</span>
            <span class="stf-count">0</span>
          </div>
          <div class="stf-empty-row">${t('noResults')}</div>
        </div>`;
    }

    // Группировка версий по базовому названию (r.key приходит из background)
    const groupsMap = new Map();
    for (const r of results) {
      const key = r.key || normalizeBase(r.title);
      if (!key) continue;
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push(r);
    }

    const groups = [...groupsMap.entries()]
      .map(([key, items]) => {
        items.sort((a, b) => (dateVal(b) - dateVal(a)) || ((b.seeders || 0) - (a.seeders || 0)));
        return { key, items, newest: items[0] };
      })
      .sort((a, b) => dateVal(b.newest) - dateVal(a.newest));

    const totalVersions = results.length;
    const groupWord = t('variants')(groups.length);
    const versionWord = t('versions')(totalVersions);

    let html = `
      <div class="stf-tracker-group">
        <div class="stf-tracker-label">
          <span class="stf-badge" style="--tc:${escapeHtml(conf.color)}">${escapeHtml(conf.name)}</span>
          <span class="stf-count">${groups.length} ${groupWord} · ${totalVersions} ${versionWord}</span>
        </div>
        <div class="stf-accordion">`;

    for (const g of groups) {
      const isOpen = openGroups.has(g.key);
      const shown = g.items.slice(0, 15);
      const more = g.items.length - shown.length;
      // Формат строки определяется самими результатами: попап может
      // перетащить любой трекер в любую папку — тип рендера никак не связан
      // с его именем
      const isFix = !!(results[0] && results[0].kind === 'fix');
      const rows = shown.map(r => (isFix ? fixCard(r) : versionRow(r))).join('');
      const bodyHtml = isFix
        ? `<div class="stf-fix-list">${rows}</div>`
        : `
            <table class="stf-table">
              <thead><tr>
                <th>${t('colName')}</th><th>${t('colSeeds')}</th><th class="stf-th-size">${t('colSize')}</th><th>${t('colDate')}</th><th class="stf-th-action">${t('colAction')}</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>`;
      html += `
        <div class="stf-acc-item">
          <button class="stf-group-head${isOpen ? ' stf-open' : ''}" type="button" data-key="${escapeHtml(g.key)}">
            <span class="stf-arrow">▸</span>
            <span class="stf-group-title" title="${escapeHtml(g.newest.title)}">${escapeHtml(g.newest.title)}</span>
            <span class="stf-group-meta">${g.items.length} ${t('versions')(g.items.length)}</span>
            <span class="stf-group-date">${escapeHtml(g.newest.dateRaw)}</span>
          </button>
          <div class="stf-group-body${isOpen ? ' stf-open' : ''}" data-key="${escapeHtml(g.key)}"${isOpen ? '' : ' hidden'}>
            ${bodyHtml}
          </div>
          ${more > 0 ? `<div class="stf-more-row">${t('moreVersions')(more)}</div>` : ''}
        </div>`;
    }

    html += `</div></div>`;
    return html;
  }

  function versionRow(r) {
    const emDash = r.seeders == null;
    const isFix = r.kind === 'fix';
    const seederClass = emDash ? 'stf-seed-low' : r.seeders >= 30 ? 'stf-seed-high' : r.seeders >= 5 ? 'stf-seed-mid' : 'stf-seed-low';
    // href экранируется (CR-01); magnet/detailUrl уже валидированы в background
    // (sanitizeMagnet/sanitizeDetailUrl), здесь — двойная защита через escapeAttr.
    const magnetHref = r.magnet ? escapeAttr(r.magnet) : '';
    const detailHref = r.detailUrl ? escapeAttr(r.detailUrl) : '';
    const actionHtml = r.magnet
      ? `<a class="stf-magnet" href="${magnetHref}" title="${escapeHtml(t('tooltipMagnet'))}">${t('magnet')}</a>`
      : (r.detailUrl
        ? `<a class="stf-magnet stf-magnet-page" href="${detailHref}" target="_blank" rel="noopener" title="${isFix ? escapeHtml(t('tooltipOpenFix')) : escapeHtml(t('tooltipOpenPage'))}">${isFix ? t('open') : t('magnet')}</a>`
        : '<span class="stf-na">—</span>');

    return `
      <tr>
        <td class="stf-name">${escapeHtml(r.title)}${isFix ? '' : (r.detailUrl ? `<br><a class="stf-detail-link" href="${detailHref}" target="_blank" rel="noopener">${t('details')}</a>` : '')}</td>
        <td class="stf-seeds ${seederClass}">${emDash ? '—' : r.seeders + `<span class="stf-leech">/${r.leechers || 0}</span>`}</td>
        <td class="stf-size">${escapeHtml(r.sizeRaw)}</td>
        <td class="stf-date">${escapeHtml(r.dateRaw)}</td>
        <td class="stf-action">${actionHtml}</td>
      </tr>`;
  }

  function fixCard(r) {
    const d = r.detailUrl ? escapeAttr(r.detailUrl) : '';
    return `
      <div class="stf-fix-card">
        <div class="stf-fix-title" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</div>
        ${r.sizeRaw && r.sizeRaw !== '—' ? `<div class="stf-fix-desc">${escapeHtml(r.sizeRaw)}</div>` : ''}
        <div class="stf-fix-row">
          <span class="stf-fix-date">${escapeHtml(r.dateRaw)}</span>
          ${r.detailUrl
            ? `<a class="stf-magnet" href="${d}" target="_blank" rel="noopener" title="${escapeHtml(t('tooltipOpenFix'))}">${t('open')}</a>`
            : '<span class="stf-na">—</span>'}
        </div>
      </div>`;
  }

  // ==== Аккордеон: делегированный клик (MJ-03/PF-03) ====
  // Один слушатель на #stf-groups ставится при открытии модалки; перерисовки
  // блоков его не трогают — переподвеска не нужна, гонок с эпохой нет.
  function bindGroupsDelegation() {
    const groupsEl = document.getElementById('stf-groups');
    if (!groupsEl) return;
    groupsEl.addEventListener('click', (ev) => {
      const head = ev.target.closest('.stf-group-head');
      if (!head || !groupsEl.contains(head)) return;
      const key = head.dataset.key;
      // Тело ищем строго внутри своего acc-item: разные трекеры могут дать
      // одинаковый data-key (одно имя игры), глобальный селектор случайно
      // тоглит чужую (первую по DOM) группу
      const item = head.closest('.stf-acc-item');
      const body = item && item.querySelector('.stf-group-body');
      if (!body) return;
      const opening = body.hidden;
      body.hidden = !opening;
      head.classList.toggle('stf-open', opening);
      if (opening) openGroups.add(key); else openGroups.delete(key);
    });
  }

  // ==== Табы: «Обычные трекеры» / «Онлайн-фиксы» ====
  function bindTabs() {
    const tabsEl = document.getElementById('stf-tabs');
    if (!tabsEl) return;
    tabsEl.querySelectorAll('.stf-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        tabsEl.querySelectorAll('.stf-tab').forEach(b =>
          b.classList.toggle('stf-tab-active', b.dataset.tab === activeTab));
        // Перерисовываем содержимое активной вкладки из состояния поиска
        if (panelState) renderActiveTab(panelState);
      });
    });
  }

  // ==== Утилиты группировки ====
  function normalizeBase(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9а-яё]+/g, ' ').trim();
  }

  function dateVal(r) {
    const s = String(r.dateRaw || '');
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
    const t = Date.parse(s);
    return isNaN(t) ? 0 : t;
  }

  function plural(n, forms) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
  }

  // ==== Модалка ====
  function openModal() {
    let overlay = document.getElementById('stf-overlay');
    if (overlay) {
      overlay.remove();
    }
    overlay = document.createElement('div');
    overlay.id = 'stf-overlay';
    overlay.className = 'stf-overlay';
    overlay.innerHTML = `
      <div class="stf-modal">
        <button id="stf-close" class="stf-close" title="${escapeHtml(t('closeTitle'))}">✕</button>
        <div class="stf-content">
          <div class="stf-header">
            <h2 class="stf-title">${t('panelTitle')}</h2>
            <span class="stf-total">0</span>
          </div>
          <div id="stf-body"></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Клик по фону НЕ закрывает панель — только крестик и Esc
    overlay.querySelector('#stf-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', onKeyDown);

    // requestAnimationFrame для анимации появления
    requestAnimationFrame(() => overlay.classList.add('stf-open'));
  }

  function setModalHtml(innerHtml) {
    const body = document.getElementById('stf-body');
    if (body) {
      body.innerHTML = innerHtml;
      bindGroupsDelegation();   // #stf-groups пересоздан — вешаем делегирование заново
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && document.getElementById('stf-overlay')) closeModal();
  }

  function closeModal() {
    stopSearch(); // гасим поиск: порт, таймеры, кнопку
    const el = document.getElementById('stf-overlay');
    if (!el) return;
    el.classList.remove('stf-open');
    setTimeout(() => {
      if (el.isConnected) el.remove();
    }, 250);
  }

  // ==== Утилиты ====
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');   // SC-02: одинарные кавычки тоже опасны в атрибутах
  }

  // Для значений в href/src: кроме HTML-сущностей гасим кавычки и пробелы,
  // чтобы значение атрибута нельзя было разорвать (CR-01, defense-in-depth).
  function escapeAttr(str) {
    return escapeHtml(String(str ?? '')).replace(/[\s'`]/g, ch => {
      return { ' ': '%20', "'": '%27', '`': '%60' }[ch];
    });
  }

  function setButtonLoading(loading) {
    const btn = document.getElementById('stf-search-btn');
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('stf-loading-btn', loading);
    const label = btn.querySelector('.stf-btn-label');
    if (label) label.textContent = loading ? t('searchingBtn') : t('searchBtn');
  }

  // Папки из настроек попапа = вкладки панели поиска (в порядке списка).
  // «Обычные трекеры» и «Онлайн-фиксы» — просто первые две папки.
  const BUILTIN_TRACKER_KEYS = Object.keys(TRACKER_COLORS);
  let keyTab = {
    piratebay: 'regular', x1337: 'regular', rutracker: 'regular',
    freetp: 'fix', onlinefix: 'fix'
  };
  // Вкладки панели: список папок (id + подпись) и активная вкладка
  let tabsList = DEFAULT_GROUPS_UI.map(g => ({
    id: g.id,
    label: (g.title && (g.title[uiLang] || g.title.ru)) || g.id
  }));
  let activeTab = 'regular';
  // Состояние открытой панели (для перерисовки при переключении вкладок)
  let panelState = null;
  let panelGameName = '';
  // Имя/цвет трекера из настроек попапа (кастомные трекеры!), fallback — TRACKER_COLORS
  let trackerMeta = {};

  function folderDisplayTitle(g) {
    if (typeof g.title === 'string') return g.title || g.id;
    return (g.title && (g.title[uiLang] || g.title.ru)) || g.id;
  }

  async function loadLayout() {
    try {
      const defaultTrackersUi = {};
      for (const [key, meta] of Object.entries(TRACKER_COLORS)) {
        defaultTrackersUi[key] = { group: meta.group };
      }
      const stored = await chrome.storage.sync.get({
        groups: DEFAULT_GROUPS_UI,
        trackers: defaultTrackersUi
      });
      const groups = (stored.groups && stored.groups.length) ? stored.groups : DEFAULT_GROUPS_UI;
      // Санитизация: трекер может ссылаться на убитую/пересозданную папку —
      // тогда он пропадал со всех вкладок. Битую привязку возвращаем на дефолт.
      const groupIds = new Set(groups.map(g => g.id));
      const map = {};
      const meta = {};
      for (const [key, conf] of Object.entries(stored.trackers || defaultTrackersUi)) {
        const g = conf && conf.group;
        const fallback = defaultTrackersUi[key] ? defaultTrackersUi[key].group : 'regular';
        map[key] = (g && groupIds.has(g)) ? g : fallback;
        if (conf && conf.custom) meta[key] = { name: conf.name || key, color: conf.color || '#888' };
      }
      tabsList = groups.map(g => ({ id: g.id, label: folderDisplayTitle(g) }));
      keyTab = map;
      trackerMeta = meta;
      // Активная вкладка могла исчезнуть (удалили папку) — откат на первую
      if (!tabsList.some(x => x.id === activeTab)) activeTab = tabsList[0].id;
    } catch (e) { /* хранилище недоступно — остаёмся на дефолтах */ }
  }

  chrome.storage.onChanged.addListener(() => { loadLayout(); });

  // ==== Инициализация (MN-03: ограниченные повторы) ====
  const INIT_MAX_TRIES = 10;
  function init(tryNo = 1) {
    loadLang();   // язык из настроек + слушатель смены
    loadLayout(); // папки/раскладка трекеров из попапа
    if (document.getElementById('appHubAppName') || document.querySelector('.apphub_AppName')) {
      createButton();
    } else if (tryNo < INIT_MAX_TRIES) {
      setTimeout(() => init(tryNo + 1), 800);
    }
    // Дольше — не ждём: MutationObserver подхватит, когда h1 появится
  }

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    const ret = originalPushState.apply(this, args);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      closeModal(); // аккуратно закрываем панель и гасим поиск
      cachedGameName = null;
      createButton();
    }, 1200);
    return ret;
  };

  window.addEventListener('popstate', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      closeModal(); // аккуратно закрываем панель и гасим поиск
      cachedGameName = null;
      createButton();
    }, 1200);
  });

  // MutationObserver для динамических перерисовок Steam (PF-02: debounce 300 мс)
  let observerPending = false;
  const observer = new MutationObserver(() => {
    if (observerPending) return;
    observerPending = true;
    setTimeout(() => {
      observerPending = false;
      const btn = document.getElementById('stf-search-btn');
      const h1 = document.querySelector('#appHubAppName, .apphub_AppName');
      if (h1 && !btn) createButton();
    }, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  init();
})();
