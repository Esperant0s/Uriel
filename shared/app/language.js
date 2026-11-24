// @ts-check
// Settings → Interface → Language: the picker of the UI language (i18n.js does the translating).
// Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.language = function ({ I18N, TRANSLATION_LANGUAGES, Tm, showToast }) {
  /** @type {{ code: string, name: string, flag: string }[]} */
  const languages = TRANSLATION_LANGUAGES;
  // The list stays in English names with flags and is never translated, so the way back is always readable.
  const uiLangDropdown = document.getElementById('ui-lang-dropdown');
  const uiLangTrigger = document.getElementById('ui-lang-trigger');
  const uiLangLabel = document.getElementById('ui-lang-label');
  const uiLangMenu = document.getElementById('ui-lang-menu');
  const uiLangList = document.getElementById('ui-lang-list');
  const uiLangSearch = /** @type {HTMLInputElement} */ (document.getElementById('ui-lang-search'));
  const uiLangText = (/** @type {{ flag: string, name: string, code: string }} */ item) => `${item.flag} ${item.name} (${item.code})`;

  if (uiLangDropdown && uiLangTrigger && uiLangMenu && uiLangList) {
    const showUiLang = (/** @type {string} */ code) => {
      const found = languages.find((l) => l.code === code) || languages.find((l) => l.code === 'en');
      if (uiLangLabel && found) uiLangLabel.textContent = uiLangText(found);
      /** @type {NodeListOf<HTMLElement>} */ (uiLangList.querySelectorAll('.m3-dropdown-option')).forEach((o) => o.classList.toggle('selected', o.dataset.value === code));
    };
    let uiLangPick = 0;
    const frag = document.createDocumentFragment();
    languages.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'm3-dropdown-option';
      btn.dataset.value = item.code;
      btn.textContent = uiLangText(item);
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        uiLangDropdown.classList.remove('open');
        if (item.code === I18N.lang) return;
        const pick = ++uiLangPick;
        showUiLang(item.code);
        // the arrow turns while the words are on their way
        uiLangTrigger.classList.add('is-busy');
        const ok = await I18N.setLang(item.code);
        if (pick !== uiLangPick) return;
        uiLangTrigger.classList.remove('is-busy');
        if (!ok) showToast(Tm("Couldn't reach the translation service. What is missing stays in English for now."), 'warning');
      });
      frag.appendChild(btn);
    });
    uiLangList.appendChild(frag);
    showUiLang(I18N.lang);
    // also when something else switched (window.applyI18n from a plugin)
    window.addEventListener('uriel:i18n', () => showUiLang(I18N.lang));

    if (uiLangSearch) {
      uiLangSearch.addEventListener('click', (e) => e.stopPropagation());
      uiLangSearch.addEventListener('input', (e) => {
        const q = /** @type {HTMLInputElement} */ (e.target).value.toLowerCase().trim();
        /** @type {NodeListOf<HTMLElement>} */ (uiLangList.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
          const text = (opt.textContent || '').toLowerCase();
          const code = (opt.dataset.value || '').toLowerCase();
          opt.style.display = (!q || text.includes(q) || code.includes(q)) ? '' : 'none';
        });
      });
      uiLangSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          uiLangDropdown.classList.remove('open');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const firstVisible = /** @type {HTMLElement} */ (uiLangList.querySelector('.m3-dropdown-option:not([style*="display: none"])'));
          if (firstVisible) firstVisible.click();
        }
      });
    }

    uiLangTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = uiLangDropdown.classList.toggle('open');
      if (isOpen && uiLangSearch) {
        uiLangSearch.value = '';
        /** @type {NodeListOf<HTMLElement>} */ (uiLangList.querySelectorAll('.m3-dropdown-option')).forEach((opt) => { opt.style.display = ''; });
        const sel = uiLangList.querySelector('.m3-dropdown-option.selected');
        if (sel) uiLangList.scrollTop = Math.max(0, sel.getBoundingClientRect().top - uiLangList.getBoundingClientRect().top - uiLangList.clientHeight / 2);
        setTimeout(() => uiLangSearch.focus(), 50);
      }
    });

    document.addEventListener('click', () => {
      uiLangDropdown.classList.remove('open');
    });
  }
};
