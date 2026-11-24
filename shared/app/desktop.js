// @ts-check
// The app window: Windows' global media keys, what the first-run welcome chose, the compact layout on a
// small window, and the mini player window. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielDesktopPart} out */
window.UrielApp.desktop = function ({ handleMediaCommand, onBackgroundChanged, setSiteTheme, showToast, SITE_THEMES, Tm, updateCustomBg }, out) {
  const settingWinMediaKeys = document.getElementById('setting-win-media-keys');
  const btnWinMediaKeys = document.getElementById('btn-win-media-keys');
  const isWindows = (window.electronAPI && typeof window.electronAPI.isWindows === 'boolean')
    ? window.electronAPI.isWindows
    : (navigator.userAgent.includes('Windows') || (navigator.platform && navigator.platform.includes('Win')));

  if (settingWinMediaKeys) {
    settingWinMediaKeys.style.display = isWindows ? '' : 'none';
  }

  // a new key, off by default: the old one was on for everyone, which hid Uriel from the Windows media overlay
  const savedWinMediaKeys = localStorage.getItem('uriel_win_global_media_keys') === 'true';
  if (btnWinMediaKeys) {
    btnWinMediaKeys.classList.toggle('active', savedWinMediaKeys);
    btnWinMediaKeys.addEventListener('click', () => {
      const next = !btnWinMediaKeys.classList.contains('active');
      btnWinMediaKeys.classList.toggle('active', next);
      localStorage.setItem('uriel_win_global_media_keys', next ? 'true' : 'false');
      if (window.electronAPI && window.electronAPI.setMediaKeys) {
        window.electronAPI.setMediaKeys(next);
      }
    });
  }
  if (window.electronAPI && window.electronAPI.setMediaKeys) {
    window.electronAPI.setMediaKeys(savedWinMediaKeys);
  }

  if (window.electronAPI && window.electronAPI.onMediaCommand) {
    window.electronAPI.onMediaCommand((/** @type {string} */ cmd) => handleMediaCommand(cmd, 'ipc'));
  }
  function applyWelcomeResult(/** @type {UrielWelcomeResult | null} */ d) {
    if (!d) return;
    function setSwitch(/** @type {HTMLElement | null} */ btn, /** @type {boolean} */ on) { if (btn && btn.classList.contains('active') !== !!on) btn.click(); }
    const preset = d.theme ? d.theme.preset : '';
    if (d.theme && preset && SITE_THEMES.some((/** @type {UrielSiteTheme} */ t) => t.id === preset)) {
      setSiteTheme(preset);
    } else if (d.theme) {
      const modeBtn = /** @type {HTMLElement} */ (document.querySelector(`.theme-mode-btn[data-theme-mode="${d.theme.b !== undefined && d.theme.b < 50 ? 'dark' : 'light'}"]`));
      if (modeBtn) modeBtn.click();
      const sH = /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-hue'));
      // the sliders apply and save on 'change'; firing only 'input' moved the knob and kept the default theme
      const fire = (/** @type {HTMLInputElement} */ sl) => { sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); };
      if (sH && d.theme.h !== undefined) { sH.value = d.theme.h; fire(sH); }
      const sB = /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-brightness'));
      if (sB && d.theme.b !== undefined) {
        sB.value = String(Math.min(Math.max(d.theme.b, Number(sB.min) || 0), Number(sB.max) || 100));
        fire(sB);
      }
    }
    if (d.toggles) {
      setSwitch(document.getElementById('btn-show-local'), d.toggles.uriel_show_local);
      setSwitch(document.getElementById('btn-search-artists'), d.toggles.uriel_search_artists);
      setSwitch(document.getElementById('btn-no-hand-cursor'), d.toggles.uriel_no_hand_cursor);
      setSwitch(document.getElementById('btn-perf-mode'), d.toggles.uriel_perf_mode);
      if (d.toggles.uriel_custom_bg_enabled && d.background) {
        localStorage.setItem('uriel_bg_url', d.background);
        if (typeof updateCustomBg === 'function') updateCustomBg();
        if (typeof onBackgroundChanged === 'function') onBackgroundChanged('custom', true);
      }
    }
    if (d.spotify && d.spotify.url) {
      const btnOpen = document.getElementById('btn-open-spotify-import');
      if (btnOpen) btnOpen.click();
      const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('spotify-import-url'));
      if (urlInput) urlInput.value = d.spotify.url;
      const targetInput = /** @type {HTMLSelectElement} */ (document.getElementById('spotify-import-target'));
      if (targetInput) targetInput.value = 'new';
      const btnConfirm = document.getElementById('btn-confirm-spotify-import');
      if (btnConfirm) btnConfirm.click();
    }
    showToast(Tm('Welcome to Uriel!'), 'info');
  }
  if (window.electronAPI && window.electronAPI.onWelcomeResult) window.electronAPI.onWelcomeResult((/** @type {UrielWelcomeResult | null} */ d) => applyWelcomeResult(d));

  function checkCompactLayout() {
    // the tiny desktop mini-player window; phones get their own layout instead
    const isMini = window.innerWidth <= 520 && !(window.electronAPI && window.electronAPI.isMobile);
    document.body.classList.toggle('mini', isMini);
  }
  window.addEventListener('resize', checkCompactLayout);
  checkCompactLayout();

  async function toggleMiniWindow() {
    if (window.electronAPI && window.electronAPI.toggleMiniWindow) {
      const isNowMini = await window.electronAPI.toggleMiniWindow();
      // lyrics under the mini player (Riff 43): the window opens tall enough for them
      if (isNowMini && localStorage.getItem('uriel_mini_lyrics') === '1' && window.electronAPI.setMiniLyrics) {
        try { await window.electronAPI.setMiniLyrics(true); } catch (e) {}
      }
    }
  }
  window.toggleMiniWindow = toggleMiniWindow;

  const btnMiniPlayer = document.getElementById('btn-mini-player');
  if (btnMiniPlayer) {
    btnMiniPlayer.addEventListener('click', () => {
      toggleMiniWindow();
    });
  }

  /** @type {UrielDesktopPart} */
  const api = { toggleMiniWindow };
  Object.assign(out, api);
};
