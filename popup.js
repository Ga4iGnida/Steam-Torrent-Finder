// ============================================================
// Steam Torrent Finder — popup (папки, кастомные трекеры, RU/EN)
// ============================================================

// Единый источник метаданных (MJ-04): common.js подключён в popup.html
const BUILTIN_META = window.STF_COMMON.BUILTIN_META;

const I18N = {
  ru: {
    foldersTitle: 'Папки',
    customTitle: 'Кастомный трекер',
    newFolderPh: 'Название новой папки',
    customNamePh: 'Название трекера',
    customUrlPh: 'Шаблон поиска с {q}, напр. https://online-fix.top/?do=search&story={q}',
    customEnc: 'Windows-1251',
    customMagnet: 'искать магнит на странице',
    customFolder: 'Папка',
    customAdd: 'Добавить',
    testBtn: 'Проверить',
    testingBtn: 'Проверяем…',
    testOk: (n) => `OK: найдено ${n}`,
    testEmpty: 'Шаблон работает, но результатов нет',
    testFail: (e) => `Не работает: ${e}`,
    folderDup: 'Папка с таким названием уже есть.',
    delFolderTitle: 'Удалить папку (трекеры переедут в последнюю)',
    delTrackerTitle: 'Удалить трекер',
    saved: 'Настройки сохранены',
    tabRegShort: 'Обычные',
    tabFixShort: 'Онлайн-фиксы',
    customErr1: 'Вставьте ссылку на поиск сайта. Для популярных сайтов (Rutor, byXatab, TheLastGame, Small-Games и подобных) шаблон подставится сам, остальным нужна ссылка с пометкой {q} — на её место подставится название игры. Пример: https://rutor.info/search/torrent/0/0/0/{q}',
    customErr2: 'URL должен начинаться с http(s).',
    customErr3: 'Такое название уже есть.',
    help: 'Открой страницу игры в Steam Store — рядом с названием появится кнопка «Искать торренты».',
    github: 'GitHub',
    boosty: 'Поддержать автора',
    disclaimer: 'Автор не одобряет пиратство. Расширение создано исключительно в ознакомительных целях и не содержит какого-либо контента: ссылки ведут на сторонние ресурсы. Ответственность за использование несут сами пользователи.',
    descs: {
      piratebay: 'Крупнейший публичный трекер',
      x1337: 'Популярный публичный трекер',
      rutracker: 'Русскоязычный трекер',
      freetp: 'Игры + патч для сети',
      onlinefix: 'Релизы с онлайн-фиксом'
    }
  },
  en: {
    foldersTitle: 'Folders',
    customTitle: 'Custom tracker',
    newFolderPh: 'New folder name',
    customNamePh: 'Tracker name',
    customUrlPh: 'Search URL template with {q}, e.g. https://online-fix.top/?do=search&story={q}',
    customEnc: 'Windows-1251',
    customMagnet: 'grab magnet from page',
    customFolder: 'Folder',
    customAdd: 'Add',
    testBtn: 'Test',
    testingBtn: 'Testing…',
    testOk: (n) => `OK: ${n} results`,
    testEmpty: 'Template works but no results',
    testFail: (e) => `Failed: ${e}`,
    folderDup: 'A folder with this name already exists.',
    delFolderTitle: 'Delete folder (trackers move to the last one)',
    delTrackerTitle: 'Delete tracker',
    saved: 'Settings saved',
    tabRegShort: 'Regular',
    tabFixShort: 'Online fixes',
    customErr1: 'Paste the site\'s search link. For popular sites (Rutor, byXatab, TheLastGame, Small-Games and alike) the template is filled in automatically; otherwise the link needs {q} in it — the game title will be substituted there. Example: https://rutor.info/search/torrent/0/0/0/{q}',
    customErr2: 'URL must start with http(s).',
    customErr3: 'This name already exists.',
    help: 'Open a game page in Steam Store — the "Search torrents" button appears next to the title.',
    github: 'GitHub',
    boosty: 'Support the Project',
    disclaimer: 'The author does not endorse piracy. This extension is for informational purposes only and hosts no content: links point to third-party sites. Use at your own risk.',
    descs: {
      piratebay: 'Largest public tracker',
      x1337: 'Popular public tracker',
      rutracker: 'Russian-language tracker',
      freetp: 'Games + online patch',
      onlinefix: 'Releases with online fix'
    }
  }
};

