// @ts-check
// Settings: the category list and the open category, back to the list on phones, and the search over every row.
// Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielSettingsPart} out */
window.UrielApp.settings = function ({ el, refreshStacks, reloadPluginsList }, out) {
  // Settings navigation. Wide windows: the category list on the left, one category on the right. Phones (and
  // narrow windows): the list of categories with their names, tap one to open it, back (the arrow, or Android's
  // back button) returns to the list. The search field filters every row of every category by the text shown on
  // screen, so it works in any UI language.
  const settingsView = /** @type {HTMLElement} */ (document.getElementById('view-settings'));
  const settingsNarrow = window.matchMedia('(max-width: 760px)');
  const settingsSearchInput = /** @type {HTMLInputElement} */ (document.getElementById('settings-search'));
  const settingsSearchClear = document.getElementById('settings-search-clear');
  const settingsSearchEmpty = document.getElementById('settings-search-empty');
  let settingsCat = 'interface';
  function settingsCatLabel(/** @type {string} */ cat) {
    const b = /** @type {HTMLElement} */ (document.querySelector(`#settings-nav .settings-nav-btn[data-cat="${cat}"] span`));
    return b ? b.textContent.trim() : '';
  }
  function showSettingsCategory(/** @type {string} */ cat) {
    if (cat === 'appearance' || !cat) cat = 'interface';
    // a remembered category that no longer exists (a plugin's, a removed one): start at Interface
    if (!document.querySelector(`#view-settings .settings-section[data-cat="${cat}"]`)) cat = 'interface';
    settingsCat = cat;
    if (settingsSearchInput && settingsSearchInput.value) clearSettingsSearch(true);
    if (settingsView) settingsView.classList.remove('settings-at-list');
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#view-settings .settings-section')).forEach((s) => s.classList.toggle('cat-hidden', s.dataset.cat !== cat));
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#settings-nav .settings-nav-btn')).forEach((b) => b.classList.toggle('active', b.dataset.cat === cat));
    const title = document.getElementById('settings-pane-title'); if (title) title.textContent = settingsCatLabel(cat);
    syncSettingsGroupTitles();
    // after the frame's style work, so it doesn't force a second layout of the whole settings page
    const pane = document.querySelector('#view-settings .settings-pane'); if (pane) requestAnimationFrame(() => { if (pane.scrollTop) pane.scrollTop = 0; });
    settingsScrollTop();
    try { localStorage.setItem('uriel_settings_cat', cat); } catch (e) {}
    if (cat === 'plugins' && typeof reloadPluginsList === 'function') reloadPluginsList();
    // the corners of the category buttons follow from stackObserver (it sees the 'active' class change)
  }
  window.showSettingsCategory = showSettingsCategory;
  // a group whose rows are all hidden here (desktop-only rows on a phone, Windows-only rows) hides its title too
  function syncSettingsGroupTitles() {
    document.querySelectorAll('#view-settings .settings-group-title').forEach((t) => {
      const g = t.nextElementSibling;
      if (!g || !g.classList.contains('m3-group')) return;
      const any = [.../** @type {HTMLCollectionOf<HTMLElement>} */ (g.children)].some((r) => !r.classList.contains('gs-retired') && !r.classList.contains('hidden') && r.style.display !== 'none');
      t.classList.toggle('group-empty', !any);
      g.classList.toggle('group-empty', !any);
    });
  }
  // in the next frame: reading scrollTop right after the category's sections were shown and hidden made the
  // browser lay out the whole Settings page a second time, mid-animation (the stutter when opening Settings)
  function settingsScrollTop() {
    requestAnimationFrame(() => {
      let n = settingsView && settingsView.parentElement;
      while (n && n !== document.body) { if (n.scrollTop) n.scrollTop = 0; n = n.parentElement; }
    });
  }
  // phones: back to the list of categories (the last one stays marked)
  function showSettingsList() {
    if (settingsSearchInput && settingsSearchInput.value) clearSettingsSearch(true);
    if (settingsView) settingsView.classList.add('settings-at-list');
    settingsScrollTop();
  }
  // opening Settings: wide windows show the last category, phones the list
  function enterSettings() {
    let last = 'interface'; try { last = localStorage.getItem('uriel_settings_cat') || 'interface'; } catch (e) {}
    showSettingsCategory(last);
    if (settingsNarrow.matches) showSettingsList();
  }
  // Android back: leave the search, then the open category, before leaving Settings. true = handled
  window.UrielSettingsBack = function () {
    if (!settingsView || !settingsView.classList.contains('active')) return false;
    if (settingsSearchInput && settingsSearchInput.value) { clearSettingsSearch(); return true; }
    if (settingsNarrow.matches && !settingsView.classList.contains('settings-at-list')) { showSettingsList(); return true; }
    return false;
  };
  settingsNarrow.addEventListener('change', () => { if (!settingsNarrow.matches && settingsView) settingsView.classList.remove('settings-at-list'); });

  const settingsNav = document.getElementById('settings-nav');
  if (settingsNav) {
    settingsNav.addEventListener('click', (e) => {
      const btn = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.target).closest('.settings-nav-btn'));
      if (btn && btn.dataset.cat) {
        showSettingsCategory(btn.dataset.cat);
      }
    });
  }
  const btnSettingsBack = document.getElementById('btn-settings-back');
  if (btnSettingsBack) btnSettingsBack.addEventListener('click', showSettingsList);

  // ---- search: rows of every category whose shown text has every typed word ----
  const SEARCH_SKIP = 'select, option, script, style, svg, input, textarea, [data-no-i18n]';
  const searchNorm = (/** @type {string | null | undefined} */ t) => String(t || '').toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  function shownText(/** @type {Element} */ el) {
    let out = '';
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest(SEARCH_SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    while (walk.nextNode()) out += ' ' + walk.currentNode.nodeValue;
    return searchNorm(out);
  }
  function clearSearchMarks() {
    document.querySelectorAll('#view-settings .ss-miss').forEach((n) => n.classList.remove('ss-miss'));
    document.querySelectorAll('#view-settings .settings-search-cat').forEach((n) => n.remove());
  }
  const rowShown = (/** @type {HTMLElement} */ r) => !r.classList.contains('gs-retired') && !r.classList.contains('hidden') && r.style.display !== 'none';
  function runSettingsSearch() {
    const q = searchNorm(settingsSearchInput.value).trim();
    if (settingsSearchClear) settingsSearchClear.classList.toggle('hidden', !q);
    clearSearchMarks();
    if (!q) {
      settingsView.classList.remove('settings-searching');
      if (settingsSearchEmpty) settingsSearchEmpty.classList.add('hidden');
      /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#view-settings .settings-section')).forEach((s) => s.classList.toggle('cat-hidden', s.dataset.cat !== settingsCat));
      refreshStacks();
      return;
    }
    settingsView.classList.add('settings-searching');
    const words = q.split(' ').filter(Boolean);
    const hit = (/** @type {string} */ t) => words.every((w) => t.includes(w));
    // results follow the order of the category list, each under its category's name
    const order = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#settings-nav .settings-nav-btn'))].map((b) => b.dataset.cat);
    const rank = (/** @type {string | undefined} */ c) => { const i = order.indexOf(c); return i < 0 ? 99 : i; };
    const sections = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#view-settings .settings-section'))].sort((x, y) => rank(x.dataset.cat) - rank(y.dataset.cat));
    let total = 0;
    for (const sec of sections) {
      const label = settingsCatLabel(sec.dataset.cat || '');
      const rows = [.../** @type {NodeListOf<HTMLElement>} */ (sec.querySelectorAll('.setting-item'))].filter((r) => !/** @type {HTMLElement} */ (r.parentElement).closest('.setting-item'));
      // a section without rows (Plugins, About) or whose own name matches is shown whole
      const whole = (!rows.length && hit(shownText(sec))) || (!!label && hit(searchNorm(label)));
      const matched = whole ? [] : rows.filter((r) => rowShown(r) && hit(shownText(r)));
      const count = whole ? 1 : matched.length;
      sec.style.order = String(rank(sec.dataset.cat));
      sec.classList.toggle('cat-hidden', !count);
      if (!count) continue;
      total += count;
      if (!whole) {
        const keep = new Set(matched);
        const prune = (/** @type {HTMLElement} */ el) => {
          for (const c of /** @type {HTMLCollectionOf<HTMLElement>} */ (el.children)) {
            if (keep.has(c)) continue;
            if (matched.some((r) => c.contains(r))) prune(c); else c.classList.add('ss-miss');
          }
        };
        prune(sec);
      }
      const head = document.createElement('div');
      head.className = 'settings-search-cat';
      head.textContent = label;
      sec.insertBefore(head, sec.firstChild);
    }
    if (settingsSearchEmpty) settingsSearchEmpty.classList.toggle('hidden', total > 0);
    refreshStacks();
  }
  /** @param {boolean} [silent] */
  function clearSettingsSearch(silent) {
    if (!settingsSearchInput) return;
    settingsSearchInput.value = '';
    if (silent) {
      clearSearchMarks();
      settingsView.classList.remove('settings-searching');
      if (settingsSearchClear) settingsSearchClear.classList.add('hidden');
      if (settingsSearchEmpty) settingsSearchEmpty.classList.add('hidden');
    } else runSettingsSearch();
  }
  if (settingsSearchInput && settingsView) {
    let searchTimer = 0;
    settingsSearchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(runSettingsSearch, 80); });
    settingsSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settingsSearchInput.value) { e.preventDefault(); e.stopPropagation(); clearSettingsSearch(); } });
    if (settingsSearchClear) settingsSearchClear.addEventListener('click', () => { clearSettingsSearch(); settingsSearchInput.focus(); });
  }

  /** @type {UrielSettingsPart} */
  const api = { enterSettings };
  Object.assign(out, api);
};
