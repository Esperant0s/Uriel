// @ts-check
// Settings that change Uriel's look: hiding the titlebar, intensity on the background, icon packs and the icon on
// the Home button. Part of app.js, which calls this once as it starts, with what it needs.
window.UrielApp = window.UrielApp || {};
window.UrielApp.look = function ({ isPhoneApp, getAdv, setAdv, updateThemeFromState, showToast, escapeHtml, Tm, wireSettingDropdown }) {
  // ---- hide the titlebar (desktop): it slides down when the pointer touches the top edge ----
  (function setupHideTitlebar() {
    const btn = document.getElementById('btn-hide-titlebar');
    const titlebar = document.getElementById('titlebar');
    if (!titlebar) return;
    const zone = document.createElement('div');
    zone.id = 'titlebar-reveal-zone';
    document.body.appendChild(zone);
    let hideTimer = null;
    const peek = (on) => {
      clearTimeout(hideTimer);
      if (on) document.body.classList.add('titlebar-peek');
      else hideTimer = setTimeout(() => document.body.classList.remove('titlebar-peek'), 350);
    };
    zone.addEventListener('mouseenter', () => peek(true));
    zone.addEventListener('mouseleave', () => peek(false));
    titlebar.addEventListener('mouseenter', () => peek(true));
    titlebar.addEventListener('mouseleave', () => peek(false));
    const apply = (on) => {
      document.body.classList.toggle('hide-titlebar', on && !isPhoneApp);
      if (!on) document.body.classList.remove('titlebar-peek');
      if (btn) btn.classList.toggle('active', on);
    };
    apply(localStorage.getItem('uriel_hide_titlebar') === '1');
    if (btn) btn.addEventListener('click', () => {
      const next = !btn.classList.contains('active');
      localStorage.setItem('uriel_hide_titlebar', next ? '1' : '0');
      apply(next);
    });
  })();

  // ---- "Apply intensity to background" (generateM3Palette reads it) ----
  (function setupIntensityBg() {
    const btn = document.getElementById('btn-intensity-bg');
    if (!btn) return;
    btn.classList.toggle('active', getAdv('intensity_bg', false));
    btn.addEventListener('click', () => {
      const next = !btn.classList.contains('active');
      btn.classList.toggle('active', next);
      setAdv('intensity_bg', next);
      updateThemeFromState();
    });
  })();

  // ---- icon packs: other shapes for the rail and the player controls ----
  var REPEAT_ONE_MARK = '<polyline class="repeat-one-mark" points="10.5 10.5 12.5 9 12.5 15" stroke-linecap="round" stroke-linejoin="round"></polyline>';
  var ICON_PACKS = {
    sf: {
      '#nav-discover svg': '<circle cx="12" cy="12" r="9.5"></circle><polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5" fill="currentColor"></polygon>',
      '#nav-favorites svg': '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>',
      '#nav-albums svg': '<circle cx="12" cy="12" r="9.5"></circle><circle cx="12" cy="12" r="3.2"></circle><circle cx="12" cy="12" r="1" fill="currentColor"></circle>',
      '#nav-local svg': '<path d="M2.5 7A2.5 2.5 0 0 1 5 4.5h4.2c.8 0 1.5.4 1.9 1l1.2 1.8c.4.6 1.1 1 1.9 1H19A2.5 2.5 0 0 1 21.5 11v6.5a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5V7z"></path>',
      '#nav-history svg': '<circle cx="12" cy="12" r="9.5"></circle><polyline points="12 6.5 12 12 15.5 14"></polyline>',
      '#nav-queue svg': '<path d="M4 6.5h16M4 12h16M4 17.5h16" stroke-linecap="round"></path>',
      '#nav-settings svg': '<circle cx="12" cy="12" r="3.2"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
      '#btn-shuffle svg': '<path d="M16 4h4v4M4 20l16-16M16 20h4v-4M4 4l5 5m6 6l5 5"></path>',
      '#btn-prev svg': '<polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2.5"></line>',
      '#btn-next svg': '<polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"></line>',
      '#btn-repeat svg': '<path d="M17 2l4 4-4 4M21 6H7a4 4 0 0 0-4 4v2M7 22l-4-4 4-4M3 18h14a4 4 0 0 0 4-4v-2"></path>' + REPEAT_ONE_MARK,
      '#btn-toggle-lyrics-panel svg': '<path d="M9 18V5l12-2v13M9 9l12-2"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
      '#btn-open-settings svg': '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>',
      '#volume-icon': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"></path>'
    },
    lucide: {
      '#nav-discover svg': '<circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>',
      '#nav-favorites svg': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>',
      '#nav-albums svg': '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle><circle cx="12" cy="12" r="1"></circle>',
      '#nav-local svg': '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>',
      '#nav-history svg': '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
      '#nav-queue svg': '<line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="14" y2="17"></line>',
      '#nav-settings svg': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle>',
      '#btn-shuffle svg': '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.6-8.6c.8-1.1 2-1.7 3.3-1.7H22"></path><path d="m18 2 4 4-4 4"></path><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l1.7 2.2"></path><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"></path><path d="m18 14 4 4-4 4"></path>',
      '#btn-prev svg': '<polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"></line>',
      '#btn-next svg': '<polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line>',
      '#btn-repeat svg': '<path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path>' + REPEAT_ONE_MARK,
      '#btn-toggle-lyrics-panel svg': '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
      '#btn-open-settings svg': '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="2" y1="14" x2="6" y2="14"></line><line x1="10" y1="8" x2="14" y2="8"></line><line x1="18" y1="16" x2="22" y2="16"></line>',
      '#volume-icon': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>'
    },
    solar: {
      '#nav-discover svg': '<circle cx="12" cy="12" r="9.5"></circle><polygon points="16 8 13.8 13.8 8 16 10.2 10.2 16 8"></polygon>',
      '#nav-favorites svg': '<path d="M12.62 20.89c-.38.14-.86.14-1.24 0C8.48 19.82 2 15.69 2 8.69A5.69 5.69 0 0 1 7.69 3c1.64 0 3.12.7 4.31 1.83A6.05 6.05 0 0 1 16.31 3 5.69 5.69 0 0 1 22 8.69c0 7-6.48 11.13-9.38 12.2z"></path>',
      '#nav-albums svg': '<circle cx="12" cy="12" r="9.5"></circle><circle cx="12" cy="12" r="3"></circle>',
      '#nav-local svg': '<path d="M2 11c0-2.83 0-4.24.88-5.12C3.76 5 5.17 5 8 5h.5c.78 0 1.43 0 1.98.24.54.23.97.66 1.52 1.48L13 8h3c2.83 0 4.24 0 5.12.88C22 9.76 22 11.17 22 14v2c0 2.83 0 4.24-.88 5.12C20.24 22 18.83 22 16 22H8c-2.83 0-4.24 0-5.12-.88C2 20.24 2 18.83 2 16v-5z"></path>',
      '#nav-history svg': '<circle cx="12" cy="12" r="9.5"></circle><polyline points="12 7 12 12 15 13.5"></polyline>',
      '#nav-queue svg': '<path d="M4 7h16M4 12h16M4 17h11"></path>',
      '#nav-settings svg': '<circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07-1.41 1.41M8.34 17.66l-1.41 1.41m12.14 0-1.41-1.41M8.34 6.34 6.93 4.93"></path>',
      '#btn-shuffle svg': '<polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line>',
      '#btn-prev svg': '<polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2.5"></line>',
      '#btn-next svg': '<polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"></line>',
      '#btn-repeat svg': '<path d="M17 1l4 4-4 4H7a4 4 0 0 0-4 4v1M7 23l-4-4 4-4h10a4 4 0 0 0 4-4v-1"></path>' + REPEAT_ONE_MARK,
      '#btn-toggle-lyrics-panel svg': '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
      '#btn-open-settings svg': '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"></path>',
      '#volume-icon': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>'
    }
  };
  var ICON_PACK_LABELS = { material: 'Google Symbols (Default)', sf: 'iOS / SF Symbols', lucide: 'Lucide Crisp', solar: 'Solar Duotone' };
  function applyIconPack(pack) {
    if (!ICON_PACK_LABELS[pack]) pack = 'material';
    document.body.setAttribute('data-icon-pack', pack);
    const selectors = new Set([...Object.keys(ICON_PACKS.sf), ...Object.keys(ICON_PACKS.lucide), ...Object.keys(ICON_PACKS.solar)]);
    selectors.forEach((sel) => {
      const svg = /** @type {HTMLElement | null} */ (document.querySelector(sel));
      if (!svg) return;
      if (svg.dataset.origSvg === undefined) svg.dataset.origSvg = svg.innerHTML;
      const shape = pack === 'material' ? svg.dataset.origSvg : (ICON_PACKS[pack] && ICON_PACKS[pack][sel]);
      if (shape !== undefined && svg.innerHTML !== shape) svg.innerHTML = shape;
    });
    const label = document.getElementById('icon-pack-label');
    if (label) label.textContent = ICON_PACK_LABELS[pack];
    document.querySelectorAll('#icon-pack-menu .m3-dropdown-option').forEach((/** @type {HTMLElement} */ o) => o.classList.toggle('selected', o.dataset.value === pack));
  }
  applyIconPack(localStorage.getItem('uriel_icon_pack') || 'material');
  wireSettingDropdown('icon-pack', 'uriel_icon_pack', 'material', applyIconPack);

  // ---- the icon on the Home button: the classic glyph, Uriel's app icon or one of its styles, or your own ----
  var HOME_ICONS = [
    { id: 'classic', label: 'Classic' },
    { id: 'uriel', label: 'Uriel', src: 'assets/icon.svg' },
    { id: '01-default', label: 'Default' },
    { id: '02-editor', label: 'Editor' },
    { id: '03-orbit', label: 'Orbit' },
    { id: '04-vinyl', label: 'Vinyl' },
    { id: '06-cosmos', label: 'Cosmos' },
    { id: '07-aurora', label: 'Aurora' },
    { id: '08-sunset', label: 'Sunset' },
    { id: '09-amethyst', label: 'Amethyst' },
    { id: '10-y2k-disc', label: 'Y2K Disc' },
    { id: '11-cassette', label: 'Cassette' },
    { id: '12-invincible', label: 'Invincible' }
  ];
  var homeIconSrc = (val) => {
    if (!val || val === 'classic') return '';
    if (/^(file:|https?:|data:|capacitor:|blob:)/.test(val)) return val;
    const item = HOME_ICONS.find((i) => i.id === val);
    if (!item) return '';
    return item.src || `assets/app-icons/${item.id}.svg`;
  };
  function applyHomeAppIcon(val) {
    const src = homeIconSrc(val);
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById('nav-home-app-icon'));
    const nav = document.getElementById('nav-discover');
    if (img) {
      if (src) img.src = src; else img.removeAttribute('src');
      img.classList.toggle('hidden', !src);
      img.onerror = src ? () => { if (img.getAttribute('src') === src) applyHomeAppIcon('classic'); } : null;
    }
    if (nav) nav.classList.toggle('has-app-icon', !!src);
    document.querySelectorAll('#app-icon-picker-grid .app-icon-option').forEach((/** @type {HTMLElement} */ b) => b.classList.toggle('active', b.dataset.icon === (src ? val : 'classic')));
  }
  function setHomeAppIcon(val) {
    localStorage.setItem('uriel_app_icon', val);
    applyHomeAppIcon(val);
    syncAppIcon(val, true);
  }
  // The app's own icon follows the Home button's: on computers the window, taskbar and Dock icon (any picture,
  // set again at every start), on phones the home-screen icon (one of the styles: phones can't use a picked
  // image, mobile/app-icon.ts). Phones only when picked: iOS says "You have changed the icon" each time.
  async function syncAppIcon(val, picked) {
    if (window.UrielAppIcon) {
      if (!picked) return;
      if (await window.UrielAppIcon.set(val) === 'custom') showToast(Tm('Your own picture shows on the Home button; the phone keeps one of the styles as its app icon'), 'info');
      return;
    }
    const api = window.electronAPI;
    if (!api || !api.setAppIcon) return;
    const src = homeIconSrc(val);
    if (!src) { api.setAppIcon(null); return; }
    if (/^file:/.test(src)) { api.setAppIcon(src); return; }
    try {
      const png = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(img, 0, 0, 256, 256); resolve(c.toDataURL('image/png')); };
        img.onerror = reject;
        img.src = src;
      });
      api.setAppIcon(png);
    } catch (e) { api.setAppIcon(null); }
  }
  (function setupHomeIconPicker() {
    const grid = document.getElementById('app-icon-picker-grid');
    if (grid) {
      const compass = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor"></polygon></svg>';
      grid.innerHTML = HOME_ICONS.map((i) => `<button type="button" class="app-icon-option" data-icon="${i.id}" title="${escapeHtml(i.label)}"><div class="app-icon-option-box">${i.id === 'classic' ? compass : `<img src="${homeIconSrc(i.id)}" alt="" draggable="false" loading="lazy">`}</div><span class="app-icon-option-label">${escapeHtml(i.label)}</span></button>`).join('');
      grid.querySelectorAll('.app-icon-option').forEach((/** @type {HTMLElement} */ b) => b.addEventListener('click', () => setHomeAppIcon(b.dataset.icon)));
    }
    const btnCustom = document.getElementById('btn-pick-custom-home-icon');
    if (btnCustom) {
      if (!window.electronAPI || !window.electronAPI.pickMedia) btnCustom.classList.add('hidden');
      else btnCustom.addEventListener('click', async () => {
        const url = await window.electronAPI.pickMedia();
        if (!url) return;
        if (/\.(mp4|webm)($|\?)/i.test(url)) { showToast('Pick an image for the icon', 'info'); return; }
        setHomeAppIcon(url);
      });
    }
    applyHomeAppIcon(localStorage.getItem('uriel_app_icon') || 'classic');
    syncAppIcon(localStorage.getItem('uriel_app_icon') || 'classic', false);
  })();

  return { applyIconPack };
};