// DEFAULT_GROUPS теперь из common.js (MJ-04)
const DEFAULT_GROUPS = window.STF_COMMON.DEFAULT_GROUPS;

const CUSTOM_COLORS = ['#e91e63', '#4caf50', '#ff9800', '#9c27b0', '#00bcd4', '#ffb400', '#8ac9f8'];

let state = {
  language: 'ru',
  trackers: {},
  groups: JSON.parse(JSON.stringify(DEFAULT_GROUPS))
};

let currentLang = 'ru';

function t(key) {
  return I18N[currentLang][key];
}

function folderTitle(folder) {
  if (typeof folder.title === 'string') return folder.title;
  if (folder.title && folder.title[currentLang]) return folder.title[currentLang];
  return folder.id;
}

function applyLang() {
  document.documentElement.lang = currentLang;
  document.getElementById('ui-help').textContent = t('help');
  document.getElementById('ui-github').textContent = t('github');
  document.getElementById('ui-boosty').textContent = t('boosty');
  document.getElementById('ui-disclaimer').textContent = t('disclaimer');
  document.getElementById('ui-folders-title').textContent = t('foldersTitle');
  document.getElementById('ui-custom-title').textContent = t('customTitle');
  document.getElementById('newFolderName').placeholder = t('newFolderPh');
  document.getElementById('customName').placeholder = t('customNamePh');
  document.getElementById('customUrl').placeholder = t('customUrlPh');
  document.getElementById('testCustomBtn').textContent = t('testBtn');
  // MN-02: статические надписи чекбоксов тоже локализованы
  document.querySelector('label[for="customEnc1251"]').lastChild.textContent = ' ' + t('customEnc');
  document.querySelector('label[for="customMagnet"]').lastChild.textContent = ' ' + t('customMagnet');
  document.getElementById('lang-ru').classList.toggle('active', currentLang === 'ru');
  document.getElementById('lang-en').classList.toggle('active', currentLang === 'en');
  // подписи трекеров
  for (const el of document.querySelectorAll('.tracker-desc')) {
    el.textContent = I18N[currentLang].descs[el.dataset.key] || '';
  }
  render();
  refreshCustomFolderSelect();
}

function setLang(lang) {
  currentLang = lang;
  state.language = lang;
  applyLang();
  chrome.storage.sync.set({ language: lang });
}

function showErr(msg) {
  const el = document.getElementById('customErr');
  el.textContent = msg;
  el.classList.add('show');
}

// Ошибка висит, пока пользователь не начнёт новый успешный шаг — не прячем по таймеру
function clearErr() {
  const el = document.getElementById('customErr');
  el.textContent = '';
  el.classList.remove('show');
}

async function loadState() {
  const DEFAULT_SETTINGS = window.STF_COMMON.defaultSettings();
  const stored = await chrome.storage.sync.get({ trackers: null, groups: null, language: 'ru' });
  currentLang = stored.language === 'en' ? 'en' : 'ru';
  state.language = currentLang;

  state.trackers = stored.trackers || JSON.parse(JSON.stringify(DEFAULT_SETTINGS.trackers));
  state.groups = (stored.groups && Array.isArray(stored.groups) && stored.groups.length) ? stored.groups : JSON.parse(JSON.stringify(DEFAULT_SETTINGS.groups));

  // Миграция: у встроенных не было group — проставить из BUILTIN_META
  for (const [key, conf] of Object.entries(state.trackers)) {
    if (!conf.group) conf.group = (BUILTIN_META[key] && BUILTIN_META[key].group) || 'regular';
    if (conf.name === undefined && BUILTIN_META[key]) conf.name = BUILTIN_META[key].name;
    if (conf.color === undefined && BUILTIN_META[key]) conf.color = BUILTIN_META[key].color;
    // Дефолт enabled для встроенных трекеров, у которых его нет в старом storage
    if (conf.enabled === undefined && window.STF_COMMON.DEFAULT_TRACKERS_DEFAULTS[key]) {
      conf.enabled = window.STF_COMMON.DEFAULT_TRACKERS_DEFAULTS[key].enabled;
    }
  }
  // папки, которых не существует, валимся в последнюю папку
  const ids = state.groups.map(g => g.id);
  for (const conf of Object.values(state.trackers)) {
    if (!ids.includes(conf.group)) conf.group = ids[ids.length - 1] || 'regular';
  }
  // Санитизация: мусор от старых версий (nyaa и пр.) не показываем и не ищем
  for (const key of Object.keys(state.trackers)) {
    const conf = state.trackers[key];
    if (!conf || (!conf.custom && !BUILTIN_META[key])) delete state.trackers[key];
  }
}

