// @ts-check
// Custom themes (Settings → Custom themes: CSS files from the themes folder, each with a live preview) and putting
// the enabled ones and the app's own CSS on the page. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielThemesPart} out */
window.UrielApp.themes = function ({ Tm, showToast, refreshCachedThemeColors, clearCssEditor, stopAllPlugins, renderPluginCards }, out) {
  /** @type {{ id: string, name: string, css: string, enabled?: boolean, author?: string, description?: string }[]} */
  let customThemes = [];
  /** @type {string | null} */
  let appCssCache = null;

  function applyCustomStyles() {
    document.querySelectorAll('style[data-uriel-custom]').forEach((n) => n.remove());
    customThemes.filter((t) => t.enabled).forEach((t) => {
      const s = document.createElement('style');
      s.dataset.urielCustom = 'theme';
      s.dataset.themeId = t.id;
      s.textContent = t.css;
      document.head.appendChild(s);
    });
    const userCss = localStorage.getItem('uriel_custom_css') || '';
    if (userCss.trim()) {
      const s = document.createElement('style');
      s.dataset.urielCustom = 'user';
      s.textContent = userCss;
      document.head.appendChild(s);
    }
    if (typeof refreshCachedThemeColors === 'function') refreshCachedThemeColors();
  }

  function resetCustomStyling() {
    const userCss = localStorage.getItem('uriel_custom_css') || '';
    if (userCss.trim()) localStorage.setItem('uriel_custom_css_backup', userCss);
    localStorage.removeItem('uriel_custom_css');
    customThemes.forEach((t) => { t.enabled = false; });
    if (window.electronAPI && window.electronAPI.disableAllThemes) window.electronAPI.disableAllThemes();
    clearCssEditor();
    if (window.electronAPI && window.electronAPI.disableAllPlugins) window.electronAPI.disableAllPlugins();
    stopAllPlugins();
    renderPluginCards();
    applyCustomStyles();
    renderThemeCards();
    showToast(Tm('Custom CSS, themes and plugins reset (Ctrl+Shift+R)'), 'info');
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyR') {
      e.preventDefault();
      e.stopPropagation();
      resetCustomStyling();
    }
  }, true);

  async function mountThemePreview(/** @type {HTMLElement} */ host, /** @type {string} */ themeCss) {
    if (!window.electronAPI || !window.electronAPI.getAppCss) return;
    if (appCssCache === null) appCssCache = (await window.electronAPI.getAppCss()) || '';
    const rewrite = (/** @type {string} */ css) => css
      .replace(/:root/g, ':host')
      .replace(/(^|[\s,{};])html(?![\w-])/g, '$1:host')
      .replace(/(^|[\s,{};])body(?![\w-])/g, '$1.ct-mini');
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.textContent = '';
    const addStyle = (/** @type {string} */ css) => {
      const styleEl = document.createElement('style');
      styleEl.textContent = css;
      root.appendChild(styleEl);
    };
    addStyle('.ct-mini{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;}');
    addStyle(rewrite(appCssCache || ''));
    addStyle(rewrite(themeCss));
    const mini = document.createElement('div');
    mini.className = `ct-mini ${document.body.className}`;
    mini.style.width = `${window.innerWidth}px`;
    mini.style.height = `${window.innerHeight}px`;
    [...document.body.children].forEach((n) => {
      if (/^(SCRIPT|STYLE|LINK)$/.test(n.tagName) || n.classList.contains('modal-backdrop') || n.id === 'css-editor' || n.id === 'custom-bg') return;
      mini.appendChild(n.cloneNode(true));
    });
    mini.querySelectorAll('video, audio, canvas, iframe').forEach((n) => n.remove());
    root.appendChild(mini);
    const fit = () => { const w = host.clientWidth; if (w) mini.style.transform = `scale(${w / window.innerWidth})`; };
    new ResizeObserver(fit).observe(host);
    fit();
  }

  function renderThemeCards() {
    const list = document.getElementById('custom-themes-list');
    if (!list) return;
    list.innerHTML = '';
    if (!customThemes.length) {
      const empty = document.createElement('div');
      empty.className = 'ct-empty';
      empty.textContent = 'No themes yet. Click Add and choose a .css file.';
      empty.dataset.i18n = '';
      list.appendChild(empty);
      return;
    }
    customThemes.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'ct-card';
      card.innerHTML = '<div class="ct-preview"></div><div class="ct-info"><div class="ct-name"></div><div class="ct-meta"></div></div><button class="btn-icon-pill ct-remove" title="Remove" data-i18n-attr="title"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button><button class="effect-switch-btn"><span class="thumb"></span></button>';
      /** @type {HTMLElement} */ (card.querySelector('.ct-name')).textContent = t.name;
      /** @type {HTMLElement} */ (card.querySelector('.ct-meta')).textContent = [t.author && `by ${t.author}`, t.description].filter(Boolean).join(' · ');
      const preview = /** @type {HTMLElement} */ (card.querySelector('.ct-preview'));
      preview.style.aspectRatio = `${window.innerWidth} / ${window.innerHeight}`;
      const toggle = /** @type {HTMLElement} */ (card.querySelector('.effect-switch-btn'));
      toggle.classList.toggle('active', !!t.enabled);
      toggle.addEventListener('click', () => {
        t.enabled = !t.enabled;
        toggle.classList.toggle('active', t.enabled);
        window.electronAPI.setThemeEnabled?.(t.id, t.enabled);
        applyCustomStyles();
      });
      /** @type {HTMLElement} */ (card.querySelector('.ct-remove')).addEventListener('click', () => {
        window.electronAPI.removeTheme?.(t.id);
        customThemes = customThemes.filter((x) => x.id !== t.id);
        applyCustomStyles();
        renderThemeCards();
        showToast(Tm('Theme removed'), 'info');
      });
      list.appendChild(card);
      mountThemePreview(preview, t.css);
    });
  }

  async function loadCustomThemes() {
    if (!window.electronAPI || !window.electronAPI.listThemes) {
      applyCustomStyles();
      return;
    }
    customThemes = await window.electronAPI.listThemes();
    applyCustomStyles();
    renderThemeCards();
  }

  const btnAddTheme = document.getElementById('btn-add-theme');
  const importThemes = window.electronAPI && window.electronAPI.importThemes;
  if (btnAddTheme && importThemes) {
    btnAddTheme.addEventListener('click', async () => {
      const added = await importThemes();
      if (!added.length) return;
      customThemes.push(...added);
      renderThemeCards();
      showToast(added.length > 1 ? Tm('Added {0} themes. Turn one on to try it', added.length) : Tm('Added 1 theme. Turn it on to try it'), 'info');
    });
  }

  /** @type {UrielThemesPart} */
  const api = { applyCustomStyles, loadCustomThemes, renderThemeCards };
  Object.assign(out, api);
};
