// @ts-check
// Settings → Interface: what screen readers hear for the switches and sliders, the theme mode, accent and
// scale controls, the font, where the search box sits, and the corner and transparency sliders. Part of
// app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.interfaceSettings = function ({ applyFont, applyScale, applySystemColors, effectiveMode, el, hslToHex, isPhoneApp, refreshCachedThemeColors, resizeCanvases, setSiteTheme, state, updateEngineWidthVar, updateThemeFromState }) {
  // Settings: the switches and sliders are named by the setting they sit in, and a switch says whether it's on
  document.querySelectorAll('.setting-item').forEach((item, i) => {
    const name = item.querySelector('.setting-name');
    if (!name) return;
    if (!name.id) name.id = `setting-name-${i}`;
    item.querySelectorAll('.effect-switch-btn, input[type="range"]').forEach((c) => {
      if (!c.hasAttribute('aria-label') && !c.hasAttribute('aria-labelledby')) c.setAttribute('aria-labelledby', name.id);
    });
  });
  const syncSwitch = (/** @type {HTMLElement} */ b) => b.setAttribute('aria-checked', String(b.classList.contains('active')));
  const switchWatch = new MutationObserver((changes) => changes.forEach((m) => syncSwitch(/** @type {HTMLElement} */ (m.target))));
  document.querySelectorAll('.effect-switch-btn').forEach((b) => {
    b.setAttribute('role', 'switch');
    syncSwitch(/** @type {HTMLElement} */ (b));
    switchWatch.observe(b, { attributes: true, attributeFilter: ['class'] });
  });
  if (state.siteTheme === 'system') applySystemColors();
  window.addEventListener('focus', () => { if (state.siteTheme === 'system') applySystemColors(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.siteTheme === 'system') applySystemColors(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.siteTheme === 'system') applySystemColors(); });

  if (el.themeModeBtns) {
    el.themeModeBtns.forEach((/** @type {HTMLElement} */ btn) => {
      btn.addEventListener('click', () => {
        state.themeMode = btn.dataset.themeMode;
        localStorage.setItem('uriel_theme_mode', state.themeMode);
        // the App themes are all dark: light or auto (cover colors) leaves them; System picks its own mode
        if (state.themeMode !== 'dark' || state.siteTheme === 'system') setSiteTheme('', false);
        updateThemeFromState();
      });
    });
  }

  if (el.themeSwatches) {
    el.themeSwatches.forEach((/** @type {HTMLElement} */ sw) => {
      sw.addEventListener('click', () => {
        state.themeAccent = sw.dataset.color;
        localStorage.setItem('uriel_theme_accent', state.themeAccent);
        setSiteTheme('', false);
        if (state.themeMode === 'auto') {
          const targetMode = effectiveMode() || 'dark';
          state.themeMode = targetMode;
          localStorage.setItem('uriel_theme_mode', targetMode);
        }
        updateThemeFromState();
      });
    });
  }

  if (el.customColorInput) {
    // on change too, not only input: some color pickers send only change, so the color was never saved (Riff 43.1)
    const applyCustomAccent = (/** @type {Event} */ e) => {
      if (!/^#[0-9a-f]{6}$/i.test(/** @type {HTMLInputElement} */ (e.target).value || '')) return;
      state.themeAccent = /** @type {HTMLInputElement} */ (e.target).value.toLowerCase();
      localStorage.setItem('uriel_theme_accent', state.themeAccent);
      setSiteTheme('', false);
      if (state.themeMode === 'auto') {
        const targetMode = effectiveMode() || 'dark';
        state.themeMode = targetMode;
        localStorage.setItem('uriel_theme_mode', targetMode);
      }
      updateThemeFromState();
      if (el.themeSwatches) el.themeSwatches.forEach((/** @type {HTMLElement} */ sw) => sw.classList.remove('active'));
    };
    el.customColorInput.addEventListener('input', applyCustomAccent);
    el.customColorInput.addEventListener('change', applyCustomAccent);
  }

  if (el.sliderHue) {
    el.sliderHue.addEventListener('input', (/** @type {Event} */ e) => {
      const h = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (el.valHue) el.valHue.textContent = h + '°';
      if (el.themeSwatches) el.themeSwatches.forEach((/** @type {HTMLElement} */ sw) => sw.classList.remove('active'));
    });
    el.sliderHue.addEventListener('change', (/** @type {Event} */ e) => {
      const h = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (el.valHue) el.valHue.textContent = h + '°';
      state.themeAccent = hslToHex(h, 55, 50);
      localStorage.setItem('uriel_theme_accent', state.themeAccent);
      setSiteTheme('', false);
      if (state.themeMode === 'auto') {
        const targetMode = effectiveMode() || 'dark';
        state.themeMode = targetMode;
        localStorage.setItem('uriel_theme_mode', targetMode);
      }
      updateThemeFromState();
      if (el.themeSwatches) el.themeSwatches.forEach((/** @type {HTMLElement} */ sw) => sw.classList.remove('active'));
    });
  }

  if (el.sliderIntensity) {
    el.sliderIntensity.addEventListener('input', (/** @type {Event} */ e) => {
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (el.valIntensity) el.valIntensity.textContent = val + '%';
    });
    el.sliderIntensity.addEventListener('change', (/** @type {Event} */ e) => {
      if (state.themeMode === 'auto') return;
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.themeIntensity = val;
      document.body.classList.toggle('intensity-zero', state.themeIntensity < 8);
      if (el.valIntensity) el.valIntensity.textContent = val + '%';
      localStorage.setItem('uriel_theme_intensity', val.toString());
      updateThemeFromState();
    });
  }
  if (el.sliderBrightness) {
    el.sliderBrightness.addEventListener('input', (/** @type {Event} */ e) => {
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (el.valBrightness) el.valBrightness.textContent = val + '%';
    });
    el.sliderBrightness.addEventListener('change', (/** @type {Event} */ e) => {
      if (state.themeMode === 'auto') return;
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.themeBrightness = val;
      if (el.valBrightness) el.valBrightness.textContent = val + '%';
      localStorage.setItem('uriel_theme_brightness', val.toString());
      updateThemeFromState();
    });
  }

  if (el.sliderScale) {
    el.sliderScale.addEventListener('input', (/** @type {Event} */ e) => {
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.uiScale = val;
      if (el.valScale) el.valScale.textContent = `${val}%`;
    });
    el.sliderScale.addEventListener('change', (/** @type {Event} */ e) => {
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.uiScale = val;
      if (el.valScale) el.valScale.textContent = `${val}%`;
      localStorage.setItem('devsize_ui_scale', val.toString());
      requestAnimationFrame(() => {
        applyScale(val);
        requestAnimationFrame(resizeCanvases);
      });
    });
  }

  if (el.sliderFontScale) {
    el.sliderFontScale.addEventListener('input', (/** @type {Event} */ e) => {
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (el.valFontScale) el.valFontScale.textContent = `${val}%`;
      document.documentElement.style.setProperty('--font-scale', ((val / 100) * 0.95 * 1.25).toString());
      localStorage.setItem('uriel_font_scale', val.toString());
      requestAnimationFrame(updateEngineWidthVar);
    });
  }

  const fontOptGoogle = document.getElementById('font-opt-google');
  const fontOptSf = document.getElementById('font-opt-sf');
  const fontOptSystem = document.getElementById('font-opt-system');

  [
    { btn: fontOptGoogle, key: 'google' },
    { btn: fontOptSf, key: 'sf' },
    { btn: fontOptSystem, key: 'system' }
  ].forEach(({ btn, key }) => {
    if (btn) {
      btn.addEventListener('click', () => {
        localStorage.setItem('uriel_font', key);
        applyFont(key);
      });
    }
  });
  applyFont(state.riffFont);

  // A window too narrow to centre the search box beside the engine buttons: .search-crowded moves it to the left
  // (styles.css), where it ran under the buttons before. Checked on resize and when the buttons change size.
  (() => {
    const topNav = document.querySelector('.top-nav');
    if (!topNav || !window.ResizeObserver || isPhoneApp) return;
    const fit = () => {
      const engine = parseFloat(getComputedStyle(document.body).getPropertyValue('--engine-w')) || 0;
      topNav.classList.toggle('search-crowded', topNav.clientWidth - (engine + 36) * 2 < 260);
    };
    new ResizeObserver(fit).observe(topNav);
    new MutationObserver(fit).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    fit();
  })();

  function applySearchPos(/** @type {string | undefined} */ wanted) {
    let pos = wanted || '';
    if (!['left', 'middle', 'right'].includes(pos)) pos = 'middle';
    const topNav = document.querySelector('.top-nav');
    if (topNav) {
      topNav.classList.remove('search-pos-left', 'search-pos-middle', 'search-pos-right');
      topNav.classList.add(`search-pos-${pos}`);
    }
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('select-search-pos'));
    if (select) select.value = pos;
    const label = document.getElementById('search-pos-label');
    if (label) label.textContent = pos.charAt(0).toUpperCase() + pos.slice(1);
    const menu = document.getElementById('search-pos-menu');
    if (menu) {
      /** @type {NodeListOf<HTMLElement>} */ (menu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
        opt.classList.toggle('selected', opt.dataset.value === pos);
      });
    }
  }

  const savedSearchPos = localStorage.getItem('uriel_search_pos') || 'middle';
  applySearchPos(savedSearchPos);

  const searchPosDropdown = document.getElementById('search-pos-dropdown');
  const searchPosTrigger = document.getElementById('search-pos-trigger');
  const searchPosMenu = document.getElementById('search-pos-menu');
  if (searchPosDropdown && searchPosTrigger && searchPosMenu) {
    searchPosTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      searchPosDropdown.classList.toggle('open');
    });

    /** @type {NodeListOf<HTMLElement>} */ (searchPosMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        localStorage.setItem('uriel_search_pos', String(val));
        applySearchPos(val);
        searchPosDropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', () => {
      searchPosDropdown.classList.remove('open');
    });
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let navResizeTimer = null;
  window.addEventListener('resize', () => {
    document.body.classList.add('is-window-resizing');
    if (navResizeTimer) clearTimeout(navResizeTimer);
    navResizeTimer = setTimeout(() => {
      document.body.classList.remove('is-window-resizing');
      updateEngineWidthVar();
    }, 120);
  });

  setTimeout(() => {
    updateEngineWidthVar();
    document.body.classList.remove('no-nav-transition');
  }, 50);

  if (el.sliderCornerRadius) {
    el.sliderCornerRadius.addEventListener('input', (/** @type {Event} */ e) => {
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (el.valCornerRadius) el.valCornerRadius.textContent = val === 16 ? 'Default' : `${val}px`;
      document.documentElement.style.setProperty('--md-shape-corner-l', `${val}px`);
      document.documentElement.style.setProperty('--md-shape-corner-m', `${Math.max(0, val - 4)}px`);
      localStorage.setItem('uriel_corner_radius', val.toString());
    });
  }

  if (el.sliderUiAlpha) {
    el.sliderUiAlpha.addEventListener('input', (/** @type {Event} */ e) => {
      const val = Math.max(20, Math.min(100, parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10) || 100));
      if (el.valUiAlpha) el.valUiAlpha.textContent = `${val}%`;
      document.documentElement.style.setProperty('--ui-alpha', `${val}%`);
      localStorage.setItem('uriel_ui_alpha', val.toString());
      refreshCachedThemeColors();
    });
  }

  if (el.btnResetUiAlpha) {
    el.btnResetUiAlpha.addEventListener('click', () => {
      const val = 100;
      if (el.sliderUiAlpha) el.sliderUiAlpha.value = String(val);
      if (el.valUiAlpha) el.valUiAlpha.textContent = `${val}%`;
      document.documentElement.style.setProperty('--ui-alpha', `${val}%`);
      localStorage.setItem('uriel_ui_alpha', val.toString());
      refreshCachedThemeColors();
    });
  }

  if (el.sliderTextAlpha) {
    el.sliderTextAlpha.addEventListener('input', (/** @type {Event} */ e) => {
      const val = Math.max(1, Math.min(100, parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10) || 100));
      if (el.valTextAlpha) el.valTextAlpha.textContent = `${val}%`;
      document.documentElement.style.setProperty('--text-alpha', `${val}%`);
      localStorage.setItem('uriel_text_alpha', val.toString());
      refreshCachedThemeColors();
    });
  }

  if (el.btnResetTextAlpha) {
    el.btnResetTextAlpha.addEventListener('click', () => {
      const val = 100;
      if (el.sliderTextAlpha) el.sliderTextAlpha.value = String(val);
      if (el.valTextAlpha) el.valTextAlpha.textContent = `${val}%`;
      document.documentElement.style.setProperty('--text-alpha', `${val}%`);
      localStorage.setItem('uriel_text_alpha', val.toString());
      refreshCachedThemeColors();
    });
  }
};