async function save() {
  await chrome.storage.sync.set({
    trackers: state.trackers,
    groups: state.groups,
    language: state.language
  });
  const hint = document.getElementById('saveHint');
  hint.textContent = t('saved');
  hint.classList.add('show');
  setTimeout(() => hint.classList.remove('show'), 1600);
}

function render() {
  const list = document.getElementById('trackerList');
  list.innerHTML = '';

  for (const folder of state.groups) {
    const isBase = folder.id === 'regular' || folder.id === 'fix';
    const head = document.createElement('div');
    head.className = 'folder-head';
    head.draggable = true;           // перетаскивание папок — смена порядка
    head.dataset.folder = folder.id;

    const title = document.createElement('span');
    title.className = 'folder-title';
    title.textContent = folderTitle(folder);
    head.appendChild(title);

    if (state.groups.length > 1 && !isBase) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'folder-del';
      del.textContent = '✕';
      del.title = t('delFolderTitle');   // MN-02
      del.dataset.id = folder.id;
      head.appendChild(del);
    }

    list.appendChild(head);

    const body = document.createElement('div');
    body.className = 'folder-body';
    body.dataset.folder = folder.id;

    for (const [key, conf] of Object.entries(state.trackers)) {
      if (conf.group !== folder.id) continue;

      const row = document.createElement('div');
      row.className = 'tracker-row';
      row.draggable = true;
      row.dataset.key = key;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!conf.enabled;
      cb.dataset.key = key;

      const dot = document.createElement('span');
      dot.className = 'tracker-dot';
      dot.style.background = conf.color || '#888';

      const name = document.createElement('span');
      name.className = 'tracker-name';
      name.textContent = conf.name || key;

      row.appendChild(cb);
      row.appendChild(dot);
      row.appendChild(name);

      if (!conf.custom && I18N[currentLang].descs[key]) {
        const desc = document.createElement('span');
        desc.className = 'tracker-desc';
        desc.dataset.key = key;
        desc.style.cssText = 'margin-left:auto;font-size:10.5px;color:var(--text-dim);text-align:right;';
        desc.textContent = I18N[currentLang].descs[key];
        row.appendChild(desc);
      }

      if (conf.custom) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'row-del';
        btn.textContent = '✕';
        btn.title = t('delTrackerTitle');   // MN-02
        btn.dataset.del = key;
        row.appendChild(btn);
      }

      body.appendChild(row);

      cb.addEventListener('change', () => {
        state.trackers[key].enabled = cb.checked;
        save();
      });
      row.addEventListener('dragstart', ev => {
        ev.dataTransfer.setData('text/plain', key);
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
    }

    list.appendChild(body);

    body.addEventListener('dragover', ev => {
      ev.preventDefault();
      body.classList.add('drop-hover');
    });
    body.addEventListener('dragleave', ev => {
      if (!body.contains(ev.relatedTarget)) body.classList.remove('drop-hover');
    });
    body.addEventListener('drop', async ev => {
      ev.preventDefault();
      body.classList.remove('drop-hover');
      const key = ev.dataTransfer.getData('text/plain');
      if (key && state.trackers[key]) {
        state.trackers[key].group = folder.id;
        await save();
        render();
      }
    });

    // ==== DnD папок: смена порядка ====
    head.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('application/x-folder', folder.id);
      head.classList.add('dragging');
    });
    head.addEventListener('dragend', () => head.classList.remove('dragging'));
    head.addEventListener('dragover', ev => {
      // подсветка только для папочных драгов (трекерные идут text/plain)
      if (draggingFolderId() && ev.currentTarget !== head) {
        head.classList.add('drop-hover');
      }
    });
    head.addEventListener('dragleave', ev => {
      if (!head.contains(ev.relatedTarget)) head.classList.remove('drop-hover');
    });
    head.addEventListener('drop', async ev => {
      const src = ev.dataTransfer.getData('application/x-folder');
      if (!src || src === folder.id) return;
      ev.preventDefault();
      head.classList.remove('drop-hover');
      const from = state.groups.findIndex(g => g.id === src);
      const to = state.groups.findIndex(g => g.id === folder.id);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = state.groups.splice(from, 1);
      state.groups.splice(to, 0, moved);
      await save();
      render();
    });
  }
}

