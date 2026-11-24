// @ts-check
// Settings → Theme → App theme: one card per website theme with its colours as a strip, and the System theme,
// which takes the accent the computer or phone uses. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielThemeCardsPart} out */
window.UrielApp.themeCards = function ({ activeSiteTheme, SITE_THEMES, smoothThemeSwap, state, syncSiteThemeCards, updateThemeFromState }, out) {
  // Settings → Theme → App theme: one card per SITE_THEMES entry, with its colors as a strip
  function renderSiteThemeCards() {
    const grid = document.getElementById('site-theme-grid');
    if (!grid || grid.childElementCount) return;
    const frag = document.createDocumentFragment();
    // first, the computer's or phone's own colors (setSiteTheme('system')): its strip is painted once they're known
    const sys = document.createElement('button');
    sys.type = 'button';
    sys.className = 'site-theme-card';
    sys.dataset.siteTheme = 'system';
    sys.setAttribute('aria-pressed', 'false');
    sys.innerHTML = '<span class="site-theme-strip" aria-hidden="true"></span><span class="site-theme-name" data-i18n>System</span><span class="site-theme-tag" data-i18n>Your device\'s colors, dark or light</span>';
    sys.addEventListener('click', () => useSystemTheme());
    frag.appendChild(sys);
    paintSystemStrip(sys);
    SITE_THEMES.forEach((/** @type {UrielSiteTheme} */ t) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'site-theme-card';
      card.dataset.siteTheme = t.id;
      card.setAttribute('aria-pressed', 'false');
      card.innerHTML = '<span class="site-theme-strip" aria-hidden="true"></span><span class="site-theme-name"></span><span class="site-theme-tag"></span>';
      /** @type {HTMLElement} */ (card.querySelector('.site-theme-strip')).append(...[t.bg, t.bg3, t.accent2, t.accent, t.pop].map((c) => {
        const sw = document.createElement('span');
        sw.style.background = c;
        return sw;
      }));
      /** @type {HTMLElement} */ (card.querySelector('.site-theme-name')).textContent = t.name;
      /** @type {HTMLElement} */ (card.querySelector('.site-theme-tag')).textContent = t.tag;
      card.addEventListener('click', () => setSiteTheme(t.id));
      frag.appendChild(card);
    });
    grid.appendChild(frag);
    syncSiteThemeCards();
  }
  // id '' goes back to the accent-only palette; `apply` false when the caller repaints the theme itself
  function setSiteTheme(/** @type {string} */ id, apply = true) {
    if (id === 'system') {
      state.siteTheme = 'system';
      try { localStorage.setItem('uriel_site_theme', 'system'); } catch (e) {}
      if (apply) applySystemColors();
      return;
    }
    const t = SITE_THEMES.find((/** @type {UrielSiteTheme} */ x) => x.id === id);
    state.siteTheme = t ? t.id : '';
    try { localStorage.setItem('uriel_site_theme', state.siteTheme); } catch (e) {}
    if (!t || !apply) return;
    state.themeAccent = t.accent;
    localStorage.setItem('uriel_theme_accent', t.accent);
    if (state.themeMode !== 'dark') {
      state.themeMode = 'dark';
      localStorage.setItem('uriel_theme_mode', 'dark');
    }
    smoothThemeSwap(updateThemeFromState);
  }
  window.setSiteTheme = setSiteTheme;

  // The System app theme: the accent the computer or phone uses (Windows, macOS, GNOME, Material You on Android 12+,
  // the system blue on iPhones) and its dark or light mode, read again whenever Uriel comes back to the front
  async function systemColors() {
    const api = window.electronAPI;
    let c = null;
    try { c = api && api.getSystemColors ? await api.getSystemColors() : null; } catch (e) {}
    return {
      dark: c && typeof c.dark === 'boolean' ? c.dark : matchMedia('(prefers-color-scheme: dark)').matches,
      // nothing to go by (an older Android, a Linux desktop without accents): GNOME's blue
      accent: (c && c.accent) || '#3584e4',
    };
  }
  async function paintSystemStrip(/** @type {HTMLElement} */ card) {
    const { dark, accent } = await systemColors();
    const strip = /** @type {HTMLElement} */ (card.querySelector('.site-theme-strip'));
    strip.replaceChildren(...[dark ? '#121212' : '#f5f5f5', dark ? '#2a2a2a' : '#e0e0e0', accent, accent, dark ? '#ffffff' : '#000000'].map((c) => {
      const sw = document.createElement('span');
      sw.style.background = c;
      return sw;
    }));
  }
  async function applySystemColors() {
    const { dark, accent } = await systemColors();
    const mode = dark ? 'dark' : 'light';
    if (state.siteTheme !== 'system' || (state.themeAccent === accent && state.themeMode === mode)) { syncSiteThemeCards(); return; }
    state.themeAccent = accent;
    state.themeMode = mode;
    localStorage.setItem('uriel_theme_accent', accent);
    localStorage.setItem('uriel_theme_mode', mode);
    smoothThemeSwap(updateThemeFromState);
  }
  // picking System shows the device's accent as it is: at intensity 0 every accent comes out grey
  function useSystemTheme() {
    if (state.siteTheme !== 'system' && state.themeIntensity < 60) {
      state.themeIntensity = 100;
      localStorage.setItem('uriel_theme_intensity', '100');
    }
    setSiteTheme('system');
  }
  renderSiteThemeCards();

  /** @type {UrielThemeCardsPart} */
  const api = { setSiteTheme, applySystemColors };
  Object.assign(out, api);
};