// ==== Кастомные трекеры ====

// Текущая ре-драг. папка (для подсветки dragover только папочных драгов)
function draggingFolderId() {
  return document.querySelector('.folder-head.dragging')
    ? document.querySelector('.folder-head.dragging').dataset.folder : null;
}

// URL с настоящим запросом («...story=Deep+Rock+Galactic») умеем превращать
// в шаблон: последний текстовый query-параметр станет {q}
function normalizeUrlTemplate(raw) {
  let url = String(raw || '').trim();
  if (url.includes('{q}')) return url;
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  // Известный хост? Проверенный шаблон важнее любой эвристики по параметрам
  // (иначе у small-games.info «go=game» превращается в «go={q}» — не туда).
  const known = STF_COMMON.knownSearchTemplate(u.href);
  if (known) return known;
  const params = [...u.searchParams.entries()];
  if (!params.length) return null;
  // берём последний параметр с самым длинным значением (не числа/флаги)
  let pick = -1, pickLen = 0;
  params.forEach(([k, v], i) => {
    if (v.length >= pickLen && !/^\d+$/.test(v) && !['page','p','start'].includes(k.toLowerCase())) {
      pick = i; pickLen = v.length;
    }
  });
  if (pick < 0 || pickLen < 2) return null;
  const [key] = params[pick];
  u.searchParams.delete(key);
  u.searchParams.set(key, '{q}');
  return u.toString().replace(/%7Bq%7D/gi, '{q}');
}

// Список сайтов с проверенными шаблонами — в STF_COMMON.KNOWN_SEARCH_TEMPLATES
// (rutor, byxatab, thelastgame, small-games...). Пользователю достаточно
// вставить любую ссылку на поиск такого сайта — шаблон подставится сам.

// UX-04: пробная проверка кастомного трекера перед добавлением.
// Отправляет конфиг в background (runtime message), там одна загрузка без
// ретраев и без cookies; в ответе — количество и первые 3 заголовка.
let testSeq = 0;
async function testCustomTracker() {
  const name = String(document.getElementById('customName').value || '').trim();
  const rawUrl = String(document.getElementById('customUrl').value || '').trim();
  const errEl = document.getElementById('customErr');

  if (!name || !rawUrl) { showErr(t('customErr1')); return; }
  if (!/^https?:\/\//i.test(rawUrl)) { showErr(t('customErr2')); return; }
  const url = normalizeUrlTemplate(rawUrl);
  if (!url) { showErr(t('customErr1')); return; }
  clearErr();

  const btn = document.getElementById('testCustomBtn');
  const hint = document.getElementById('testCustomHint');
  btn.disabled = true;
  btn.textContent = t('testingBtn');
  hint.textContent = '';
  hint.className = 'test-hint';

  const id = 't' + (++testSeq);
  const conf = {
    searchUrl: url,
    enc1251: document.getElementById('customEnc1251').checked
  };

  const reply = await new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'testCustom', id, conf }, res => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(res);
      });
    } catch (e) { resolve(null); }
    // Страховка: background мог не ответить
    setTimeout(() => resolve(undefined), 20000);
  });

  btn.disabled = false;
  btn.textContent = t('testBtn');

  if (reply === null || reply === undefined) {
    hint.textContent = t('testFail')('timeout');
    hint.classList.add('bad');
    return;
  }
  if (reply.ok && reply.count > 0) {
    hint.textContent = t('testOk')(reply.count) + ' · ' + reply.titles.join(' | ');
    hint.classList.add('good');
  } else if (reply.ok) {
    hint.textContent = t('testEmpty');
    hint.classList.add('good');
  } else {
    hint.textContent = t('testFail')(reply.error || '?');
    hint.classList.add('bad');
  }
  void errEl;
}

function addCustom() {
  const nameEl = document.getElementById('customName');
  const urlEl = document.getElementById('customUrl');
  const enc = document.getElementById('customEnc1251').checked;
  const grab = document.getElementById('customMagnet').checked;
  const folder = document.getElementById('customFolder').value;

  const name = String(nameEl.value || '').trim();
  const rawUrl = String(urlEl.value || '').trim();

  if (!name || !rawUrl) { showErr(t('customErr1')); return; }
  if (!/^https?:\/\//i.test(rawUrl)) { showErr(t('customErr2')); return; }
  const url = normalizeUrlTemplate(rawUrl);
  if (!url) { showErr(t('customErr1')); return; }
  clearErr();
  const same = Object.values(state.trackers).some(c => (c.name || '').toLowerCase() === name.toLowerCase());
  if (same) { showErr(t('customErr3')); return; }

  const key = 'custom' + Date.now().toString(36);
  const color = CUSTOM_COLORS[Object.keys(state.trackers).length % CUSTOM_COLORS.length];

  state.trackers[key] = {
    enabled: true, custom: true, name, color,
    group: folder, searchUrl: url, enc1251: enc, grabMagnet: grab
  };

  nameEl.value = '';
  urlEl.value = '';
  save();
  render();
}

function addFolder() {
  const inp = document.getElementById('newFolderName');
  const name = String(inp.value || '').trim();
  if (!name) return;
  // MN-05: запрет дубликатов имён папок
  const dup = state.groups.some(g =>
    (typeof g.title === 'string' ? g.title : (g.title && g.title[currentLang]) || g.id).toLowerCase() === name.toLowerCase()
  );
  if (dup) { showErr(t('folderDup')); return; }
  const last = state.groups[state.groups.length - 1];
  const id = 'f' + Date.now().toString(36);
  state.groups.push({ id, title: name, tab: 'regular' });
  inp.value = '';
  save();
  render();
}

function refreshCustomFolderSelect() {
  const sel = document.getElementById('customFolder');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  for (const folder of state.groups) {
    const opt = document.createElement('option');
    opt.value = folder.id;
    opt.textContent = folderTitle(folder);
    sel.appendChild(opt);
  }
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function bind() {
  document.getElementById('lang-ru').addEventListener('click', () => setLang('ru'));
  document.getElementById('lang-en').addEventListener('click', () => setLang('en'));

  document.getElementById('addFolderBtn').addEventListener('click', addFolder);
  document.getElementById('newFolderName').addEventListener('keydown', ev => {
    if (ev.key === 'Enter') addFolder();
  });

  document.getElementById('addCustomBtn').addEventListener('click', addCustom);
  document.getElementById('testCustomBtn').addEventListener('click', testCustomTracker);

  // Делегированные клики: удаление трекера, смена вклада папки, удаление папки
  document.getElementById('trackerList').addEventListener('click', async ev => {
    const del = ev.target.closest('.row-del');
    if (del) {
      delete state.trackers[del.dataset.del];
      await save();
      render();
      return;
    }
    const fdel = ev.target.closest('.folder-del');
    if (fdel) {
      delFolderDirect(fdel.dataset.id);
    }
  });
}

function delFolderDirect(id) {
  const idx = state.groups.findIndex(g => g.id === id);
  if (idx < 0 || state.groups.length <= 1) return;
  state.groups.splice(idx, 1);
  const fallback = state.groups[state.groups.length - 1].id;
  for (const conf of Object.values(state.trackers)) {
    if (conf.group === id) conf.group = fallback;
  }
  save();
  render();
}

async function init() {
  await loadState();
  bind();
  applyLang(); // внутри — render() + все тексты
  refreshCustomFolderSelect();
}

document.addEventListener('DOMContentLoaded', init);
