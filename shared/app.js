// @ts-check
document.addEventListener('DOMContentLoaded', async () => {
  // playlists, favorites and history are read from IndexedDB before anything uses them (library-store.js)
  try { if (window.UrielLibraryStore) await window.UrielLibraryStore.ready; } catch (e) {}
  await libraryUnavailableScreen();
  try { localStorage.removeItem('uriel_stats'); } catch (e) {}

  const THUMB_FALLBACK = "if(window.urielArtNext){window.urielArtNext(this)}else if(this.dataset.full&&this.src!==this.dataset.full){this.src=this.dataset.full}else{this.style.visibility='hidden'}";

  function escapeHtml(/** @type {unknown} */ value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const LiquidMotion = {
    setAnchor(/** @type {HTMLElement} */ element, /** @type {HTMLElement | null} */ triggerEl, axis = 'x') {
      if (!element) return;
      if (triggerEl) {
        const rect = triggerEl.getBoundingClientRect();
        const parentRect = element.parentElement ? element.parentElement.getBoundingClientRect() : { top: 0, left: 0 };
        if (axis === 'x') {
          const anchorY = (rect.top + rect.height / 2) - parentRect.top;
          element.style.setProperty('--liquid-anchor-y', `${anchorY}px`);
          element.style.setProperty('--liquid-anchor-x', '0px');
          element.style.transformOrigin = `0px ${anchorY}px`;
        } else {
          const anchorX = (rect.left + rect.width / 2) - parentRect.left;
          element.style.setProperty('--liquid-anchor-x', `${anchorX}px`);
          element.style.setProperty('--liquid-anchor-y', '0px');
          element.style.transformOrigin = `${anchorX}px 0px`;
        }
      } else {
        if (axis === 'x') {
          element.style.setProperty('--liquid-anchor-y', '50%');
          element.style.setProperty('--liquid-anchor-x', '0px');
          element.style.transformOrigin = '0px 50%';
        } else {
          element.style.setProperty('--liquid-anchor-x', '50%');
          element.style.setProperty('--liquid-anchor-y', '0px');
          element.style.transformOrigin = '50% 0px';
        }
      }
    },
    /** @param {HTMLElement} element @param {HTMLElement | null} triggerEl @param {string} [axis] @param {() => void} [onDone] */
    open(element, triggerEl, axis = 'x', onDone) {
      if (!element) return;
      this.setAnchor(element, triggerEl, axis);
      element.classList.remove('liquid-closing');
      element.classList.add('liquid-surface', `liquid-${axis}`, 'liquid-open');
      if (onDone) setTimeout(onDone, 480);
    },
    /** @param {HTMLElement} element @param {() => void} [onDone] */
    close(element, onDone) {
      if (!element) return;
      element.classList.add('liquid-closing');
      element.classList.remove('liquid-open');
      setTimeout(() => {
        element.classList.remove('liquid-closing', 'liquid-open');
        if (onDone) onDone();
      }, 300);
    }
  };
  window.LiquidMotion = LiquidMotion;


  function injectM3Shapes() {
    const defs = document.getElementById('m3-dynamic-defs');
    if (!defs) return;

    const formulas = {
      'm3-cookie-4': (/** @type {number} */ a) => 40 + 6 * Math.cos(4 * a),
                          'm3-diamond-puffy': (/** @type {number} */ a) => 36 + 10 * Math.cos(4 * a),
                          'm3-flower': (/** @type {number} */ a) => 28 + 18 * Math.abs(Math.cos(4 * a)),
                          'm3-poly-6': (/** @type {number} */ a) => {
                            let t = a % (2 * Math.PI / 6);
                            if (t < 0) t += 2 * Math.PI / 6;
                            return 36 / Math.cos(t - Math.PI / 6);
                          },
                          'm3-leaf-4': (/** @type {number} */ a) => 40 + 6 * Math.cos(4 * a)
    };

    let html = '';
    for (const [id, formula] of Object.entries(formulas)) {
      let path = '';
      const res = 120;
      for (let i = 0; i <= res; i++) {
        const angle = (i / res) * 2 * Math.PI;
        const r = formula(angle);
        const x = 0.5 + (r * Math.cos(angle)) / 100;
        const y = 0.5 + (r * Math.sin(angle)) / 100;
        path += `${i === 0 ? 'M' : 'L'} ${x.toFixed(4)},${y.toFixed(4)} `;
      }
      path += 'Z';
      html += `<clipPath id="${id}" clipPathUnits="objectBoundingBox"><path d="${path}" /></clipPath>`;
    }
    defs.insertAdjacentHTML('beforeend', html);
  }
  injectM3Shapes();

  // UI language (i18n.js): T('English') now, Tf('{0} songs', n) with values that are never translated,
  // Tm(...) for a toast or I18N.text(el, ...) that keep up when the translation comes in or the language changes.
  // Only literal strings go in: anything from the library or typed by someone goes into the {0} slots.
  const I18N = window.UrielI18n || { T: (/** @type {string} */ s) => s, Tf: (/** @type {string} */ s, /** @type {unknown[]} */ ...a) => String(s).replace(/\{(\d)\}/g, (_, i) => (a[i] != null ? String(a[i]) : '')), lang: 'en', text: (/** @type {HTMLElement} */ el, /** @type {string} */ s, /** @type {unknown[]} */ ...a) => { if (el) el.textContent = String(s).replace(/\{(\d)\}/g, (_, i) => (a[i] != null ? String(a[i]) : '')); }, ready: () => Promise.resolve(), connect() {}, setLang: async () => true, refresh() {} };
  if (!I18N.Tm) I18N.Tm = (/** @type {string} */ s, /** @type {unknown[]} */ ...a) => ({ i18n: String(s), args: a, toString() { return I18N.Tf(this.i18n, ...this.args); } });
  const T = (/** @type {string} */ s) => I18N.T(s);
  const Tf = (/** @type {string} */ s, /** @type {unknown[]} */ ...args) => I18N.Tf(s, ...args);
  /** @returns {UrielI18nMessage} */
  const Tm = (/** @type {string} */ s, /** @type {unknown[]} */ ...args) => I18N.Tm(s, ...args);
  // what upstream Riff (and plugins written for it) call
  window.t = T;
  window.applyI18n = (lang) => I18N.setLang(lang);
  // shown often but not on the page until then (a song's menu, everyday messages): asked for along with the page
  if (I18N.known) I18N.known(['Play next', 'Add to queue', 'Add to playlist…', 'Add to favorites', 'Remove from favorites', 'Go to artist',
    'Download…', 'Remove from playlist', 'Playing next', 'Added to queue', 'Already in the queue', 'Added to "{0}"', 'Already in "{0}"',
    'Added {0} songs to "{1}"', 'Playlist deleted', 'Link copied{0}', 'Removed from library', 'Could not play this song. Try again or skip.',
    'Offline: connect to the internet to search new songs', 'No matching songs. Try a different search', 'Search for "{0}"', 'Actions',
    'Playlists', 'Favorites', 'In playlists', 'Queue', 'History', 'Library', 'Online', 'Discover', 'View', 'Audio', 'Your stats',
    'Repeat: playlist', 'Repeat: this song', 'Start radio', 'Radio · {0}', 'Radio · {0} and {1} more', 'Sleep timer: {0} min', 'Sleep timer: end of song']);

  /** @type {{ message: UrielText, type: string, duration: number | null }[]} */
  const toastQueue = [];
  const MAX_QUEUED_TOASTS = 10;
  let isToastActive = false;

  // message: a string as it is (it is not translated: it may hold a song title), or Tm('...', ...) to translate
  function showToast(/** @type {UrielText | null | undefined} */ message, type = 'info', /** @type {number | null} */ duration = null) {
    if (!message) return;
    if (toastQueue.length >= MAX_QUEUED_TOASTS) {
      toastQueue.shift();
    }
    toastQueue.push({ message, type, duration });
    if (!isToastActive) {
      // a message in another language waits a moment for its words, instead of showing up in English
      if (typeof message !== 'string' && message.i18n && I18N.lang !== 'en') {
        isToastActive = true;
        I18N.ready(message.i18n).then(processToastQueue);
      } else {
        processToastQueue();
      }
    }
  }

  function processToastQueue() {
    if (toastQueue.length === 0) {
      isToastActive = false;
      return;
    }
    isToastActive = true;
    const container = document.getElementById('toast-container');
    if (!container) {
      toastQueue.length = 0;
      isToastActive = false;
      return;
    }
    const { message, type, duration } = /** @type {typeof toastQueue[number]} */ (toastQueue.shift());

    const toast = document.createElement('div');
    toast.className = `uriel-toast ${type}${duration ? ' wide' : ''}`;

    let iconSvg = '';
    if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="14"/><line x1="12" y1="19" x2="12.01" y2="19"/></svg>';
    } else if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><polyline points="5 12.5 10 17.5 19 7.5"/></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    }

    const cleanMessage = String(message).charAt(0).toUpperCase() + String(message).slice(1);

    toast.innerHTML = `
      ${iconSvg ? `<span class="toast-icon">${iconSvg}</span>` : ''}
      <span class="toast-text">${escapeHtml(cleanMessage)}</span>
    `;
    if (typeof message !== 'string' && message.i18n) I18N.text(toast.querySelector('.toast-text'), message);

    container.appendChild(toast);

    let dismissed = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    let remaining = duration || 3500;
    let startTimestamp = Date.now();

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      if (timer) clearTimeout(timer);
      toast.classList.add('leaving');
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        toast.remove();
        processToastQueue();
      };
      toast.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 320);
    };

    const startTimer = (/** @type {number} */ dur) => {
      startTimestamp = Date.now();
      timer = setTimeout(dismiss, dur);
    };

    toast.addEventListener('mouseenter', () => {
      if (timer) clearTimeout(timer);
      remaining -= (Date.now() - startTimestamp);
      if (remaining < 500) remaining = 500;
    });

    toast.addEventListener('mouseleave', () => {
      if (!dismissed) {
        startTimer(remaining);
      }
    });

    toast.addEventListener('click', dismiss);

    startTimer(remaining);
  }

  if (localStorage.getItem('uriel_scale_rebased_v2') !== '1') {
    localStorage.setItem('uriel_scale_rebased_v2', '1');
    if (localStorage.getItem('devsize_ui_scale') === '90') {
      localStorage.removeItem('devsize_ui_scale');
    }
    if (localStorage.getItem('uriel_font_scale') === '95') {
      localStorage.removeItem('uriel_font_scale');
    }
  }

  const savedScale = parseFloat(localStorage.getItem('devsize_ui_scale') || '100');
  applyScale(savedScale);

  function applyScale(/** @type {number} */ scalePercent) {
    const factor = (scalePercent / 100) * 0.90;
    document.documentElement.style.setProperty('--app-scale', factor.toString());
    if (window.electronAPI && window.electronAPI.setZoomFactor) {
      window.electronAPI.setZoomFactor(factor);
    } else {
      document.body.style.zoom = String(factor);
    }
  }

  window.addEventListener('scroll', () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  }, { passive: true });

  function openModal(/** @type {HTMLElement | null} */ elModal) {
    if (!elModal) return;
    if (elModal._closeTimer) { clearTimeout(elModal._closeTimer); elModal._closeTimer = null; }
    elModal.classList.remove('hidden');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        elModal.classList.add('visible');
      });
    });
  }

  function closeModal(/** @type {HTMLElement | null} */ elModal) {
    if (!elModal) return;
    elModal.classList.remove('visible');
    if (elModal._closeTimer) clearTimeout(elModal._closeTimer);
    elModal._closeTimer = setTimeout(() => {
      elModal._closeTimer = null;
      elModal.classList.add('hidden');
    }, 200);
  }

  const defaultPresets = [
    { id: 'p_default', name: 'default', settings: { speed: 1.0, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_speedup', name: 'speed up (orig pitch)', settings: { speed: 1.35, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_speedup_pitch', name: 'speed up (tape pitch)', settings: { speed: 1.0, speedPitch: 1.30, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_slowed', name: 'slowed + reverb', settings: { speed: 1.0, speedPitch: 0.82, pitch: 0, reverb: 65, distortion: 0, volume: 1.0, echo: 15, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_nightcore', name: 'nightcore', settings: { speed: 1.0, speedPitch: 1.25, pitch: 0, reverb: 20, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_distortion', name: 'distortion hard', settings: { speed: 1.0, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 75, volume: 1.25, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } }
  ];

  const defaultVfx = {
    ambientGlow: true,
    bassPulse: false,
    vinylSpin: false,
    soundwaveRings: false,
    borderGlow: false,
    particles: false,
    backdropBlur: false,
    crt: false,
    grain: false,
    lyricsSpotlight: false
  };

  function normalizePreset(/** @type {UrielPreset} */ p) {
    if (!p) return null;
    // a preset file can have it all wrong: every value is checked below
    const s = /** @type {Record<string, unknown>} */ (p.settings || p.values || {});
    const eq = /** @type {{ low?: unknown, mid?: unknown, high?: unknown }} */ (s.eq || {});
    return {
      id: p.id,
      name: p.name || 'preset',
      settings: {
        speed: typeof s.speed === 'number' ? s.speed : 1.0,
        speedPitch: typeof s.speedPitch === 'number' ? s.speedPitch : 1.0,
        pitch: typeof s.pitch === 'number' ? s.pitch : (typeof s.pitchSemitones === 'number' ? s.pitchSemitones : 0),
                          reverb: typeof s.reverb === 'number' ? s.reverb : 0,
                          distortion: typeof s.distortion === 'number' ? s.distortion : 0,
                          volume: typeof s.volume === 'number' ? s.volume : (typeof s.gain === 'number' ? s.gain : 1.0),
                          echo: typeof s.echo === 'number' ? s.echo : 0,
                          eq: {
                            low: typeof eq.low === 'number' ? eq.low : 0,
                            mid: typeof eq.mid === 'number' ? eq.mid : 0,
                            high: typeof eq.high === 'number' ? eq.high : 0
                          },
                          eqBands: Array.isArray(s.eqBands) && s.eqBands.length === 10 ? s.eqBands.map((/** @type {unknown} */ v) => typeof v === 'number' ? v : 0) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      }
    };
  }

  function safeJson(/** @type {string} */ key, /** @type {unknown} */ fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function safeArray(/** @type {string} */ key) {
    const value = safeJson(key, []);
    return Array.isArray(value) ? value : [];
  }

  const rawCustomPresets = safeArray('devsize_custom_presets');
  const normalizedCustomPresets = rawCustomPresets.map(normalizePreset).filter(Boolean);

  const savedVolumeRaw = parseFloat(localStorage.getItem('uriel_volume') || '');
  const savedVolume = Number.isFinite(savedVolumeRaw) ? Math.max(0, Math.min(1, savedVolumeRaw)) : 0.85;

  const DEFAULT_AUDIO_SETTINGS = { speed: 1.0, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  const DEFAULT_HQ_SETTINGS = { engine: 'hqmusic-3', preset: 'studio', vocal: 0, air: 0, bass: 0 };
  // on unless switched off: speed, pitch and effects reset every launch was mistaken for a bug (issue #5)
  let soundPersistenceEnabled = localStorage.getItem('uriel_persist_sound_settings') !== '0';

  function loadSoundSettings() {
    if (!soundPersistenceEnabled) {
      return {
        audioSettings: { ...DEFAULT_AUDIO_SETTINGS, eq: { ...DEFAULT_AUDIO_SETTINGS.eq }, eqBands: [...DEFAULT_AUDIO_SETTINGS.eqBands] },
        hqEnabled: false,
        hqSettings: { ...DEFAULT_HQ_SETTINGS }
      };
    }
    const savedAudio = safeJson('uriel_audio_settings', null);
    const savedHq = safeJson('uriel_hq_settings', null);
    const audioObj = savedAudio && typeof savedAudio === 'object' ? savedAudio : {};
    const hqObj = savedHq && typeof savedHq === 'object' ? savedHq : {};
    return {
      audioSettings: {
        ...DEFAULT_AUDIO_SETTINGS,
        ...audioObj,
        eq: { ...DEFAULT_AUDIO_SETTINGS.eq, ...(audioObj.eq && typeof audioObj.eq === 'object' ? audioObj.eq : {}) },
        eqBands: Array.isArray(audioObj.eqBands) && audioObj.eqBands.length === 10 ? audioObj.eqBands.map((/** @type {unknown} */ v) => typeof v === 'number' ? v : 0) : [...DEFAULT_AUDIO_SETTINGS.eqBands]
      },
      hqEnabled: localStorage.getItem('uriel_hq_enabled') === '1',
      hqSettings: { ...DEFAULT_HQ_SETTINGS, ...hqObj }
    };
  }

  const savedSound = loadSoundSettings();

  const SF_FONT_STACK = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif`;

  function ensureSfFontLoaded() {
    if (!document.getElementById('font-sf-pro')) {
      const link = document.createElement('link');
      link.id = 'font-sf-pro';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.cdnfonts.com/css/sf-pro-display';
      document.head.appendChild(link);
    }
  }

  function applyFont(/** @type {string | undefined} */ font) {
    const f = (typeof font === 'string' && font) ? font : (localStorage.getItem('uriel_font') || 'google');
    if (typeof state !== 'undefined' && state) {
      state.riffFont = f;
    }
    if (f === 'sf') {
      ensureSfFontLoaded();
      document.documentElement.style.setProperty('--font-family', SF_FONT_STACK);
    } else if (f === 'system') {
      document.documentElement.style.setProperty('--font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
    } else {
      document.documentElement.style.removeProperty('--font-family');
    }
    const fontOptGoogle = document.getElementById('font-opt-google');
    const fontOptSf = document.getElementById('font-opt-sf');
    const fontOptSystem = document.getElementById('font-opt-system');
    if (fontOptGoogle) fontOptGoogle.classList.toggle('active', f === 'google');
    if (fontOptSf) fontOptSf.classList.toggle('active', f === 'sf');
    if (fontOptSystem) fontOptSystem.classList.toggle('active', f === 'system');
  }

  // the app's state: many parts read and write it, and it holds songs and lists as the services sent them
  /** @type {UrielAppState} */
  const state = {
    platform: localStorage.getItem('uriel_platform') || 'youtube',
    currentView: 'discover',
    previousView: 'discover',
    currentPlaylistId: null,
    currentArtistData: null,
    searchQuery: '',
    searchResults: [],
    queue: [],
    queueIndex: -1,
    queueHistory: [],
    // the queue's order before shuffle mixed it, so turning shuffle off puts it back
    unshuffledQueue: null,
    currentTrack: null,
    currentTrackContext: null,
    currentTrackIndexInContext: -1,
    isPlaying: false,
    isMuted: localStorage.getItem('uriel_muted') === '1',
    volume: savedVolume,
    // repeat: 'off', 'all' (the queue starts over) or 'one' (the song plays again); isRepeat means 'one'
    repeatMode: /** @type {Record<string, string>} */ ({ '1': 'one', all: 'all' })[localStorage.getItem('uriel_repeat') || ''] || 'off',
    isRepeat: localStorage.getItem('uriel_repeat') === '1',
    isShuffle: localStorage.getItem('uriel_shuffle') === '1',
    isAutoRemix: false,
    myWaveActive: false,
    _isNaturalEnding: false,
    _skipRecordedFor: null,
    isRightPanelOpen: false,
    drawerTab: 'now',
    lyricsMode: 'line',
    uiScale: savedScale,
    activePresetId: soundPersistenceEnabled ? (localStorage.getItem('uriel_active_preset') || 'p_default') : 'p_default',
    themeMode: localStorage.getItem('uriel_theme_mode') || 'dark',
    paletteStyle: localStorage.getItem('uriel_palette_style') || 'classic',
    meshBrightness: parseInt(localStorage.getItem('uriel_mesh_brightness') || '100', 10),
    themeAccent: localStorage.getItem('uriel_theme_accent') || '#6750A4',
    themeIntensity: parseInt(localStorage.getItem('uriel_theme_intensity') || '0'),
    // one of SITE_THEMES ('' = none: the palette comes from the accent alone). Never chosen yet: Halloween Glow
    siteTheme: localStorage.getItem('uriel_site_theme') ?? 'halloween',
    themeBrightness: parseInt(localStorage.getItem('uriel_theme_brightness') || '50'),
    trEnabled: localStorage.getItem('uriel_tr_enabled') === 'true',
    trLang: localStorage.getItem('uriel_tr_lang') || 'en',
    trAuto: localStorage.getItem('uriel_tr_auto') === 'true',
    trActive: false,
    currentTranslations: null,
    isTvKaraokeOpen: false,
                          audioSettings: savedSound.audioSettings,
                          hqEnabled: savedSound.hqEnabled,
                          hqSettings: savedSound.hqSettings,
                          vfx: { ...defaultVfx, ...safeJson('devsize_vfx', {}), bassPulse: false, particles: false, soundwaveRings: false, borderGlow: false, backdropBlur: false, crt: false, grain: false, lyricsSpotlight: false },
                          favorites: safeArray('devsize_favorites'),
                          history: safeArray('devsize_history'),
                          playlists: safeArray('devsize_playlists'),
                          customPresets: normalizedCustomPresets,
                          localTracks: [],
                          syncedLyrics: [],
                          glitchTimes: [],
                          lastGlitchedIndex: -1,
                          isGlitching: false,
                          isWindowVisible: true,
                          loadToken: 0,
                          currentAbortController: null,
                          presetToRenameId: null,
                          serverPort: 38472,
                          lastBroadcastStateKey: null,
                          lyricWordsLine: null,
                          lyricWords: [],
                          lyricSweptEl: null,
                          lyricWordKey: null,
                          syncTimeout: null,
                          scrubberDragTargetTime: undefined,
                          riffFont: localStorage.getItem('uriel_font') || 'google'
  };

  function migrateAddedAt() {
    // the same song favourited from several places (album row, player bar, search) was kept once per source (#10)
    const favorites = backfillAddedAt(dedupeFavoriteTracks(state.favorites), true);
    if (favorites !== state.favorites) {
      state.favorites = favorites;
      localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
    }
    let playlistsChanged = false;
    for (const pl of state.playlists) {
      if (!pl || !Array.isArray(pl.tracks)) continue;
      const tracks = backfillAddedAt(pl.tracks, false);
      if (tracks !== pl.tracks) {
        pl.tracks = tracks;
        playlistsChanged = true;
      }
    }
    if (playlistsChanged) localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
  }

  migrateAddedAt();

  applyFont(state.riffFont);

  if (window.electronAPI && window.electronAPI.getServerPort) {
    try {
      state.serverPort = await window.electronAPI.getServerPort();
    } catch (e) {
      console.warn('Failed to get server port:', e);
    }
  }

  // Settings → Storage → Song storage limit. Phones have their own row and clean-up (mobile/mobile-ui.ts).
  (() => {
    const row = document.getElementById('offline-limit-item');
    if (!row) return;
    if (document.documentElement.classList.contains('is-mobile') || !state.serverPort) { row.remove(); return; }
    const tell = (/** @type {string} */ mb, /** @type {boolean} */ apply) => fetch(`http://127.0.0.1:${state.serverPort}/api/cache-limit?mb=${mb}${apply ? '&apply=1' : ''}`, { method: 'POST' }).catch(() => {});
    const buttons = /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll('[data-limit]'));
    const show = (/** @type {string | undefined} */ mb) => buttons.forEach((b) => b.classList.toggle('active', b.dataset.limit === mb));
    const current = localStorage.getItem('uriel_cache_limit_mb') || '10240';
    show(current);
    tell(current, false);
    buttons.forEach((/** @type {HTMLElement} */ b) => b.addEventListener('click', () => {
      localStorage.setItem('uriel_cache_limit_mb', String(b.dataset.limit));
      show(b.dataset.limit);
      tell(String(b.dataset.limit), true).then(updateOfflineStorageUI);
    }));
  })();

  // other languages: what this device translated before, then whatever is still missing (English: nothing)
  I18N.connect(`http://127.0.0.1:${state.serverPort}`);

  function sendStateToServer(currentWordText = '', wordIndex = -1, lineIndex = -1) {
    if (!state.currentTrack) return;
    fetch(`http://127.0.0.1:${state.serverPort}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: state.currentTrack.title,
        artist: state.currentTrack.artist,
        isPlaying: state.isPlaying,
        word: currentWordText,
        wordIndex: wordIndex,
        lineIndex: lineIndex
      })
    }).catch(() => {});
  }

  function getMediaArtwork(/** @type {string | undefined} */ thumb) {
    if (!thumb || typeof thumb !== 'string') return [];
    const trimmed = thumb.trim();
    if (!trimmed) return [];
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:')) {
      return [];
    }
    let type = 'image/jpeg';
    if (trimmed.startsWith('data:image/png') || /\.png(\?|$)/i.test(trimmed)) type = 'image/png';
    else if (trimmed.startsWith('data:image/webp') || /\.webp(\?|$)/i.test(trimmed)) type = 'image/webp';
    else if (trimmed.startsWith('data:image/gif') || /\.gif(\?|$)/i.test(trimmed)) type = 'image/gif';
    return [
      { src: trimmed, sizes: '96x96', type },
      { src: trimmed, sizes: '128x128', type },
      { src: trimmed, sizes: '192x192', type },
      { src: trimmed, sizes: '256x256', type },
      { src: trimmed, sizes: '512x512', type }
    ];
  }

  function updateMediaPositionState() {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    try {
      const audio = (state.secondaryAudio && !state.secondaryAudio.paused) ? state.secondaryAudio : el.nativeAudio;
      const pos = window.UrielNowPlaying.positionState(audio, state.currentTrack && state.currentTrack.duration);
      if (pos) navigator.mediaSession.setPositionState(pos);
      else navigator.mediaSession.setPositionState();
    } catch (_) {}
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let discordPresenceClearTimer = null;
  // off unless turned on in Settings (it tells everyone on Discord what you're listening to)
  const discordPresenceOn = () => localStorage.getItem('uriel_discord_presence') === 'true';
  function updateDiscordPresence() {
    const api = window.electronAPI;
    if (!api) return;
    if (!discordPresenceOn()) return;
    if (!state.currentTrack) {
      if (discordPresenceClearTimer) clearTimeout(discordPresenceClearTimer);
      discordPresenceClearTimer = setTimeout(() => {
        discordPresenceClearTimer = null;
        if (!state.currentTrack && api.discordPresenceClear) api.discordPresenceClear();
      }, 1500);
      return;
    }
    if (discordPresenceClearTimer) {
      clearTimeout(discordPresenceClearTimer);
      discordPresenceClearTimer = null;
    }
    if (!api.discordPresenceUpdate) return;

    const track = state.currentTrack;
    const audio = (state.secondaryAudio && !state.secondaryAudio.paused) ? state.secondaryAudio : el.nativeAudio;
    const duration = Number(track.duration) > 0
      ? Number(track.duration)
      : (audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    const position = audio && Number.isFinite(audio.currentTime) && audio.currentTime >= 0
      ? audio.currentTime
      : 0;
    const thumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(track) : '') || track.thumbnail || '';
    const isRemoteUrl = (/** @type {unknown} */ value) => typeof value === 'string' && /^https?:\/\//i.test(value) && !value.includes('127.0.0.1');
    const link = typeof track.url === 'string' && /^https:\/\//i.test(track.url) ? track.url : '';
    api.discordPresenceUpdate({
      title: track.title || 'Unknown Song',
      artist: track.artist || 'Unknown Artist',
      duration,
      position,
      isPlaying: !!state.isPlaying,
      thumbnail: isRemoteUrl(thumb) ? thumb : '',
      url: link
    });
  }

  function updateMediaSession() {
    updateDiscordPresence();
    if (!('mediaSession' in navigator)) return;
    if (state.currentTrack) {
      const rawTitle = (typeof state.currentTrack.title === 'string' ? state.currentTrack.title.trim() : '');
      const rawArtist = (typeof state.currentTrack.artist === 'string' ? state.currentTrack.artist.trim() : '');
      const rawAlbum = (typeof state.currentTrack.album === 'string' ? state.currentTrack.album.trim() : '');
      const title = rawTitle || 'Unknown song';
      const artist = rawArtist || 'Unknown artist';
      const thumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : '') || state.currentTrack.thumbnail || '';
      const artwork = getMediaArtwork(thumb);
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album: rawAlbum,
        artwork
      });
      updateMediaPositionState();
    } else {
      navigator.mediaSession.metadata = null;
    }
    navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
  }

  /** @type {Record<string, string>} */
  const MEDIA_GROUP = { toggle: 'pp', play: 'pp', pause: 'pp', next: 'next', prev: 'prev', stop: 'stop' };
  let lastMedia = { g: '', t: 0 };
  let hasNotifiedMediaKeysActive = false;
  function handleMediaCommand(/** @type {string} */ cmd, /** @type {string} */ src) {
    const g = MEDIA_GROUP[cmd];
    if (!g) return;
    const now = performance.now();
    if (lastMedia.g === g && now - lastMedia.t < 350) return;
    lastMedia = { g, t: now };
    if (cmd === 'toggle') togglePlayPause();
    // togglePlayPause also handles a restored session that has no audio loaded yet (lock screen / headset play)
    else if (cmd === 'play') { if (!state.isPlaying) togglePlayPause(); }
    else if (cmd === 'pause') { if (state.isPlaying) pauseSmooth(); }
    else if (cmd === 'next') playNext();
    else if (cmd === 'prev') playPrev();
    else if (cmd === 'stop') { if (state.isPlaying) pauseSmooth(); }
  }

  // Lock screen / Control Center / headset buttons. iOS forgets these whenever one song is unloaded for the
  // next, and with none registered it shows its own ±15 s skip buttons instead of previous / next (the
  // "songs act like podcasts" report), so they are registered again every time a song starts.
  const mediaActions = {
    play: () => handleMediaCommand('play', 'session'),
    pause: () => handleMediaCommand('pause', 'session'),
    previoustrack: () => handleMediaCommand('prev', 'session'),
    nexttrack: () => handleMediaCommand('next', 'session'),
    stop: () => handleMediaCommand('stop', 'session'),
    seekto: (/** @type {MediaSessionActionDetails} */ details) => {
      if (details.seekTime !== undefined && details.seekTime !== null) {
        const audio = (state.secondaryAudio && !state.secondaryAudio.paused) ? state.secondaryAudio : el.nativeAudio;
        if (audio) audio.currentTime = details.seekTime;
        if (typeof updateSyncedLyricsHighlight === 'function') {
          updateSyncedLyricsHighlight(details.seekTime);
        }
        updateMediaPositionState();
        updateDiscordPresence();
      }
    },
    // skip buttons take the place of previous / next on the iPhone lock screen
    seekbackward: null,
    seekforward: null,
  };
  function registerMediaActions() {
    if (!('mediaSession' in navigator)) return;
    for (const [action, handler] of Object.entries(mediaActions)) {
      // one action the browser doesn't know must not stop the others
      try { navigator.mediaSession.setActionHandler(/** @type {MediaSessionAction} */ (action), handler); } catch (_) {}
    }
  }
  registerMediaActions();

  function hexToRgb(/** @type {string} */ hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((/** @type {string} */ c) => c + c).join('');
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHsl(/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToHex(/** @type {number} */ h, /** @type {number} */ s, /** @type {number} */ l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (/** @type {number} */ n) => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }

  function getAdv(/** @type {string} */ name, defaultVal = true) {
    const val = localStorage.getItem(`uriel_adv_${name}`);
    if (val === null) return defaultVal;
    return val === 'true';
  }

  function setAdv(/** @type {string} */ name, /** @type {boolean} */ boolVal) {
    localStorage.setItem(`uriel_adv_${name}`, boolVal ? 'true' : 'false');
  }

  // off or on as chosen in Settings; never chosen: the system's "Reduce motion" (from Riff 43.2)
  function systemPrefersReducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  function applyReducedMotionSetting() {
    const reduced = getAdv('reduce_motion', systemPrefersReducedMotion());
    document.documentElement.classList.toggle('force-reduced-motion', reduced);
  }

  /** @type {Record<string, { label: string, secHueShift: number, tertHueShift: number, priSatScale: number, surfSatScale: number, contSatScale: number }>} */
  const PALETTE_STYLES = {
    classic: {
      label: 'Classic',
      secHueShift: 0,
      tertHueShift: 0,
      priSatScale: 1.0,
      surfSatScale: 1.0,
      contSatScale: 1.0
    },
    'tonal-spot': {
      label: 'Tonal spot',
      secHueShift: 0,
      tertHueShift: 60,
      priSatScale: 1.0,
      surfSatScale: 0.8,
      contSatScale: 0.9
    },
    expressive: {
      label: 'Expressive',
      secHueShift: 60,
      tertHueShift: 120,
      priSatScale: 1.25,
      surfSatScale: 1.5,
      contSatScale: 1.3
    },
    vibrant: {
      label: 'Vibrant',
      secHueShift: 0,
      tertHueShift: 60,
      priSatScale: 1.4,
      surfSatScale: 1.2,
      contSatScale: 1.4
    },
    neutral: {
      label: 'Neutral',
      secHueShift: 0,
      tertHueShift: 0,
      priSatScale: 0.35,
      surfSatScale: 0.2,
      contSatScale: 0.25
    }
  };

  // Old Android WebViews (before Chrome 111) have no color-mix(): a color built with it was thrown away and all
  // text came out black. They get the plain color instead (the transparency sliders do nothing there).
  const hasColorMix = !!(window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)'));
  const tint = (/** @type {string} */ hex, /** @type {string} */ v) => (hasColorMix ? `color-mix(in srgb, ${hex} var(${v}), transparent)` : hex);
  const SURFACE_TOKENS = new Set([
    '--md-sys-color-background',
    '--md-sys-color-surface',
    '--md-sys-color-surface-dim',
    '--md-sys-color-surface-bright',
    '--md-sys-color-surface-container-lowest',
    '--md-sys-color-surface-container-low',
    '--md-sys-color-surface-container',
    '--md-sys-color-surface-container-high',
    '--md-sys-color-surface-container-highest'
  ]);
  const TEXT_TOKENS = new Set([
    '--md-sys-color-on-surface',
    '--md-sys-color-on-surface-variant'
  ]);

  // The preset themes of Majd's website (Esperant0s.github.io, js/themes.js and style.css): the same seven base
  // colors, and Uriel's surfaces, text and accents are worked out from them. All of them are dark themes.
  const SITE_THEMES = [
    { id: 'halloween', name: 'Halloween Glow', tag: 'Fall · default', bg: '#0A0A0A', bg2: '#1A121A', bg3: '#3D1A3D', text: '#F7EBDD', accent: '#FFB627', accent2: '#FF6700', pop: '#9B1D20' },
    { id: 'synthwave', name: 'Synthwave Night', tag: 'Neon', bg: '#240046', bg2: '#3C096C', bg3: '#7209B7', text: '#FCE7F3', accent: '#FFD60A', accent2: '#F72585', pop: '#B57BE8' },
    { id: 'luxury-gold', name: 'Luxury Gold', tag: 'Gold', bg: '#0B0B10', bg2: '#1A1A2E', bg3: '#16213E', text: '#F5E6C4', accent: '#C9A227', accent2: '#F5E6C4', pop: '#C9A227' },
    { id: 'midnight-jewel', name: 'Midnight Jewel', tag: 'Deep · moody', bg: '#03071E', bg2: '#1A0618', bg3: '#370617', text: '#F6E0D6', accent: '#DC2F02', accent2: '#9D0208', pop: '#EE9780', accentText: '#E35935' },
    { id: 'noir-neon', name: 'Noir Neon', tag: 'Neon · synthwave', bg: '#0D0C1D', bg2: '#1B1B3A', bg3: '#693668', text: '#F5E3F0', accent: '#F84AA7', accent2: '#A74482', pop: '#FBA4D3' },
    { id: 'devtool-dark', name: 'Devtool Dark', tag: 'Developer', bg: '#0A0E14', bg2: '#1F2430', bg3: '#2A3142', text: '#E6E1CF', accent: '#FFD580', accent2: '#5FB3B3', pop: '#BBE67E' },
    { id: 'github-dim', name: 'GitHub Dim', tag: 'Developer', bg: '#22272E', bg2: '#2D333B', bg3: '#373E47', text: '#CDD9E5', accent: '#539BF5', accent2: '#768390', pop: '#CDD9E5', accentText: '#6DABF7' },
    { id: 'midnight-violet', name: 'Midnight Violet', tag: 'Purple', bg: '#0B0B1A', bg2: '#1A1635', bg3: '#2D2456', text: '#EDE9FE', accent: '#C4B5FD', accent2: '#7C3AED', pop: '#A078F5' },
    { id: 'midnight-teal', name: 'Midnight Teal', tag: 'Green · cool', bg: '#021F25', bg2: '#053E44', bg3: '#0D6E6F', text: '#E6FBF5', accent: '#A7F0D4', accent2: '#22B8A3', pop: '#7FE3C9' },
    { id: 'midnight-rose', name: 'Midnight Rose', tag: 'Pink · moody', bg: '#190A17', bg2: '#3A132D', bg3: '#7A2348', text: '#FFE4E8', accent: '#FF9AA2', accent2: '#C44569', pop: '#E07A95' },
    { id: 'midnight-amber', name: 'Midnight Amber', tag: 'Amber · warm', bg: '#0C0A09', bg2: '#1C1917', bg3: '#451A03', text: '#FFF1E2', accent: '#FED7AA', accent2: '#EA580C', pop: '#FB923C' },
    { id: 'cyberpunk', name: 'Cyberpunk Glow', tag: 'Neon · cyberpunk', bg: '#0D0221', bg2: '#190B34', bg3: '#3A0F6E', text: '#EAFBFF', accent: '#04FFE6', accent2: '#FB04EB', pop: '#A64DFF' },
    { id: 'noir-cinema', name: 'Noir Cinema', tag: 'Monochrome', bg: '#000000', bg2: '#1A1A1A', bg3: '#4D4D4D', text: '#F0E6D2', accent: '#F0E6D2', accent2: '#999999', pop: '#F0E6D2' }
  ];
  // the chosen website theme, while it applies: not in auto (cover colors) or light mode
  function activeSiteTheme() {
    if (!state.siteTheme || state.themeMode === 'auto' || state.themeMode === 'light') return null;
    return SITE_THEMES.find((t) => t.id === state.siteTheme) || null;
  }

  // a website theme's colors over the generated palette: brightness 50% is the website as it is, lower is darker
  function applySiteThemeTokens(/** @type {typeof SITE_THEMES[number]} */ t, /** @type {number} */ br, /** @type {(prop: string, val: string) => void} */ setToken, /** @type {(prop: string, val: string) => void} */ setSurfaceToken) {
    const shade = (/** @type {string} */ c) => br < 0.5 ? mixHex(c, '#000000', (0.5 - br) * 1.2) : mixHex(c, '#FFFFFF', (br - 0.5) * 0.4);
    const primary = t.accentText || t.accent;
    const p = hexToRgb(primary);
    setToken('--md-sys-color-primary', primary);
    setToken('--md-sys-color-on-primary', relLuminance(primary) > 0.3 ? mixHex(t.bg, '#000000', 0.3) : '#FFFFFF');
    setToken('--md-sys-color-primary-container', `rgba(${p.r}, ${p.g}, ${p.b}, 0.18)`);
    setToken('--md-sys-color-on-primary-container', primary);
    setToken('--md-sys-color-secondary', t.accent2);
    setSurfaceToken('--md-sys-color-secondary-container', shade(mixHex(t.bg2, t.accent2, 0.25)));
    setToken('--md-sys-color-on-secondary-container', mixHex(t.text, t.accent2, 0.2));
    setToken('--md-sys-color-tertiary', t.pop);
    setSurfaceToken('--md-sys-color-tertiary-container', shade(mixHex(t.bg2, t.pop, 0.25)));
    setToken('--md-sys-color-background', shade(t.bg));
    setToken('--md-sys-color-surface', shade(mixHex(t.bg, t.bg2, 0.15)));
    setToken('--md-sys-color-surface-dim', shade(t.bg));
    setToken('--md-sys-color-surface-bright', shade(t.bg3));
    setToken('--md-sys-color-surface-container-lowest', shade(mixHex(t.bg, '#000000', 0.25)));
    setToken('--md-sys-color-surface-container-low', shade(mixHex(t.bg, t.bg2, 0.5)));
    setToken('--md-sys-color-surface-container', shade(t.bg2));
    setToken('--md-sys-color-surface-container-high', shade(mixHex(t.bg2, t.bg3, 0.3)));
    setToken('--md-sys-color-surface-container-highest', shade(mixHex(t.bg2, t.bg3, 0.55)));
    setToken('--md-sys-color-on-surface', t.text);
    setToken('--md-sys-color-on-surface-variant', mixHex(t.text, t.bg, 0.3));
    setToken('--md-sys-color-outline', mixHex(t.text, t.bg, 0.5));
    setSurfaceToken('--md-sys-color-outline-variant', mixHex(t.bg2, t.text, 0.15));
  }

  function generateM3Palette(/** @type {string} */ hexColor, /** @type {string} */ mode, /** @type {number} */ intensity, /** @type {number} */ brightness) {
    if (!hexColor) hexColor = '#6750A4';
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const h = hsl.h;
    const intensityFactor = (typeof intensity === 'number' ? intensity : 100) / 100;
    const root = document.documentElement;
    // Settings → "Apply intensity to background" (Riff 43): surfaces take on the accent as strongly as the
    // intensity slider says, instead of the faint tint they always have
    const tintSurfaces = getAdv('intensity_bg', false);
    const surfSat = (/** @type {number} */ n, /** @type {number} */ factor) => tintSurfaces ? Math.min(85, Math.round((hsl.s || 60) * factor * 2.4)) : Math.round(n * factor);

    const setToken = (/** @type {string} */ prop, /** @type {string} */ val) => {
      if (SURFACE_TOKENS.has(prop)) {
        root.style.setProperty(prop, tint(val, '--ui-alpha'));
        root.style.setProperty(`${prop}-solid`, val);
      } else if (TEXT_TOKENS.has(prop)) {
        root.style.setProperty(prop, tint(val, '--text-alpha'));
        root.style.setProperty(`${prop}-solid`, val);
      } else {
        root.style.setProperty(prop, val);
      }
    };

    const setSurfaceToken = (/** @type {string} */ prop, /** @type {string} */ val) => {
      root.style.setProperty(prop, tint(val, '--ui-alpha'));
      root.style.setProperty(`${prop}-solid`, val);
    };

    const styleKey = state.paletteStyle || 'classic';
    const style = PALETTE_STYLES[styleKey] || PALETTE_STYLES.classic;

    const hSec = (h + style.secHueShift) % 360;
    const hTert = (h + style.tertHueShift) % 360;

    const isMonochrome = intensityFactor < 0.08 || (styleKey === 'neutral' && intensityFactor < 0.05);
    const br = (typeof brightness === 'number' ? brightness : 50) / 100;

    if (mode === 'light') {
      const LB = (/** @type {number} */ v) => Math.max(0, Math.min(100, Math.round(v + (br - 0.5) * 24)));
      if (isMonochrome) {
        setToken('--md-sys-color-primary', '#111111');
        setToken('--md-sys-color-on-primary', '#FFFFFF');
        setSurfaceToken('--md-sys-color-primary-container', hslToHex(0, 0, LB(90)));
        setToken('--md-sys-color-on-primary-container', '#111111');
        setToken('--md-sys-color-secondary', '#444444');
        setSurfaceToken('--md-sys-color-secondary-container', hslToHex(0, 0, LB(90)));
        setToken('--md-sys-color-on-secondary-container', '#111111');
        setToken('--md-sys-color-tertiary', '#444444');
        setSurfaceToken('--md-sys-color-tertiary-container', hslToHex(0, 0, LB(90)));
        setToken('--md-sys-color-background', hslToHex(0, 0, LB(99)));
        setToken('--md-sys-color-surface', hslToHex(0, 0, LB(98)));
        setToken('--md-sys-color-surface-dim', hslToHex(0, 0, LB(87)));
        setToken('--md-sys-color-surface-bright', hslToHex(0, 0, LB(98)));
        setToken('--md-sys-color-surface-container-lowest', hslToHex(0, 0, LB(100)));
        setToken('--md-sys-color-surface-container-low', hslToHex(0, 0, LB(96)));
        setToken('--md-sys-color-surface-container', hslToHex(0, 0, LB(94)));
        setToken('--md-sys-color-surface-container-high', hslToHex(0, 0, LB(92)));
        setToken('--md-sys-color-surface-container-highest', hslToHex(0, 0, LB(90)));
        setToken('--md-sys-color-on-surface', '#111111');
        setToken('--md-sys-color-on-surface-variant', '#444444');
        setToken('--md-sys-color-outline', '#777777');
        setSurfaceToken('--md-sys-color-outline-variant', '#CFCFCF');
        setToken('--md-sys-color-error', '#777777');
        setToken('--md-sys-color-on-error', '#FFFFFF');
      } else {
        const sat = Math.min(100, Math.round(48 * intensityFactor * style.priSatScale));
        const satHi = Math.min(100, Math.round(80 * intensityFactor * style.contSatScale));
        const satMed = Math.min(100, Math.round(55 * intensityFactor * style.priSatScale));
        const satLow = Math.min(100, Math.round(30 * intensityFactor * style.contSatScale));
        const satLow2 = Math.min(100, Math.round(20 * intensityFactor * style.contSatScale));
        const surfFactor = intensityFactor * style.surfSatScale;

        setToken('--md-sys-color-primary', hslToHex(h, sat, 40));
        setToken('--md-sys-color-on-primary', '#FEFBFF');
        setToken('--md-sys-color-primary-container', hslToHex(h, satHi, LB(90)));
        setToken('--md-sys-color-on-primary-container', hslToHex(h, satMed, 18));
        setToken('--md-sys-color-secondary', hslToHex(hSec, satLow, 45));
        setToken('--md-sys-color-secondary-container', hslToHex(hSec, satLow, LB(90)));
        setToken('--md-sys-color-on-secondary-container', hslToHex(hSec, satLow2, 15));
        setToken('--md-sys-color-tertiary', hslToHex(hTert, satLow, 45));
        setToken('--md-sys-color-tertiary-container', hslToHex(hTert, satLow, LB(90)));
        setToken('--md-sys-color-background', hslToHex(h, surfSat(5, surfFactor), LB(99)));
        setToken('--md-sys-color-surface', hslToHex(h, surfSat(6, surfFactor), LB(98)));
        setToken('--md-sys-color-surface-dim', hslToHex(h, surfSat(5, surfFactor), LB(87)));
        setToken('--md-sys-color-surface-bright', hslToHex(h, surfSat(6, surfFactor), LB(98)));
        setToken('--md-sys-color-surface-container-lowest', hslToHex(h, surfSat(4, surfFactor), LB(100)));
        setToken('--md-sys-color-surface-container-low', hslToHex(h, surfSat(5, surfFactor), LB(96)));
        setToken('--md-sys-color-surface-container', hslToHex(h, surfSat(6, surfFactor), LB(94)));
        setToken('--md-sys-color-surface-container-high', hslToHex(h, surfSat(5, surfFactor), LB(92)));
        setToken('--md-sys-color-surface-container-highest', hslToHex(h, surfSat(5, surfFactor), LB(90)));
        setToken('--md-sys-color-on-surface', '#1C1B1F');
        setToken('--md-sys-color-on-surface-variant', '#49454F');
        setToken('--md-sys-color-outline', '#79747E');
        setToken('--md-sys-color-outline-variant', '#CAC4D0');
      }
    } else {
      if (isMonochrome) {
        const B = (/** @type {number} */ v) => Math.max(0, Math.min(100, Math.round(v * (br * 2))));
        setToken('--md-sys-color-primary', '#FFFFFF');
        setToken('--md-sys-color-on-primary', '#121212');
        setSurfaceToken('--md-sys-color-primary-container', hslToHex(0, 0, B(24)));
        setToken('--md-sys-color-on-primary-container', '#FFFFFF');
        setToken('--md-sys-color-secondary', '#D0D0D0');
        setSurfaceToken('--md-sys-color-secondary-container', hslToHex(0, 0, B(24)));
        setToken('--md-sys-color-on-secondary-container', '#FFFFFF');
        setToken('--md-sys-color-tertiary', '#D0D0D0');
        setSurfaceToken('--md-sys-color-tertiary-container', hslToHex(0, 0, B(24)));
        setToken('--md-sys-color-background', hslToHex(0, 0, B(7)));
        setToken('--md-sys-color-surface', hslToHex(0, 0, B(7)));
        setToken('--md-sys-color-surface-dim', hslToHex(0, 0, B(7)));
        setToken('--md-sys-color-surface-bright', hslToHex(0, 0, B(19)));
        setToken('--md-sys-color-surface-container-lowest', hslToHex(0, 0, B(5)));
        setToken('--md-sys-color-surface-container-low', hslToHex(0, 0, B(10)));
        setToken('--md-sys-color-surface-container', hslToHex(0, 0, B(13)));
        setToken('--md-sys-color-surface-container-high', hslToHex(0, 0, B(16)));
        setToken('--md-sys-color-surface-container-highest', hslToHex(0, 0, B(20)));
        setToken('--md-sys-color-on-surface', '#FFFFFF');
        setToken('--md-sys-color-on-surface-variant', '#CFCFCF');
        setToken('--md-sys-color-outline', '#8A8A8A');
        setSurfaceToken('--md-sys-color-outline-variant', '#3A3A3A');
        setToken('--md-sys-color-error', '#8A8A8A');
        setToken('--md-sys-color-on-error', '#121212');
      } else {
        const sat = Math.min(100, Math.round(60 * intensityFactor * style.priSatScale));
        const satHi = Math.min(100, Math.round(60 * intensityFactor * style.contSatScale));
        const satMed = Math.min(100, Math.round(50 * intensityFactor * style.priSatScale));
        const satLow = Math.min(100, Math.round(15 * intensityFactor * style.contSatScale));
        const satLow2 = Math.min(100, Math.round(30 * intensityFactor * style.contSatScale));
        const surfFactor = intensityFactor * style.surfSatScale;
        const priHex = hslToHex(h, sat, 75);
        const priRgb = hexToRgb(priHex);
        setToken('--md-sys-color-primary', priHex);
        setToken('--md-sys-color-on-primary', hslToHex(h, satMed, 20));
        setToken('--md-sys-color-primary-container', `rgba(${priRgb.r}, ${priRgb.g}, ${priRgb.b}, 0.18)`);
        setToken('--md-sys-color-on-primary-container', priHex);
        setToken('--md-sys-color-secondary', hslToHex(hSec, satLow2, 75));
        setToken('--md-sys-color-secondary-container', hslToHex(hSec, satLow, 22));
        setToken('--md-sys-color-on-secondary-container', hslToHex(hSec, satLow2, 85));
        setToken('--md-sys-color-tertiary', hslToHex(hTert, satLow2, 75));
        setToken('--md-sys-color-tertiary-container', hslToHex(hTert, satLow, 22));
        const B = (/** @type {number} */ v) => Math.max(0, Math.min(100, Math.round(v * (br * 2))));
        setToken('--md-sys-color-background', hslToHex(h, surfSat(5, surfFactor), B(7)));
        setToken('--md-sys-color-surface', hslToHex(h, surfSat(6, surfFactor), B(8)));
        setToken('--md-sys-color-surface-dim', hslToHex(h, surfSat(5, surfFactor), B(7)));
        setToken('--md-sys-color-surface-bright', hslToHex(h, surfSat(4, surfFactor), B(24)));
        setToken('--md-sys-color-surface-container-lowest', hslToHex(h, surfSat(5, surfFactor), B(5)));
        setToken('--md-sys-color-surface-container-low', hslToHex(h, surfSat(5, surfFactor), B(10)));
        setToken('--md-sys-color-surface-container', hslToHex(h, surfSat(6, surfFactor), B(13)));
        setToken('--md-sys-color-surface-container-high', hslToHex(h, surfSat(5, surfFactor), B(16)));
        setToken('--md-sys-color-surface-container-highest', hslToHex(h, surfSat(5, surfFactor), B(20)));
        setToken('--md-sys-color-on-surface', '#e2e2e9');
        setToken('--md-sys-color-on-surface-variant', '#c4c6d0');
        setToken('--md-sys-color-outline', '#8e9099');
        setToken('--md-sys-color-outline-variant', '#282a33');
      }
    }
    const site = mode === 'dark' && activeSiteTheme();
    if (site) applySiteThemeTokens(site, br, setToken, setSurfaceToken);
  }

  function extractDominantColor(/** @type {string} */ imgSrc) {
    return new Promise((resolve) => {
      if (!imgSrc) return resolve('#6750A4');
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        canvas.width = 10;
        canvas.height = 10;
        ctx.drawImage(img, 0, 0, 10, 10);
        const data = ctx.getImageData(0, 0, 10, 10).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i+1]; b += data[i+2];
        }
        const count = data.length / 4;
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        resolve(hex);
      };
      img.onerror = () => resolve('#6750A4');
      img.src = imgSrc;
    });
  }

  // playback flags the parts in shared/app/ read and set too, so they live in one object passed to them
  const playback = {
    // the playing song is fading out for Crossfade, and the next one should fade in when it starts
    crossfadeTriggered: false,
    crossfadeFadeInPending: false,
    // the progress bar's knob is being dragged
    isDraggingScrubber: false,
  };

  // the visualizers' drawing state, which the player and Settings change too (the drawing is in app/visualizer.js)
  const viz = {
    /** @type {number | null} */
    animationFrameId: null,
    // the paused visualizer was drawn once and needs no more frames until something changes
    hasDrawnPausedFrame: false,
    // Settings → frame rate, read once here rather than on every frame (its buttons update it): 60 unless Native (0)
    // was chosen; drawing at 165 fps costs a lot and looks the same
    userFpsCap: parseInt(localStorage.getItem('uriel_fps_cap') || '60', 10) || 0,
    // the wide visualizer behind the player bar draws one liquid wave instead of bars
    connected: localStorage.getItem('uriel_viz_connected') === '1',
  };
  let cachedPrimaryColor = '';
  let cachedDimColor = '';
  let vizFrameTimer = 0;
  // Asking for a frame and then skipping it still makes the browser produce one on every refresh of a fast screen,
  // so a capped loop waits on a timer first. The timer ends a little early to catch the frame the cap wants: rAF
  // then lands on the next refresh, and a 60 Hz screen doesn't drop to every other frame.
  /** @param {FrameRequestCallback} callback @param {number} fps */
  function scheduleVizFrame(callback, fps) {
    if (!fps) return requestAnimationFrame(callback);
    vizFrameTimer = window.setTimeout(() => {
      vizFrameTimer = 0;
      viz.animationFrameId = requestAnimationFrame(callback);
    }, Math.max(0, 1000 / fps - 7));
    return -1;
  }
  function cancelVizFrame() {
    if (vizFrameTimer) clearTimeout(vizFrameTimer);
    vizFrameTimer = 0;
    if (viz.animationFrameId) cancelAnimationFrame(viz.animationFrameId);
    viz.animationFrameId = null;
  }
  function refreshCachedThemeColors() {
    const rootStyle = getComputedStyle(document.documentElement);
    cachedPrimaryColor = rootStyle.getPropertyValue('--md-sys-color-primary').trim() || '#6750A4';
    cachedDimColor = rootStyle.getPropertyValue('--md-sys-color-on-surface').trim() || '#E6E0E9';
    viz.hasDrawnPausedFrame = false;
  }
  // the theme's primary colour, read from the page the first time it's needed
  function primaryColor() {
    if (!cachedPrimaryColor) refreshCachedThemeColors();
    return cachedPrimaryColor;
  }
  function dimColor() {
    if (!cachedPrimaryColor) refreshCachedThemeColors();
    return cachedDimColor;
  }

  const coverAnalysisCache = new Map();
  // drop the oldest entries of an in-memory cache past n, so long sessions don't grow without end
  function capMap(/** @type {Map<unknown, unknown>} */ m, /** @type {number} */ n) { while (m.size > n) m.delete(m.keys().next().value); }
  // Interface opacity when it was never set: panels mostly solid, so text stays readable over busy backgrounds and
  // album colours (Riff's 20% made every panel 80% see-through). Menus and dialogs are solid whatever it is (styles.css).
  const DEFAULT_UI_ALPHA = '85';
  // "Available offline" marks (checkOffline, further down): kept up here, playTrack can run before that part
  const OFFLINE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8"/><path d="M8 3.6v6.2M5.2 7.4 8 10.2l2.8-2.8M5 12h6" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const offlineKnown = new Map(); // offlineKey -> true / false
  const offlineSeen = new Map(); // offlineKey -> the track, to ask again when the device's songs change
  /** @type {number | null} */
  let offlineLocalVersion = null;
  let offlinePending = new Map();
  let offlineTimer = 0;

  function analyzeCover(/** @type {string} */ imgSrc) {
    return new Promise((resolve) => {
      if (!imgSrc) {
        return resolve({ accent: '#6750A4', accent2: '#9A82DB', luminance: 0.2, saturation: 0.5 });
      }
      if (coverAnalysisCache.has(imgSrc)) {
        const cached = coverAnalysisCache.get(imgSrc);
        coverAnalysisCache.delete(imgSrc);
        coverAnalysisCache.set(imgSrc, cached);
        return resolve(cached);
      }

      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 48;
          canvas.height = 48;
          const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
          ctx.drawImage(img, 0, 0, 48, 48);
          const data = ctx.getImageData(0, 0, 48, 48).data;

          let totalLuminance = 0;
          let nonGraySatSum = 0;
          let nonGraySatCount = 0;

          const bins = Array.from({ length: 24 }, (_, i) => ({
            idx: i,
            centerHue: (i + 0.5) * 15,
            weight: 0,
            rSum: 0,
            gSum: 0,
            bSum: 0,
            count: 0
          }));

          let fallbackR = 0, fallbackG = 0, fallbackB = 0;
          const totalPixels = data.length / 4;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            fallbackR += r;
            fallbackG += g;
            fallbackB += b;

            const rN = r / 255;
            const gN = g / 255;
            const bN = b / 255;

            const lum = 0.2126 * rN + 0.7152 * gN + 0.0722 * bN;
            totalLuminance += lum;

            const max = Math.max(rN, gN, bN);
            const min = Math.min(rN, gN, bN);
            const d = max - min;
            const l = (max + min) / 2;
            const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

            if (s >= 0.15) {
              nonGraySatSum += s;
              nonGraySatCount++;

              if (l >= 0.10 && l <= 0.90) {
                let hDeg = 0;
                if (d > 0) {
                  if (max === rN) {
                    hDeg = ((gN - bN) / d + (gN < bN ? 6 : 0)) * 60;
                  } else if (max === gN) {
                    hDeg = ((bN - rN) / d + 2) * 60;
                  } else {
                    hDeg = ((rN - gN) / d + 4) * 60;
                  }
                }
                const binIdx = Math.min(23, Math.max(0, Math.floor(hDeg / 15)));
                const bin = bins[binIdx];
                bin.weight += s;
                bin.rSum += r;
                bin.gSum += g;
                bin.bSum += b;
                bin.count++;
              }
            }
          }

          const meanLuminance = totalLuminance / totalPixels;
          const meanSaturation = nonGraySatCount > 0 ? (nonGraySatSum / nonGraySatCount) : 0;

          let bestBin = null;
          for (let i = 0; i < 24; i++) {
            if (bins[i].count > 0) {
              if (!bestBin || bins[i].weight > bestBin.weight) {
                bestBin = bins[i];
              }
            }
          }

          let accentHex = '';
          let accentR = 0, accentG = 0, accentB = 0;

          if (bestBin && bestBin.count > 0) {
            accentR = Math.round(bestBin.rSum / bestBin.count);
            accentG = Math.round(bestBin.gSum / bestBin.count);
            accentB = Math.round(bestBin.bSum / bestBin.count);
            accentHex = '#' + [accentR, accentG, accentB].map(x => x.toString(16).padStart(2, '0')).join('');
          } else {
            accentR = Math.round(fallbackR / totalPixels);
            accentG = Math.round(fallbackG / totalPixels);
            accentB = Math.round(fallbackB / totalPixels);
            accentHex = '#' + [accentR, accentG, accentB].map(x => x.toString(16).padStart(2, '0')).join('');
          }

          let bestBin2 = null;
          if (bestBin) {
            for (let i = 0; i < 24; i++) {
              if (bins[i].count > 0 && i !== bestBin.idx) {
                const diff = Math.abs(bins[i].centerHue - bestBin.centerHue);
                const dist = Math.min(diff, 360 - diff);
                if (dist >= 60) {
                  if (!bestBin2 || bins[i].weight > bestBin2.weight) {
                    bestBin2 = bins[i];
                  }
                }
              }
            }
          }

          let accent2Hex = '';
          if (bestBin2 && bestBin2.count > 0) {
            const r2 = Math.round(bestBin2.rSum / bestBin2.count);
            const g2 = Math.round(bestBin2.gSum / bestBin2.count);
            const b2 = Math.round(bestBin2.bSum / bestBin2.count);
            accent2Hex = '#' + [r2, g2, b2].map(x => x.toString(16).padStart(2, '0')).join('');
          } else {
            const hslAcc = rgbToHsl(accentR, accentG, accentB);
            const h2 = (hslAcc.h + 40) % 360;
            accent2Hex = hslToHex(h2, hslAcc.s, hslAcc.l);
          }

          const result = {
            accent: accentHex,
            accent2: accent2Hex,
            luminance: meanLuminance,
            saturation: meanSaturation
          };

          if (coverAnalysisCache.size >= 50) {
            const oldestKey = coverAnalysisCache.keys().next().value;
            coverAnalysisCache.delete(oldestKey);
          }
          coverAnalysisCache.set(imgSrc, result);
          resolve(result);
        } catch (err) {
          resolve({ accent: '#6750A4', accent2: '#9A82DB', luminance: 0.2, saturation: 0.5 });
        }
      };
      img.onerror = () => {
        resolve({ accent: '#6750A4', accent2: '#9A82DB', luminance: 0.2, saturation: 0.5 });
      };
      img.src = imgSrc;
    });
  }

  let activeMeshLayer = 'a';
  let lastMeshKey = '';
  /** @type {[string, string, string] | null} */
  let lastMeshArgs = null;
  /** @type {string[] | null} */
  let meshCoverColors = null;

  function mixHex(/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ t) {
    const c1 = hexToRgb(a);
    const c2 = hexToRgb(b);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const bl = Math.round(c1.b + (c2.b - c1.b) * t);
    return '#' + [r, g, bl].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
  }

  function colorToHex(/** @type {string} */ c) {
    if (!c) return '#9E9E9E';
    if (typeof c === 'string' && c.startsWith('#')) return c;
    const match = typeof c === 'string' && c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
    }
    return c;
  }

  async function refreshMeshCover() {
    if (!getAdv('mesh_cover_color', false) || !state.currentTrack) {
      meshCoverColors = null;
      return;
    }
    const trackBefore = state.currentTrack;
    const thumbUrl = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : state.currentTrack.thumbnail) || '';
    if (!thumbUrl) {
      meshCoverColors = null;
      lastMeshKey = '';
      if (lastMeshArgs) updateMeshGradient(...lastMeshArgs);
      return;
    }
    try {
      const [a, b] = await getCoverDominantColors(thumbUrl);
      const currentUrl = (state.currentTrack && (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : state.currentTrack.thumbnail)) || '';
      if (!state.currentTrack || (state.currentTrack !== trackBefore && state.currentTrack.id !== trackBefore?.id) || currentUrl !== thumbUrl) return;
      meshCoverColors = [colorToHex(a), colorToHex(b || a)];
      lastMeshKey = '';
      if (lastMeshArgs) updateMeshGradient(...lastMeshArgs);
    } catch (_) {}
  }

  let coverBgIdx = 0;
  let activeCoverBgUrl = '';

  function setCoverBg(/** @type {string} */ url) {
    const enabled = getAdv('cover_bg', true);
    const layers = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#cover-bg .cover-bg-layer'));
    if (!enabled || !url) {
      activeCoverBgUrl = '';
      document.body.classList.remove('cover-bg-on');
      layers.forEach(l => l.classList.remove('on'));
      return;
    }

    activeCoverBgUrl = url;
    document.body.classList.add('cover-bg-on');

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      if (activeCoverBgUrl !== url) return;
      if (layers.length < 2) return;
      const nextIdx = 1 - coverBgIdx;
      const nextLayer = /** @type {HTMLElement} */ (layers[nextIdx]);
      const prevLayer = layers[coverBgIdx];

      nextLayer.style.backgroundImage = `url(${JSON.stringify(url)})`;
      nextLayer.classList.add('on');
      prevLayer.classList.remove('on');
      coverBgIdx = nextIdx;
    };
    img.src = url;
  }

  /** @type {{ el: HTMLElement, kind: string, view: HTMLElement | null, home: { parent: ParentNode | null, next: ChildNode | null } }[]} */
  const fxItems = [];
  function registerFx(/** @type {HTMLElement | null} */ el, /** @type {string} */ kind, /** @type {HTMLElement | null} */ viewEl) {
    if (!el || fxItems.some(i => i.el === el)) return;
    fxItems.push({ el, kind, view: viewEl || null, home: { parent: el.parentNode, next: el.nextSibling } });
    el.dataset.fx = kind;
  }
  function applyFxClip() {
    const free = document.body.classList.contains('no-clip-fx');
    const root = document.getElementById('fx-root');
    fxItems.forEach(i => {
      if (free) {
        if (root) root.appendChild(i.el);
        i.el.classList.add('fx-free');
      } else {
        if (i.home && i.home.parent) {
          i.home.parent.insertBefore(i.el, i.home.next && i.home.next.parentNode === i.home.parent ? i.home.next : null);
        }
        i.el.classList.remove('fx-free');
      }
    });
    updateFxVisibility();
  }
  function updateFxVisibility() {
    const free = document.body.classList.contains('no-clip-fx');
    fxItems.forEach(i => {
      const isHidden = (free && i.view && !i.view.classList.contains('active'));
      i.el.classList.toggle('fx-hidden', !!isHidden);
      i.el.style.display = '';
    });
  }

  function updateMeshGradient(/** @type {string} */ accentHex, /** @type {string} */ accent2Hex, /** @type {string} */ mode) {
    lastMeshArgs = [accentHex, accent2Hex, mode];
    const meshA = document.getElementById('bg-mesh-a');
    const meshB = document.getElementById('bg-mesh-b');
    if (!meshA || !meshB) return;

    const isEnabled = getAdv('mesh_gradient', false) && (state.meshBrightness > 0);
    if (!isEnabled) {
      meshA.style.opacity = '0';
      meshB.style.opacity = '0';
      lastMeshKey = '';
      return;
    }

    let c1 = accentHex;
    let c2 = accent2Hex;
    const useCover = getAdv('mesh_cover_color', false);
    if (useCover && meshCoverColors) {
      c1 = meshCoverColors[0];
      c2 = meshCoverColors[1];
    }
    const followIntensity = getAdv('mesh_follow_intensity', true);
    if (followIntensity) {
      const k = Math.max(0, Math.min(1, (Number.isFinite(state.themeIntensity) ? state.themeIntensity : 100) / 100));
      c1 = mixHex(c1, '#9E9E9E', 1 - k);
      c2 = mixHex(c2, '#9E9E9E', 1 - k);
    }

    const meshKey = `${c1}_${c2}_${mode}_${state.meshBrightness}_${followIntensity}_${useCover}`;
    if (meshKey === lastMeshKey) return;
    lastMeshKey = meshKey;

    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);

    const brightnessScale = Math.max(0, Math.min(100, state.meshBrightness)) / 100;
    const a1 = (mode === 'light' ? 0.22 : 0.55) * brightnessScale;
    const a2 = (mode === 'light' ? 0.18 : 0.45) * brightnessScale;

    const accentRgba = `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, ${a1})`;
    const accent2Rgba = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${a2})`;

    const gradient = `linear-gradient(to bottom, transparent 35%, var(--md-sys-color-background) 85%), ` +
      `radial-gradient(ellipse at var(--mesh-p1x, 20%) var(--mesh-p1y, 0%), ${accentRgba} 0%, transparent 70%), ` +
      `radial-gradient(ellipse at var(--mesh-p2x, 85%) var(--mesh-p2y, 5%), ${accent2Rgba} 0%, transparent 65%), ` +
      `var(--md-sys-color-background)`;

    const target = activeMeshLayer === 'a' ? meshB : meshA;
    const current = activeMeshLayer === 'a' ? meshA : meshB;

    target.style.background = gradient;
    target.style.opacity = '1';
    current.style.opacity = '0';

    const previewBg = document.getElementById('mesh-preview-bg');
    if (previewBg) {
      previewBg.style.background = gradient;
    }

    activeMeshLayer = activeMeshLayer === 'a' ? 'b' : 'a';
  }

  let currentEffectiveMode = state.themeMode === 'auto' ? 'dark' : state.themeMode;

  function relLuminance(/** @type {string} */ hex) {
    const c = hexToRgb(hex);
    const f = (/** @type {number} */ v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function contrastRatio(/** @type {number} */ a, /** @type {number} */ b) {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }

  function computeButtonColors(/** @type {string} */ accentHex, /** @type {string} */ mode) {
    const rgb = hexToRgb(accentHex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const s = hsl.s;
    const dark = mode === 'dark';
    let l = dark ? Math.min(74, Math.max(52, hsl.l)) : Math.min(46, Math.max(32, hsl.l));
    const lumAt = (/** @type {number} */ L) => relLuminance(hslToHex(hsl.h, s, L));
    while (lumAt(l) > 0.42 && l > 26) l -= 1;
    const mid = lumAt(l);
    if (mid > 0.18 && mid < 0.23) {
      while (lumAt(l) > 0.18 && l > 22) l -= 1;
    }
    const bg = hslToHex(hsl.h, s, l);
    const bgLum = relLuminance(bg);
    const darkText = '#1B1B1F';
    const fg = contrastRatio(bgLum, 1) >= contrastRatio(bgLum, relLuminance(darkText)) ? '#FFFFFF' : darkText;
    const hover = hslToHex(hsl.h, s, Math.max(0, Math.min(100, l + (dark ? 5 : -5))));
    return { bg, fg, hover, bgLum };
  }

  function applyButtonAccent(/** @type {string} */ hexColor, /** @type {string} */ mode, /** @type {boolean} */ mono) {
    const themeAccent = document.documentElement.style.getPropertyValue('--md-sys-color-primary')?.trim() || hexColor || '#6750A4';
    const isMono = mono !== undefined ? mono : (state.themeIntensity < 8);
    const c = isMono ? (mode === 'light' ? { bg: '#111111', fg: '#FFFFFF', hover: '#333333' } : { bg: '#FFFFFF', fg: '#121212', hover: '#E6E6E6' }) : computeButtonColors(themeAccent, mode);
    const root = document.documentElement.style;
    root.setProperty('--btn-primary-bg', c.bg);
    root.setProperty('--btn-primary-fg', c.fg);
    root.setProperty('--btn-primary-hover', c.hover);
  }

  // see-through panels (UI opacity below 100%) read badly on a light theme: go solid while it is light, then back
  /** @type {string | null} */
  let lastEffectiveMode = null;
  function onEffectiveModeChanged(/** @type {string} */ mode) {
    if (lastEffectiveMode === null || !document.getElementById('slider-ui-alpha')) {
      // first paint on a light theme with the default opacity: start solid
      if (mode === 'light' && localStorage.getItem('uriel_ui_alpha') === null && document.getElementById('slider-ui-alpha')) {
        localStorage.setItem('uriel_ui_alpha', '100');
        document.documentElement.style.setProperty('--ui-alpha', '100%');
        /** @type {HTMLInputElement} */ (document.getElementById('slider-ui-alpha')).value = '100';
        localStorage.setItem('uriel_ui_alpha_light_prev', DEFAULT_UI_ALPHA);
        localStorage.setItem('uriel_ui_alpha_light_auto', '100');
      }
      lastEffectiveMode = mode;
      return;
    }
    if (lastEffectiveMode !== mode) {
      if (mode === 'light') {
        const now = currentUiAlpha();
        if (now < 100) {
          localStorage.setItem('uriel_ui_alpha_light_prev', String(now));
          localStorage.setItem('uriel_ui_alpha_light_auto', '100');
          setUiAlphaViaSlider(100);
        }
      } else if (lastEffectiveMode === 'light') {
        const auto = localStorage.getItem('uriel_ui_alpha_light_auto'), prev = localStorage.getItem('uriel_ui_alpha_light_prev');
        if (auto !== null && prev !== null && currentUiAlpha() === Number(auto)) setUiAlphaViaSlider(Number(prev));
        localStorage.removeItem('uriel_ui_alpha_light_auto');
        localStorage.removeItem('uriel_ui_alpha_light_prev');
      }
      lastEffectiveMode = mode;
    }
  }

  function applyTheme(/** @type {string} */ hexColor, /** @type {string} */ mode, intensity = state.themeIntensity, brightness = state.themeBrightness, /** @type {string | null} */ accent2 = null, isAuto = false) {
    currentEffectiveMode = mode;
    const site = !isAuto && mode === 'dark' ? activeSiteTheme() : null;
    if (site) { hexColor = site.accent; accent2 = site.accent2; }
    generateM3Palette(hexColor, mode, intensity, brightness);
    const themeAccent = document.documentElement.style.getPropertyValue('--md-sys-color-primary')?.trim() || hexColor;
    // a website theme is never the gray one, whatever the intensity slider says
    const mono = !site && intensity < 8;
    applyButtonAccent(themeAccent, mode, mono);
    document.body.classList.toggle('theme-light', mode === 'light');
    document.body.classList.toggle('theme-dark', mode === 'dark');
    document.body.classList.toggle('intensity-zero', mono);
    syncSiteThemeCards();
    onEffectiveModeChanged(mode);
    if (el.themeSwatches) {
      el.themeSwatches.forEach((/** @type {HTMLElement} */ sw) => sw.classList.toggle('active', !site && !!(state.themeAccent && sw.dataset.color && sw.dataset.color.toLowerCase() === state.themeAccent.toLowerCase())));
    }
    // not while the picker is open: that reset the picker under the pointer
    if (el.customColorInput && document.activeElement !== el.customColorInput) el.customColorInput.value = hexColor;

    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (el.sliderHue) el.sliderHue.value = String(hsl.h);
    if (el.valHue) el.valHue.textContent = hsl.h + '°';

    if (el.sliderIntensity) {
      el.sliderIntensity.disabled = isAuto;
      el.sliderIntensity.value = String(intensity);
      const parent = el.sliderIntensity.closest('.setting-item');
      if (parent) parent.classList.toggle('is-disabled', isAuto);
    }
    if (el.valIntensity) el.valIntensity.textContent = intensity + '%';

    if (el.sliderBrightness) {
      el.sliderBrightness.disabled = isAuto;
      el.sliderBrightness.value = String(brightness);
      const parent = el.sliderBrightness.closest('.setting-item');
      if (parent) parent.classList.toggle('is-disabled', isAuto);
    }
    if (el.valBrightness) el.valBrightness.textContent = brightness + '%';

    let resolvedAccent2 = accent2;
    if (!resolvedAccent2) {
      const h2 = (hsl.h + 40) % 360;
      resolvedAccent2 = hslToHex(h2, hsl.s, hsl.l);
    }

    updateMeshGradient(mono ? '#9E9E9E' : hexColor, mono ? '#757575' : resolvedAccent2, mode);
    refreshCachedThemeColors();
    saveThemeBootSoon();
  }

  // what the theme painted, for theme-boot.js to put back on the first frame of the next start (otherwise the
  // default purple shows until start-up gets this far)
  /** @type {ReturnType<typeof setTimeout> | null} */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let themeBootTimer = null;
  function saveThemeBoot() {
    if (themeBootTimer) clearTimeout(themeBootTimer);
    themeBootTimer = null;
    try {
      /** @type {Record<string, string>} */
      const mesh = {};
      for (const id of ['bg-mesh-a', 'bg-mesh-b']) { const m = document.getElementById(id); if (m) mesh[id] = m.style.cssText; }
      localStorage.setItem('uriel_theme_boot', JSON.stringify({
        root: document.documentElement.style.cssText,
        body: ['theme-light', 'theme-dark', 'intensity-zero'].filter((c) => document.body.classList.contains(c)),
        mesh,
      }));
    } catch (e) {}
  }
  function saveThemeBootSoon() { if (!themeBootTimer) themeBootTimer = setTimeout(saveThemeBoot, 1500); }
  window.addEventListener('pagehide', saveThemeBoot);

  // Auto-theme palettes touch dozens of CSS vars at once; a root view transition
  // crossfades the whole old/new palette instead of snapping.
  function smoothThemeSwap(/** @type {() => void} */ fn) {
    if (!document.startViewTransition || document.hidden || document.body.classList.contains('perf') || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
    const root = document.documentElement;
    root.classList.add('theme-vt');
    const vt = document.startViewTransition(fn);
    vt.finished.finally(() => root.classList.remove('theme-vt'));
  }

  function updateThemeFromState() {
    if (state.themeMode === 'auto') {
      const coverThumb = (state.currentTrack && (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : state.currentTrack.thumbnail)) || '';
      if (coverThumb) {
        analyzeCover(coverThumb).then(analysis => {
          if (state.themeMode !== 'auto') return;
          // a slow analysis of an earlier song's cover mustn't repaint the theme after a skip
          const nowThumb = (state.currentTrack && (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : state.currentTrack.thumbnail)) || '';
          if (nowThumb !== coverThumb) return;

          const derivedMode = analysis.luminance > 0.58 ? 'light' : 'dark';
          const derivedIntensity = Math.min(85, Math.max(20, Math.round(analysis.saturation * 100 * 0.9)));
          let derivedBrightness;
          if (derivedMode === 'dark') {
            derivedBrightness = Math.min(60, Math.max(40, Math.round(40 + (Math.min(0.58, analysis.luminance) / 0.58) * 20)));
          } else {
            const normLum = Math.max(0, Math.min(1, (analysis.luminance - 0.58) / (1 - 0.58)));
            derivedBrightness = Math.min(75, Math.max(55, Math.round(55 + normLum * 20)));
          }

          smoothThemeSwap(() => applyTheme(analysis.accent, derivedMode, derivedIntensity, derivedBrightness, analysis.accent2, true));
        });
      } else {
        applyTheme(state.themeAccent, 'dark', state.themeIntensity, state.themeBrightness, null, true);
      }
    } else {
      applyTheme(state.themeAccent, state.themeMode, state.themeIntensity, state.themeBrightness, null, false);
    }

    if (el.themeModeBtns) {
      el.themeModeBtns.forEach((/** @type {HTMLElement} */ btn) => btn.classList.toggle('active', btn.dataset.themeMode === state.themeMode));
    }
  }

  const el = {
    btnMinimize: /** @type {HTMLButtonElement} */ (document.getElementById('btn-minimize')),
                          btnMaximize: /** @type {HTMLButtonElement} */ (document.getElementById('btn-maximize')),
                          btnClose: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close')),

                          searchInput: /** @type {HTMLInputElement} */ (document.getElementById('search-input')),
                          searchClearBtn: /** @type {HTMLButtonElement} */ (document.getElementById('search-clear-btn')),
                          searchIconBtn: /** @type {HTMLButtonElement} */ (document.getElementById('search-icon-btn')),
                          platformYt: /** @type {HTMLButtonElement} */ (document.getElementById('platform-yt')),
                          platformYtm: /** @type {HTMLButtonElement} */ (document.getElementById('platform-ytm')),
                          platformSc: /** @type {HTMLButtonElement} */ (document.getElementById('platform-sc')),

                          navActiveIndicator: /** @type {HTMLElement} */ (document.getElementById('nav-active-indicator')),
                          navDiscover: /** @type {HTMLButtonElement} */ (document.getElementById('nav-discover')),
                          navFavorites: /** @type {HTMLButtonElement} */ (document.getElementById('nav-favorites')),
                          navAlbums: /** @type {HTMLButtonElement} */ (document.getElementById('nav-albums')),
                          navLocal: /** @type {HTMLButtonElement} */ (document.getElementById('nav-local')),
                          navHistory: /** @type {HTMLButtonElement} */ (document.getElementById('nav-history')),
                          navQueue: /** @type {HTMLElement} */ (document.getElementById('nav-queue')),
                          navSettings: /** @type {HTMLButtonElement} */ (document.getElementById('nav-settings')),
                          favoritesCount: /** @type {HTMLElement} */ (document.getElementById('favorites-count')),
                          localCount: /** @type {HTMLElement} */ (document.getElementById('local-count')),
                          queueCount: /** @type {HTMLElement} */ (document.getElementById('queue-count')),

                          presetsContainer: /** @type {HTMLElement} */ (document.getElementById('presets-container')),
                          btnSavePresetDialog: /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-preset-dialog')),
                          savePresetModal: /** @type {HTMLElement} */ (document.getElementById('save-preset-modal')),
                          newPresetName: /** @type {HTMLInputElement} */ (document.getElementById('new-preset-name')),
                          btnCancelPreset: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-preset')),
                          btnConfirmSavePreset: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-save-preset')),

                          renamePresetModal: /** @type {HTMLElement} */ (document.getElementById('rename-preset-modal')),
                          renamePresetName: /** @type {HTMLInputElement} */ (document.getElementById('rename-preset-name')),
                          btnCancelRenamePreset: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-rename-preset')),
                          btnConfirmRenamePreset: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-rename-preset')),

                          playlistsList: /** @type {HTMLElement} */ (document.getElementById('playlists-list')),
                          btnNewPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-new-playlist')),

                          viewDiscover: /** @type {HTMLElement} */ (document.getElementById('view-discover')),
                          viewFavorites: /** @type {HTMLElement} */ (document.getElementById('view-favorites')),
                          viewAlbums: /** @type {HTMLElement} */ (document.getElementById('view-albums')),
                          viewLocal: /** @type {HTMLElement} */ (document.getElementById('view-local')),
                          viewHistory: /** @type {HTMLElement} */ (document.getElementById('view-history')),
                          viewQueue: /** @type {HTMLElement} */ (document.getElementById('view-queue')),
                          viewPlaylistDetail: /** @type {HTMLElement} */ (document.getElementById('view-playlist-detail')),
                          viewAlbum: /** @type {HTMLElement} */ (document.getElementById('view-album')),
                          viewArtist: /** @type {HTMLElement} */ (document.getElementById('view-artist')),
                          viewSettings: /** @type {HTMLElement} */ (document.getElementById('view-settings')),

                          btnBackAlbum: /** @type {HTMLButtonElement} */ (document.getElementById('btn-back-album')),
                          albumDetailCover: /** @type {HTMLElement} */ (document.getElementById('album-detail-cover')),
                          albumDetailTitle: /** @type {HTMLElement} */ (document.getElementById('album-detail-title')),
                          albumDetailArtist: /** @type {HTMLButtonElement} */ (document.getElementById('album-detail-artist')),
                          albumDetailCount: /** @type {HTMLElement} */ (document.getElementById('album-detail-count')),
                          btnPlayAlbum: /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-album')),
                          albumTracksList: /** @type {HTMLElement} */ (document.getElementById('album-tracks-list')),

                          artistHero: /** @type {HTMLElement} */ (document.getElementById('artist-hero')),
                          artistHeroImg: /** @type {HTMLImageElement} */ (document.getElementById('artist-hero-img')),
                          artistFansLine: /** @type {HTMLElement} */ (document.getElementById('artist-fans-line')),
                          btnBackArtist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-back-artist')),
                          artistVerifiedBadge: /** @type {HTMLElement} */ (document.getElementById('artist-verified-badge')),
                          artistProfileName: /** @type {HTMLElement} */ (document.getElementById('artist-profile-name')),
                          artistProfileBio: /** @type {HTMLElement} */ (document.getElementById('artist-profile-bio')),
                          btnPlayArtistTracks: /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-artist-tracks')),
                          artistTracksCount: /** @type {HTMLElement} */ (document.getElementById('artist-tracks-count')),
                          artistTracksList: /** @type {HTMLElement} */ (document.getElementById('artist-tracks-list')),

                          discoverEmpty: /** @type {HTMLElement} */ (document.getElementById('discover-empty')),
                          searchResultsContainer: /** @type {HTMLElement} */ (document.getElementById('search-results-container')),
                          searchTracksList: /** @type {HTMLElement} */ (document.getElementById('search-tracks-list')),
                          suggestionChips: /** @type {HTMLElement} */ (document.getElementById('suggestion-chips')),

                          favoritesTracksList: /** @type {HTMLElement} */ (document.getElementById('favorites-tracks-list')),
                          favoritesSearchInput: /** @type {HTMLInputElement} */ (document.getElementById('favorites-search-input')),
                          favoritesSort: /** @type {HTMLSelectElement} */ (document.getElementById('favorites-sort')),
                          playlistSearchInput: /** @type {HTMLInputElement} */ (document.getElementById('playlist-search-input')),
                          playlistSort: /** @type {HTMLSelectElement} */ (document.getElementById('playlist-sort')),
                          favoritesSubtitle: /** @type {HTMLElement} */ (document.getElementById('favorites-subtitle')),
                          localTracksList: /** @type {HTMLElement} */ (document.getElementById('local-tracks-list')),
                          localSearchInput: /** @type {HTMLInputElement} */ (document.getElementById('local-search-input')),
                          localSubtitle: /** @type {HTMLElement} */ (document.getElementById('local-subtitle')),
                          btnAddLocalFiles: /** @type {HTMLButtonElement} */ (document.getElementById('btn-add-local-files')),
                          btnAddLocalFilesEmpty: /** @type {HTMLButtonElement} */ (document.getElementById('btn-add-local-files-empty')),
                          historyTracksList: /** @type {HTMLElement} */ (document.getElementById('history-tracks-list')),
                          btnClearHistory: /** @type {HTMLButtonElement} */ (document.getElementById('btn-clear-history')),
                          queueTracksList: /** @type {HTMLElement} */ (document.getElementById('queue-tracks-list')),
                          btnClearQueue: /** @type {HTMLButtonElement} */ (document.getElementById('btn-clear-queue')),
                          playlistTracksList: /** @type {HTMLElement} */ (document.getElementById('playlist-tracks-list')),
                          playlistDetailTitle: /** @type {HTMLElement} */ (document.getElementById('playlist-detail-title')),
                          playlistDetailCount: /** @type {HTMLElement} */ (document.getElementById('playlist-detail-count')),
                          btnBackPlaylists: /** @type {HTMLButtonElement} */ (document.getElementById('btn-back-playlists')),
                          btnPlayPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-playlist')),
                          btnDeletePlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-delete-playlist')),

                          rightPanel: /** @type {HTMLElement} */ (document.getElementById('right-panel')),
                          btnCloseRightPanel: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-right-panel')),
                          btnToggleLyricsPanel: /** @type {HTMLButtonElement} */ (document.getElementById('btn-toggle-lyrics-panel')),
                          btnLyricsMode: /** @type {HTMLButtonElement} */ (document.getElementById('btn-lyrics-mode')),
                          coverContainer: /** @type {HTMLElement} */ (document.getElementById('cover-container')),
                          rightPanelArtworkBox: /** @type {HTMLElement} */ (document.getElementById('right-panel-artwork-box')),
                          rightPanelCover: /** @type {HTMLImageElement} */ (document.getElementById('right-panel-cover')),
                          rightPanelFallback: /** @type {HTMLElement} */ (document.getElementById('right-panel-fallback')),
                          rightPanelTitle: /** @type {HTMLElement} */ (document.getElementById('right-panel-title')),
                          rightPanelArtist: /** @type {HTMLElement} */ (document.getElementById('right-panel-artist')),
                          lyricsStatus: /** @type {HTMLElement} */ (document.getElementById('lyrics-status')),
                          lyricsContainer: /** @type {HTMLElement} */ (document.getElementById('lyrics-container')),
                          lyricsHint: /** @type {HTMLElement} */ (document.getElementById('lyrics-hint')),
                          btnTranslateLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-translate-lyrics')),
                          btnTrEnabled: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tr-enabled')),
                          selectTrLang: /** @type {HTMLSelectElement} */ (document.getElementById('select-tr-lang')),
                          btnTrAuto: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tr-auto')),
                          btnTvKaraoke: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tv-karaoke')),
                          tvKaraoke: /** @type {HTMLElement} */ (document.getElementById('tv-karaoke')),
                          tvBg: /** @type {HTMLElement} */ (document.getElementById('tv-bg')),
                          tvCover: /** @type {HTMLImageElement} */ (document.getElementById('tv-cover')),
                          tvKaraokeContent: /** @type {HTMLElement} */ (document.getElementById('tv-karaoke-content')),
                          tvKaraokeClose: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-tv-karaoke')),
                          tvKaraokeTitle: /** @type {HTMLElement} */ (document.getElementById('tv-karaoke-title')),
                          tvKaraokeArtist: /** @type {HTMLElement} */ (document.getElementById('tv-karaoke-artist')),
                          btnTvkFav: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tvk-fav')),
                          tvkFavIcon: /** @type {HTMLElement} */ (document.getElementById('tvk-fav-icon')),
                          btnTvkShuffle: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tvk-shuffle')),
                          btnTvkRepeat: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tvk-repeat')),
                          tvkVolumeSlider: /** @type {HTMLInputElement} */ (document.getElementById('tvk-volume-slider')),

                          playbar: /** @type {HTMLElement} */ (document.getElementById('playbar')),
                          playbarArtwork: /** @type {HTMLImageElement} */ (document.getElementById('playbar-artwork')),
                          artworkFallback: /** @type {HTMLElement} */ (document.getElementById('artwork-fallback')),
                          playbarTitle: /** @type {HTMLElement} */ (document.getElementById('playbar-title')),
                          playbarArtist: /** @type {HTMLElement} */ (document.getElementById('playbar-artist')),
                          btnToggleFav: /** @type {HTMLButtonElement} */ (document.getElementById('btn-toggle-fav')),
                          favIcon: /** @type {HTMLElement} */ (document.getElementById('fav-icon')),
                          btnShuffle: /** @type {HTMLButtonElement} */ (document.getElementById('btn-shuffle')),
                          btnPrev: /** @type {HTMLButtonElement} */ (document.getElementById('btn-prev')),
                          btnPlayPause: /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-pause')),
                          playIcon: /** @type {HTMLElement} */ (document.getElementById('play-icon')),
                          pauseIcon: /** @type {HTMLElement} */ (document.getElementById('pause-icon')),
                          playbarSpinner: /** @type {HTMLElement} */ (document.getElementById('playbar-spinner')),
                          btnNext: /** @type {HTMLButtonElement} */ (document.getElementById('btn-next')),
                          btnRepeat: /** @type {HTMLButtonElement} */ (document.getElementById('btn-repeat')),

                          timeCurrent: /** @type {HTMLElement} */ (document.getElementById('time-current')),
                          timeDuration: /** @type {HTMLElement} */ (document.getElementById('time-duration')),
                          scrubberTrack: /** @type {HTMLElement} */ (document.getElementById('scrubber-track')),

                          visualizerCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('visualizer-canvas')),
                          btnOpenSettings: /** @type {HTMLButtonElement} */ (document.getElementById('btn-open-settings')),
                          btnOpenVisualSettings: /** @type {HTMLElement} */ (document.getElementById('btn-open-visual-settings')),
                          settingsModifiedDot: /** @type {HTMLElement} */ (document.getElementById('settings-modified-dot')),
                          btnVolumeMute: /** @type {HTMLButtonElement} */ (document.getElementById('btn-volume-mute')),
                          volumeIcon: /** @type {HTMLElement} */ (document.getElementById('volume-icon')),
                          volumeMutedIcon: /** @type {HTMLElement} */ (document.getElementById('volume-muted-icon')),
                          volumeSlider: /** @type {HTMLInputElement} */ (document.getElementById('volume-slider')),

                          downloadModal: /** @type {HTMLElement} */ (document.getElementById('download-modal')),
                          btnCloseDownloadModal: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-download-modal')),
                          btnCancelDownload: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-download')),
                          btnConfirmDownload: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-download')),
                          downloadSpinner: /** @type {HTMLElement} */ (document.getElementById('download-spinner')),
                          downloadBtnText: /** @type {HTMLElement} */ (document.getElementById('download-btn-text')),
                          downloadPreviewThumb: /** @type {HTMLImageElement} */ (document.getElementById('download-preview-thumb')),
                          downloadPreviewFallback: /** @type {HTMLElement} */ (document.getElementById('download-preview-fallback')),
                          downloadPreviewTitle: /** @type {HTMLElement} */ (document.getElementById('download-preview-title')),
                          downloadPreviewArtist: /** @type {HTMLElement} */ (document.getElementById('download-preview-artist')),
                          btnPlaybarMore: /** @type {HTMLButtonElement} */ (document.getElementById('btn-playbar-more')),

                          audioSettingsModal: /** @type {HTMLElement} */ (document.getElementById('audio-settings-modal')),
                          btnCloseSettings: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-settings')),
                          sleepTimerStatus: /** @type {HTMLElement} */ (document.getElementById('sleep-timer-status')),
                          btnResetAudio: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-audio')),
                          commandPalette: /** @type {HTMLElement} */ (document.getElementById('command-palette')),
                          commandPaletteInput: /** @type {HTMLInputElement} */ (document.getElementById('command-palette-input')),
                          commandPaletteResults: /** @type {HTMLElement} */ (document.getElementById('command-palette-results')),
                          btnDedupePlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-dedupe-playlist')),
                          btnDedupePlaylistLabel: /** @type {HTMLElement} */ (document.getElementById('btn-dedupe-playlist-label')),

                          btnToggleHqAudio: /** @type {HTMLButtonElement} */ (document.getElementById('toggle-hq-audio')),
                          hqEnhancerCard: document.querySelector('.hq-enhancer-card'),
                          hqPanelWrapper: /** @type {HTMLElement} */ (document.getElementById('hq-panel-wrapper')),
                          hqEngineSelect: /** @type {HTMLSelectElement} */ (document.getElementById('hq-engine-select')),
                          sliderHqVocal: /** @type {HTMLInputElement} */ (document.getElementById('slider-hq-vocal')),
                          valHqVocal: /** @type {HTMLElement} */ (document.getElementById('val-hq-vocal')),
                          sliderHqAir: /** @type {HTMLInputElement} */ (document.getElementById('slider-hq-air')),
                          valHqAir: /** @type {HTMLElement} */ (document.getElementById('val-hq-air')),
                          sliderHqBass: /** @type {HTMLInputElement} */ (document.getElementById('slider-hq-bass')),
                          valHqBass: /** @type {HTMLElement} */ (document.getElementById('val-hq-bass')),
                          hqPresetChips: /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.hq-preset-chip')),

                          sliderSpeed: /** @type {HTMLInputElement} */ (document.getElementById('slider-speed')),
                          valSpeed: /** @type {HTMLElement} */ (document.getElementById('val-speed')),
                          sliderSpeedPitch: /** @type {HTMLInputElement} */ (document.getElementById('slider-speed-pitch')),
                          valSpeedPitch: /** @type {HTMLElement} */ (document.getElementById('val-speed-pitch')),
                          sliderPitch: /** @type {HTMLInputElement} */ (document.getElementById('slider-pitch')),
                          valPitch: /** @type {HTMLElement} */ (document.getElementById('val-pitch')),
                          sliderReverb: /** @type {HTMLInputElement} */ (document.getElementById('slider-reverb')),
                          valReverb: /** @type {HTMLElement} */ (document.getElementById('val-reverb')),
                          sliderDistortion: /** @type {HTMLInputElement} */ (document.getElementById('slider-distortion')),
                          valDistortion: /** @type {HTMLElement} */ (document.getElementById('val-distortion')),
                          sliderGain: /** @type {HTMLInputElement} */ (document.getElementById('slider-gain')),
                          valGain: /** @type {HTMLElement} */ (document.getElementById('val-gain')),
                          sliderEcho: /** @type {HTMLInputElement} */ (document.getElementById('slider-echo')),
                          valEcho: /** @type {HTMLElement} */ (document.getElementById('val-echo')),
                          sliderEqLow: /** @type {HTMLInputElement} */ (document.getElementById('slider-eq-low')),
                          valEqLow: /** @type {HTMLElement} */ (document.getElementById('val-eq-low')),
                          sliderEqMid: /** @type {HTMLInputElement} */ (document.getElementById('slider-eq-mid')),
                          valEqMid: /** @type {HTMLElement} */ (document.getElementById('val-eq-mid')),
                          sliderEqHigh: /** @type {HTMLInputElement} */ (document.getElementById('slider-eq-high')),
                          valEqHigh: /** @type {HTMLElement} */ (document.getElementById('val-eq-high')),
                          eqBands: /** @type {HTMLElement} */ (document.getElementById('eq-bands')),
                          btnResetEqBands: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-eq-bands')),

                          sliderScale: /** @type {HTMLInputElement} */ (document.getElementById('settings-slider-scale') || document.getElementById('slider-scale')),
                          valScale: /** @type {HTMLElement} */ (document.getElementById('settings-val-scale') || document.getElementById('val-scale')),
                          sliderFontScale: /** @type {HTMLInputElement} */ (document.getElementById('slider-font-scale')),
                          valFontScale: /** @type {HTMLElement} */ (document.getElementById('val-font-scale')),
                          sliderCornerRadius: /** @type {HTMLInputElement} */ (document.getElementById('slider-corner-radius')),
                          valCornerRadius: /** @type {HTMLElement} */ (document.getElementById('val-corner-radius')),
                          sliderUiAlpha: /** @type {HTMLInputElement} */ (document.getElementById('slider-ui-alpha')),
                          valUiAlpha: /** @type {HTMLElement} */ (document.getElementById('val-ui-alpha')),
                          btnResetUiAlpha: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-ui-alpha')),
                          sliderTextAlpha: /** @type {HTMLInputElement} */ (document.getElementById('slider-text-alpha')),
                          valTextAlpha: /** @type {HTMLElement} */ (document.getElementById('val-text-alpha')),
                          btnResetTextAlpha: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-text-alpha')),
                          themeModeBtns: /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.theme-mode-btn[data-theme-mode]')),
                          themeSwatches: /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.theme-swatch')),
                          customColorInput: /** @type {HTMLInputElement} */ (document.getElementById('settings-custom-color-input')),
                          sliderHue: /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-hue')),
                          valHue: /** @type {HTMLElement} */ (document.getElementById('val-theme-hue')),
                          sliderIntensity: /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-intensity')),
                          valIntensity: /** @type {HTMLElement} */ (document.getElementById('val-theme-intensity')),
                          sliderBrightness: /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-brightness')),
                          valBrightness: /** @type {HTMLElement} */ (document.getElementById('val-theme-brightness')),

                          visualSettingsModal: /** @type {HTMLElement} */ (document.getElementById('visual-settings-modal')),
                          btnCloseVisualSettings: /** @type {HTMLElement} */ (document.getElementById('btn-close-visual-settings')),
                          btnResetVfx: /** @type {HTMLElement} */ (document.getElementById('btn-reset-vfx')),

                          createPlaylistModal: /** @type {HTMLElement} */ (document.getElementById('create-playlist-modal')),
                          newPlaylistInput: /** @type {HTMLInputElement} */ (document.getElementById('new-playlist-input')),
                          btnCancelNewPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-new-playlist')),
                          btnConfirmNewPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-new-playlist')),

                          addToPlaylistModal: /** @type {HTMLElement} */ (document.getElementById('add-to-playlist-modal')),
                          playlistPickList: /** @type {HTMLElement} */ (document.getElementById('playlist-pick-list')),
                          btnCancelAddPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-add-playlist')),

                          // Android: a stand-in that plays through the native player (mobile/native-audio.ts)
                          nativeAudio: (window.UrielAudioElement && window.UrielAudioElement(/** @type {HTMLAudioElement} */ (document.getElementById('native-audio')))) || document.getElementById('native-audio'),

                          btnAddCustomLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-add-custom-lyrics')),
                          btnSyncLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-sync-lyrics')),
                          customLyricsModal: /** @type {HTMLElement} */ (document.getElementById('custom-lyrics-modal')),
                          customLyricsTextarea: /** @type {HTMLTextAreaElement} */ (document.getElementById('custom-lyrics-textarea')),
                          customLyricsTrackTitle: /** @type {HTMLElement} */ (document.getElementById('custom-lyrics-track-title')),
                          customLyricsTrackArtist: /** @type {HTMLElement} */ (document.getElementById('custom-lyrics-track-artist')),
                          btnCloseCustomLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-custom-lyrics')),
                          btnCancelCustomLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-custom-lyrics')),
                          btnSaveCustomLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-custom-lyrics')),
                          syncModeOverlay: /** @type {HTMLElement} */ (document.getElementById('sync-mode-overlay')),
                          syncModeLyrics: /** @type {HTMLElement} */ (document.getElementById('sync-mode-lyrics')),
                          syncProgressText: /** @type {HTMLElement} */ (document.getElementById('sync-progress-text')),
                          btnRestartSync: /** @type {HTMLButtonElement} */ (document.getElementById('btn-restart-sync')),
                          btnSaveSync: /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-sync')),
                          btnCancelSync: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-sync')),

                          btnEditCurrentTrack: /** @type {HTMLButtonElement} */ (document.getElementById('btn-edit-current-track')),
                          renameTrackModal: /** @type {HTMLElement} */ (document.getElementById('rename-track-modal')),
                          inputRenameTitle: /** @type {HTMLInputElement} */ (document.getElementById('rename-track-title')),
                          inputRenameArtist: /** @type {HTMLInputElement} */ (document.getElementById('rename-track-artist')),
                          btnCancelRenameTrack: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-rename-track')),
                          btnConfirmRenameTrack: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-rename-track')),

                          btnRefreshVibe: /** @type {HTMLButtonElement} */ (document.getElementById('btn-refresh-vibe'))
  };

  // ---- Download dialog → "Trim best part": keep only part of a song (app/trim.js) ----
  const trimPart = /** @type {UrielTrimPart} */ ({});
  function getTrackTrim(/** @type {UrielTrack} */ track) { return trimPart.getTrackTrim(track); }
  function enforceTrackTrim() { return trimPart.enforceTrackTrim(); }
  function showDownloadPane(/** @type {string} */ which) { return trimPart.showDownloadPane(which); }
  function prepareTrimPane(/** @type {UrielTrack} */ track) { return trimPart.prepareTrimPane(track); }
  function forgetTrackTrims() { return trimPart.forgetTrackTrims(); }
  window.UrielApp.trim({ T, el, getTrackCanonicalId, getTrackToDownload, isSameTrack, playNext, playSmooth, playTrack, playback, primaryColor, queueFinished, safeJson, showToast, state }, trimPart);

  /** @type {const} */ (['Vocal', 'Air', 'Bass']).forEach(type => {
    const slider = el[/** @type {const} */ (`sliderHq${type}`)];
    if (slider) {
      slider.min = '-50';
      slider.max = '50';
      slider.value = state.hqSettings[type.toLowerCase()];
    }
  });

  if (el.sliderScale) el.sliderScale.value = String(state.uiScale);
  if (el.valScale) el.valScale.textContent = `${state.uiScale}%`;

  const savedFontScale = localStorage.getItem('uriel_font_scale') || '100';
  const fontVal = parseInt(savedFontScale, 10) || 100;
  if (el.sliderFontScale) el.sliderFontScale.value = fontVal.toString();
  if (el.valFontScale) el.valFontScale.textContent = `${fontVal}%`;
  document.documentElement.style.setProperty('--font-scale', ((fontVal / 100) * 0.95 * 1.25).toString());

  const savedRadius = localStorage.getItem('uriel_corner_radius') || '16';
  if (el.sliderCornerRadius) el.sliderCornerRadius.value = savedRadius;
  if (el.valCornerRadius) el.valCornerRadius.textContent = savedRadius === '16' ? 'Default' : `${savedRadius}px`;
  document.documentElement.style.setProperty('--md-shape-corner-l', `${savedRadius}px`);
  document.documentElement.style.setProperty('--md-shape-corner-m', `${Math.max(0, parseInt(savedRadius) - 4)}px`);

  applyReducedMotionSetting();

  const savedBannerBlur = parseInt(localStorage.getItem('uriel_banner_blur') || '3', 10);
  const savedBannerOpacity = parseInt(localStorage.getItem('uriel_banner_opacity') || '100', 10);
  const savedBannerFade = parseInt(localStorage.getItem('uriel_banner_fade') || '38', 10);
  const savedBannerFit = localStorage.getItem('uriel_banner_fit') || 'zoom';

  document.documentElement.style.setProperty('--banner-blur', `${savedBannerBlur}px`);
  document.documentElement.style.setProperty('--banner-opacity', `${savedBannerOpacity / 100}`);
  document.documentElement.style.setProperty('--banner-fade-base', `${savedBannerFade}%`);
  document.documentElement.style.setProperty('--banner-fade-end', `${savedBannerFade}%`);
  applyBannerFit(savedBannerFit);

  function applyUiOpacity() {
    const rawUi = parseInt(localStorage.getItem('uriel_ui_alpha') || DEFAULT_UI_ALPHA, 10);
    const rawText = parseInt(localStorage.getItem('uriel_text_alpha') || '100', 10);
    const uiAlpha = Math.max(20, Math.min(100, isNaN(rawUi) ? 100 : rawUi));
    const textAlpha = Math.max(1, Math.min(100, isNaN(rawText) ? 100 : rawText));

    document.documentElement.style.setProperty('--ui-alpha', `${uiAlpha}%`);
    document.documentElement.style.setProperty('--text-alpha', `${textAlpha}%`);

    if (el.sliderUiAlpha) el.sliderUiAlpha.value = String(uiAlpha);
    if (el.valUiAlpha) el.valUiAlpha.textContent = `${uiAlpha}%`;
    if (el.sliderTextAlpha) el.sliderTextAlpha.value = String(textAlpha);
    if (el.valTextAlpha) el.valTextAlpha.textContent = `${textAlpha}%`;
  }

  applyUiOpacity();

  updateThemeFromState();

  if (state.themeMode !== 'auto') {
    if (el.sliderIntensity) el.sliderIntensity.value = String(state.themeIntensity);
    if (el.valIntensity) el.valIntensity.textContent = state.themeIntensity + '%';
    if (el.sliderBrightness) el.sliderBrightness.value = String(state.themeBrightness);
    if (el.valBrightness) el.valBrightness.textContent = state.themeBrightness + '%';
  }

  const railDrawer = document.getElementById('rail-drawer');
  const sidebarEl = document.querySelector('.sidebar');
  const btnTogglePresets = document.getElementById('btn-toggle-presets-drawer');
  const btnTogglePlaylists = document.getElementById('btn-toggle-playlists-drawer');
  const btnCloseDrawer = document.getElementById('btn-close-rail-drawer');
  const sectionPresets = document.getElementById('drawer-section-presets');
  const sectionPlaylists = document.getElementById('drawer-section-playlists');
  const drawerTitle = document.getElementById('rail-drawer-title');

  /** @type {string | null} */
  let openDrawerState = null;
  /** @type {string | null} */
  let activeDrawerMode = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let railDrawerCloseTimeout = null;

  /** @param {HTMLElement} [triggerBtn] */

  function applyDrawerState(triggerBtn) {
    if (!railDrawer) return;

    if (!openDrawerState) {
      if (activeDrawerMode !== null) {
        if (sidebarEl) sidebarEl.classList.remove('has-drawer-open');
        if (btnTogglePresets) btnTogglePresets.classList.remove('active');
        if (btnTogglePlaylists) btnTogglePlaylists.classList.remove('active');
        activeDrawerMode = null;
        if (railDrawerCloseTimeout) {
          clearTimeout(railDrawerCloseTimeout);
          railDrawerCloseTimeout = null;
        }
        railDrawer.classList.remove('open');
        railDrawerCloseTimeout = setTimeout(() => {
          railDrawer.classList.add('hidden');
          railDrawerCloseTimeout = null;
        }, 200);
      }
    } else {
      const isPresets = openDrawerState === 'presets';
      const trigger = triggerBtn || (isPresets ? btnTogglePresets : btnTogglePlaylists);

      if (btnTogglePresets) btnTogglePresets.classList.toggle('active', isPresets);
      if (btnTogglePlaylists) btnTogglePlaylists.classList.toggle('active', !isPresets);
      railDrawer.classList.toggle('drawer-presets-mode', isPresets);

      if (activeDrawerMode === null) {
        activeDrawerMode = openDrawerState;
        if (railDrawerCloseTimeout) {
          clearTimeout(railDrawerCloseTimeout);
          railDrawerCloseTimeout = null;
        }
        railDrawer.classList.remove('hidden');
        void railDrawer.offsetWidth;
        railDrawer.classList.add('open');
        if (sectionPresets) sectionPresets.style.display = isPresets ? 'flex' : 'none';
        if (sectionPlaylists) sectionPlaylists.style.display = isPresets ? 'none' : 'flex';
        if (drawerTitle) drawerTitle.textContent = isPresets ? 'Presets' : 'Playlists';
        if (el.btnSavePresetDialog) el.btnSavePresetDialog.style.display = isPresets ? 'inline-flex' : 'none';
        if (el.btnNewPlaylist) el.btnNewPlaylist.style.display = isPresets ? 'none' : 'inline-flex';
        if (sidebarEl) sidebarEl.classList.add('has-drawer-open');
        if (isPresets) {
          renderPresets();
          requestAnimationFrame(updatePresetsFade);
        } else {
          renderPlaylistsList();
        }
      } else if (activeDrawerMode !== openDrawerState) {
        activeDrawerMode = openDrawerState;
        const outgoing = isPresets ? sectionPlaylists : sectionPresets;
        const incoming = isPresets ? sectionPresets : sectionPlaylists;

        if (outgoing) outgoing.classList.add('section-switching-out');
        setTimeout(() => {
          if (outgoing) {
            outgoing.style.display = 'none';
            outgoing.classList.remove('section-switching-out');
          }
          if (drawerTitle) drawerTitle.textContent = isPresets ? 'Presets' : 'Playlists';
          railDrawer.classList.toggle('drawer-presets-mode', isPresets);
          if (el.btnSavePresetDialog) el.btnSavePresetDialog.style.display = isPresets ? 'inline-flex' : 'none';
          if (el.btnNewPlaylist) el.btnNewPlaylist.style.display = isPresets ? 'none' : 'inline-flex';
          if (incoming) {
            incoming.style.display = 'flex';
            incoming.classList.add('section-switching-in');
            setTimeout(() => incoming.classList.remove('section-switching-in'), 200);
            if (isPresets) {
              renderPresets();
              requestAnimationFrame(updatePresetsFade);
            } else {
              renderPlaylistsList();
            }
          }
        }, 120);
      }
    }
  }

  function openDrawer(/** @type {string} */ mode, /** @type {HTMLElement} */ triggerBtn) {
    openDrawerState = mode;
    applyDrawerState(triggerBtn);
  }

  function closeDrawer() {
    openDrawerState = null;
    applyDrawerState();
  }

  if (btnTogglePresets) {
    btnTogglePresets.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawerState = openDrawerState === 'presets' ? null : 'presets';
      applyDrawerState(btnTogglePresets);
    });
  }

  if (btnTogglePlaylists) {
    btnTogglePlaylists.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawerState = openDrawerState === 'playlists' ? null : 'playlists';
      applyDrawerState(btnTogglePlaylists);
    });
  }

  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', () => closeDrawer());
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openDrawerState) closeDrawer();
  });

  const resumeAudioOnce = () => {
    initAudioContext();
    document.removeEventListener('click', resumeAudioOnce);
    document.removeEventListener('keydown', resumeAudioOnce);
  };
  document.addEventListener('click', resumeAudioOnce);
  document.addEventListener('keydown', resumeAudioOnce);

  document.addEventListener('click', (e) => {
    if (openDrawerState && railDrawer) {
      if (!railDrawer.contains(/** @type {Node} */ (e.target)) &&
        (!btnTogglePresets || !btnTogglePresets.contains(/** @type {Node} */ (e.target))) &&
        (!btnTogglePlaylists || !btnTogglePlaylists.contains(/** @type {Node} */ (e.target)))) {
        closeDrawer();
      }
    }
  });

  const PRESS_MIN = 180;
  document.addEventListener('pointerdown', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('button, .chip-btn, .mix-card, .track-row, .nav-item, .rail-icon-btn, .preset-chip');
    if (!el) return;
    el.classList.add('pressed');
    const t0 = performance.now();
    const release = () => {
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', release, true);
      setTimeout(() => el.classList.remove('pressed'), Math.max(0, PRESS_MIN - (performance.now() - t0)));
    };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
  }, true);

  const RIPPLE_SEL = '.btn-pill-primary, .btn-outline-pill, .btn-icon-pill, .chip-btn, .control-btn, .rail-icon-btn, .preset-chip, .theme-mode-btn, .nav-item, .settings-nav-btn, .audio-tab, .titlebar-btn, .mix-card, .track-row';
  // A finger landing on a button may be starting a scroll, and it rests a moment before it moves, so no delay tells
  // the two apart: a finger's ripple shows when it lifts after a real tap. Started on pointerdown (and then after a
  // 120 ms wait), every swipe that began on a button or a song lit it up as if it were pressed. Scrolling also fades
  // out any ripple already showing. The mouse ripples on press as before.
  /** @type {{ el: HTMLElement, x: number, y: number, id: number } | null} */
  let pendingRipple = null;
  const dropRipple = () => { pendingRipple = null; };
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || document.body.classList.contains('perf')) return;
    const el = /** @type {HTMLButtonElement} */ (/** @type {HTMLElement} */ (e.target).closest(RIPPLE_SEL));
    if (!el || el.disabled) return;
    if (e.pointerType === 'mouse') { spawnRipple(el, e.clientX, e.clientY); return; }
    pendingRipple = { el, x: e.clientX, y: e.clientY, id: e.pointerId };
  }, true);
  document.addEventListener('pointermove', (e) => {
    const p = pendingRipple;
    if (p && e.pointerId === p.id && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) dropRipple();
  }, true);
  const fadeRipples = () => {
    dropRipple();
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.ripple-host > .ripple')).forEach((r) => { r.style.transition = 'opacity .15s'; r.style.opacity = '0'; setTimeout(() => r.remove(), 160); });
  };
  document.addEventListener('pointercancel', fadeRipples, true);
  document.addEventListener('scroll', () => { if (pendingRipple || document.querySelector('.ripple-host > .ripple')) fadeRipples(); }, true);
  document.addEventListener('pointerup', (e) => {
    const p = pendingRipple;
    if (!p || e.pointerId !== p.id) return;
    dropRipple();
    spawnRipple(p.el, p.x, p.y);
  }, true);
  function spawnRipple(/** @type {HTMLElement} */ el, /** @type {number} */ x, /** @type {number} */ y) {
    let host = el.querySelector(':scope > .ripple-host');
    if (!host) {
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      host = document.createElement('span'); host.className = 'ripple-host'; el.appendChild(host);
    }
    const r = el.getBoundingClientRect();
    const size = Math.hypot(Math.max(x - r.left, r.right - x), Math.max(y - r.top, r.bottom - y)) * 2;
    const d = document.createElement('span'); d.className = 'ripple';
    d.style.cssText = `width:${size}px;height:${size}px;left:${x - r.left - size / 2}px;top:${y - r.top - size / 2}px`;
    host.appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }

  // Holding a finger on a song opens its menu. iOS never sends 'contextmenu' for a held finger, and
  // Android sends it mid-hold, where it fights hold-to-reorder, so the menu opens on release instead.
  const TOUCH_HOLD_MS = 450;
  (() => {
    /** @type {{ row: Element, id: number, x: number, y: number, moved: boolean, fired: boolean, native: boolean, timer?: number } | null} */
    let hold = null;
    const end = () => {
      if (!hold) return;
      clearTimeout(hold.timer);
      hold.row.classList.remove('is-held');
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      hold = null;
    };
    const openMenu = (/** @type {{ row: Element, x: number, y: number }} */ h) => {
      // swallow the click this release turns into, it would start the song
      const swallow = (/** @type {Event} */ ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 400);
      const ev = /** @type {MouseEvent & { urielHold?: boolean }} */ (new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: h.x, clientY: h.y }));
      ev.urielHold = true;
      h.row.dispatchEvent(ev);
    };
    const move = (/** @type {PointerEvent} */ e) => {
      if (!hold || e.pointerId !== hold.id || Math.hypot(e.clientX - hold.x, e.clientY - hold.y) <= 8) return;
      hold.moved = true;
      if (!hold.fired) end();
    };
    const up = (/** @type {PointerEvent} */ e) => {
      if (!hold || e.pointerId !== hold.id) return;
      const h = hold; end();
      if (h.fired && !h.moved) openMenu(h);
    };
    // Android can cancel the pointer right after its own long-press event; that still counts as a hold
    const cancel = (/** @type {PointerEvent} */ e) => {
      if (!hold || e.pointerId !== hold.id) return;
      const h = hold; end();
      if (h.fired && h.native && !h.moved) openMenu(h);
    };
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const row = /** @type {HTMLElement} */ (e.target).closest('.track-row');
      if (!row || /** @type {HTMLElement} */ (e.target).closest('button, input, select, a, .drag-grip')) return;
      end();
      hold = { row, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, fired: false, native: false };
      hold.timer = window.setTimeout(() => {
        if (!hold) return;
        hold.fired = true;
        row.classList.add('is-held');
        try { if (navigator.vibrate) navigator.vibrate(10); } catch (err) {}
      }, TOUCH_HOLD_MS);
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
      document.addEventListener('pointercancel', cancel, true);
    }, true);
    document.addEventListener('contextmenu', (/** @type {MouseEvent & { urielHold?: boolean }} */ e) => {
      if (!hold || e.urielHold || !/** @type {HTMLElement} */ (e.target).closest || !/** @type {HTMLElement} */ (e.target).closest('.track-row')) return;
      hold.native = true;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  })();

  function openTrackRenameDialog() {
    const currentTitle = state.currentTrack?.title || '';
    const currentArtist = state.currentTrack?.artist || '';

    if (el.inputRenameTitle) el.inputRenameTitle.value = currentTitle;
    if (el.inputRenameArtist) el.inputRenameArtist.value = currentArtist;
    if (el.renameTrackModal) openModal(el.renameTrackModal);
    if (el.inputRenameTitle) el.inputRenameTitle.focus();
  }

  if (el.btnEditCurrentTrack) el.btnEditCurrentTrack.addEventListener('click', openTrackRenameDialog);
  if (el.btnCancelRenameTrack) el.btnCancelRenameTrack.addEventListener('click', () => closeModal(el.renameTrackModal));

  if (el.btnConfirmRenameTrack) {
    el.btnConfirmRenameTrack.addEventListener('click', () => {
      const newTitle = el.inputRenameTitle ? el.inputRenameTitle.value.trim() || 'Untitled song' : 'Untitled song';
      const newArtist = el.inputRenameArtist ? el.inputRenameArtist.value.trim() || 'Unknown artist' : 'Unknown artist';

      // the artist's channel stays with the artist it came with, not with a name typed over it
      const artistChanged = !!state.currentTrack && state.currentTrack.artist !== newArtist;
      if (state.currentTrack) {
        state.currentTrack.title = newTitle;
        state.currentTrack.artist = newArtist;
        if (artistChanged) delete state.currentTrack.artistId;
      }

      if (state.currentTrack) updateNowPlayingUI(state.currentTrack);

      const updateArr = (/** @type {UrielTrack[]} */ arr) => {
        let updated = false;
        arr.forEach((/** @type {UrielTrack} */ t) => {
          if (t.id === state.currentTrack?.id) {
            t.title = newTitle;
            t.artist = newArtist;
            if (artistChanged) delete t.artistId;
            updated = true;
          }
        });
        return updated;
      };

      if (updateArr(state.history)) localStorage.setItem('devsize_history', JSON.stringify(state.history));
      if (updateArr(state.favorites)) localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      if (updateArr(state.queue)) renderQueueView();

      sendStateToServer();
      updateMediaSession();

      if (el.renameTrackModal) closeModal(el.renameTrackModal);
      showToast(Tm('Song info updated'), 'info');
    });
  }

  const audioEngine = new window.UrielAudioEngine();
  window.audioEngine = audioEngine;
  // Paused on a phone with the app in the background, the context is left running: a resume() there may not
  // settle until the app is opened again, so play from the lock screen or the notification stayed silent (#24)
  audioEngine.keepRunning = () => !!(document.hidden && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  /** @type {UrielHls | null} */
  let hlsInstance = null;
  viz.animationFrameId = null;

  let levelAvgDb = -120;
  function normalizeEnabled() { return localStorage.getItem('uriel_audio_normalize') === '1'; }
  function resetLevelWatcher() { levelAvgDb = -120; if (audioEngine && audioEngine.setNormalizeGainDb) audioEngine.setNormalizeGainDb(0); }
  // the phone app has no Web Audio graph (see mobile-ui.ts), so nothing to measure there
  const isPhoneApp = document.documentElement.classList.contains('is-mobile');

  // ---- yt-dlp and ffmpeg: checking for them and installing them (app/tools.js) ----
  const toolsPart = /** @type {UrielToolsPart} */ ({});
  function checkToolsStatus(promptUser = false) { return toolsPart.checkToolsStatus(promptUser); }
  function toolsReady(/** @type {string[]} */ need) { return toolsPart.toolsReady(need); }
  window.UrielApp.tools({ I18N, closeModal, createWavyProgress, isPhoneApp, openModal, state }, toolsPart);
  checkToolsStatus(true);
  // when to look up the next song: phones download it whole, so halfway through; the computer only needs
  // a stream URL (a few seconds of yt-dlp), so in the last 45 seconds (#16)
  function nextPrefetchDue(/** @type {number} */ cur, /** @type {number} */ dur) {
    if (!(dur > 0) || !(cur >= 0)) return false;
    // the computer looks the next song up once this one has played 10 s (a quick skip costs nothing), so
    // it starts at once (Riff 44); phones download whole songs, so they wait until halfway
    return isPhoneApp ? cur / dur > 0.5 : cur >= 10 || dur - cur <= 45;
  }
  window.addEventListener('uriel:storage-full', () => showToast(Tm('Storage is full: some changes could not be saved'), 'error'));
  // a library only some features need, added to the page the first time one asks for it
  /** @type {Record<string, Promise<void>>} */
  const scriptLoads = {};
  function loadScriptOnce(/** @type {string} */ src) {
    return scriptLoads[src] || (scriptLoads[src] = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.onload = () => resolve();
      tag.onerror = () => { delete scriptLoads[src]; tag.remove(); reject(new Error(`${src} did not load`)); };
      document.head.appendChild(tag);
    }));
  }

  // <audio>/<img> can't send the token header the fetch wrapper adds, so local-server media URLs carry it
  const tokenUrl = (/** @type {string} */ u) => {
    const t = window.electronAPI && window.electronAPI.serverToken;
    return t ? `${u}${u.includes('?') ? '&' : '?'}t=${encodeURIComponent(t)}` : u;
  };
  if (!isPhoneApp) setInterval(() => {
    if (!normalizeEnabled()) {
      if (levelAvgDb > -120) resetLevelWatcher();
      return;
    }
    const audio = el.nativeAudio;
    if (!audioEngine || !audioEngine.getLevelDb || !audio || audio.paused || !state.isPlaying) return;
    const db = audioEngine.getLevelDb();
    if (db > -50) {
      levelAvgDb = levelAvgDb <= -120 ? db : levelAvgDb + (db - levelAvgDb) * 0.05;
      const gainDb = Math.max(-9, Math.min(9, -17 - levelAvgDb));
      audioEngine.setNormalizeGainDb(gainDb);
    }
  }, 100);

  syncSettingsSlidersToState();
  updateHqRouting();
  renderPresets();

  function initAudioContext() {
    // the Web Audio graph needs the real element (on Android el.nativeAudio may stand in for it)
    audioEngine.init(el.nativeAudio.webElement || el.nativeAudio);
    
    if (audioEngine.ctx && audioEngine.needsResume()) {
      audioEngine.ctx.resume().catch(() => {});
    }
    
    audioEngine.setHqEnabled(state.hqEnabled);
    audioEngine.setHqSettings(state.hqSettings);
    audioEngine.setAudioSettings(effectiveAudioSettings());
    audioEngine.setVolume(state.volume, state.isMuted);
    
    startVisualizers();
  }

  function updateHqRouting() {
    audioEngine.setHqEnabled(state.hqEnabled);
    if (el.btnToggleHqAudio) el.btnToggleHqAudio.classList.toggle('active', !!state.hqEnabled);
    if (el.hqPanelWrapper) el.hqPanelWrapper.classList.toggle('expanded', !!state.hqEnabled);
    if (el.hqEnhancerCard) el.hqEnhancerCard.classList.toggle('is-expanded', !!state.hqEnabled);
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let soundSettingsSaveTimer = null;
  function persistSoundSettings() {
    if (!soundPersistenceEnabled) return;
    if (soundSettingsSaveTimer) clearTimeout(soundSettingsSaveTimer);
    soundSettingsSaveTimer = setTimeout(() => {
      soundSettingsSaveTimer = null;
      try {
        localStorage.setItem('uriel_hq_enabled', state.hqEnabled ? '1' : '0');
        localStorage.setItem('uriel_hq_settings', JSON.stringify(state.hqSettings));
        localStorage.setItem('uriel_audio_settings', JSON.stringify(state.audioSettings));
        localStorage.setItem('uriel_active_preset', state.activePresetId || '');
      } catch (e) {
        console.warn('Failed to save sound settings', e);
      }
    }, 300);
  }

  function applyHqSettings() {
    updateHqRouting();
    audioEngine.setHqSettings(state.hqSettings);
    persistSoundSettings();
  }
  
  function applyAudioSettings() {
    audioEngine.setAudioSettings(effectiveAudioSettings());
    audioEngine.setVolume(state.volume, state.isMuted);
    audioEngine.applySettings(el.nativeAudio.webElement || el.nativeAudio);
    persistSoundSettings();
    
    if (el.settingsModifiedDot) {
      if (audioEngine.isModified()) {
        el.settingsModifiedDot.classList.remove('hidden');
      } else {
        el.settingsModifiedDot.classList.add('hidden');
      }
    }
  }


  // ---- Per-track speed / pitch / volume and speed & pitch presets (issue #11; logic in track-audio.js) ----
  // state.audioSettings stays the global sound; a song's own tempo values (keyed by its canonical id) go over it
  /** @type {Record<string, Record<string, number>> | null} */
  var trackAudioStore = null;
  var trackAudioOnlyDraft = false; // "For this song only" switched on, nothing changed yet
  var trackAudioLastKey = '';
  function trackAudioLib() { return window.UrielTrackAudio || null; }
  function allTrackAudio() {
    if (!trackAudioStore) {
      const TA = trackAudioLib();
      const raw = safeJson('uriel_track_audio', {});
      trackAudioStore = /** @type {Record<string, Record<string, number>>} */ (TA ? TA.cleanStore(raw) : {});
    }
    return trackAudioStore;
  }
  function saveAllTrackAudio() {
    try { localStorage.setItem('uriel_track_audio', JSON.stringify(trackAudioStore || {})); } catch (e) { console.warn('Failed to save per-track audio', e); }
  }
  function trackAudioKey(/** @type {UrielTrack | null} */ track) { return track ? (getTrackCanonicalId(track) || '') : ''; }
  function ignoreTrackAudio() { try { return localStorage.getItem('uriel_ignore_track_audio') === '1'; } catch (e) { return false; } }
  function currentTrackAudio() {
    const key = trackAudioKey(state.currentTrack);
    return key ? allTrackAudio()[key] || null : null;
  }
  function effectiveAudioSettings() {
    const TA = trackAudioLib();
    if (!TA) return state.audioSettings;
    return TA.effectiveSettings(state.audioSettings, currentTrackAudio(), ignoreTrackAudio());
  }
  // a speed / pitch / volume change from a slider or a preset: the playing song's own, or the global one
  function setTempoValues(/** @type {Record<string, number>} */ values) {
    const TA = trackAudioLib();
    const key = trackAudioKey(state.currentTrack);
    const perTrack = TA && key && !ignoreTrackAudio() && (trackAudioOnlyDraft || currentTrackAudio());
    if (perTrack) {
      const base = TA.normalizeEntry(currentTrackAudio() || {}, TA.normalizeEntry(state.audioSettings));
      trackAudioStore = TA.setEntry(allTrackAudio(), key, { ...base, ...values });
      trackAudioOnlyDraft = false;
      saveAllTrackAudio();
    } else {
      Object.assign(state.audioSettings, values);
    }
    renderTrackAudioControls();
  }
  function renderTrackAudioControls() {
    const sw = /** @type {HTMLButtonElement} */ (document.getElementById('toggle-track-audio'));
    const ign = document.getElementById('toggle-ignore-track-audio');
    const hint = document.getElementById('track-audio-hint');
    const ignored = ignoreTrackAudio();
    const has = !!currentTrackAudio();
    if (sw) {
      sw.classList.toggle('active', !ignored && (has || trackAudioOnlyDraft));
      sw.disabled = ignored || !state.currentTrack;
      const row = sw.closest('.setting-item');
      if (row) row.classList.toggle('is-disabled', sw.disabled);
    }
    if (ign) ign.classList.toggle('active', ignored);
    if (hint) {
      hint.textContent = !state.currentTrack ? T('Play a song to give it its own speed, pitch and volume')
        : ignored ? T('Per-track settings are ignored: every song uses the global values')
        : has ? T('This song keeps its own speed, pitch and volume')
        : T('Speed, pitch and volume changes apply to the playing song only');
    }
    renderTempoPresets();
  }
  function onTrackAudioTrackChange() {
    const key = trackAudioKey(state.currentTrack);
    if (key === trackAudioLastKey) return;
    trackAudioLastKey = key;
    trackAudioOnlyDraft = false;
    applyAudioSettings();
    syncSettingsSlidersToState();
    renderTrackAudioControls();
  }
  function customTempoPresets() {
    const TA = trackAudioLib();
    return TA ? TA.cleanPresets(safeJson('uriel_tempo_presets', [])) : [];
  }
  function renderTempoPresets() {
    const wrap = document.getElementById('tempo-preset-chips');
    const TA = trackAudioLib();
    if (!wrap || !TA) return;
    const cur = effectiveAudioSettings();
    const custom = customTempoPresets();
    wrap.innerHTML = '';
    for (const p of [...TA.BUILTIN_PRESETS, ...custom]) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-btn tempo-preset-chip' + (TA.presetMatches(p, cur) ? ' active' : '');
      const label = document.createElement('span');
      if (p.builtin) { label.textContent = T(p.name); } else { label.textContent = p.name; label.setAttribute('data-no-i18n', ''); }
      chip.appendChild(label);
      chip.addEventListener('click', () => {
        initAudioContext();
        setTempoValues(p.values);
        state.activePresetId = null;
        applyAudioSettings();
        syncSettingsSlidersToState();
        renderPresets();
      });
      if (!p.builtin) {
        const del = document.createElement('span');
        del.className = 'tempo-preset-del';
        del.setAttribute('role', 'button');
        del.setAttribute('aria-label', T('Delete preset'));
        del.title = T('Delete preset');
        del.textContent = '×';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          const list = customTempoPresets().filter((/** @type {{ id: string }} */ x) => x.id !== p.id);
          try { localStorage.setItem('uriel_tempo_presets', JSON.stringify(list)); } catch (err) {}
          renderTempoPresets();
        });
        chip.appendChild(del);
      }
      wrap.appendChild(chip);
    }
  }
  (function setupTrackAudio() {
    const sw = /** @type {HTMLButtonElement} */ (document.getElementById('toggle-track-audio'));
    const ign = document.getElementById('toggle-ignore-track-audio');
    if (sw) sw.addEventListener('click', () => {
      if (sw.disabled) return;
      const key = trackAudioKey(state.currentTrack);
      if (!key) return;
      if (currentTrackAudio() || trackAudioOnlyDraft) {
        // off: the song goes back to the global values
        trackAudioStore = trackAudioLib().setEntry(allTrackAudio(), key, null);
        trackAudioOnlyDraft = false;
        saveAllTrackAudio();
      } else {
        trackAudioOnlyDraft = true;
      }
      applyAudioSettings();
      syncSettingsSlidersToState();
      renderTrackAudioControls();
    });
    if (ign) ign.addEventListener('click', () => {
      try { localStorage.setItem('uriel_ignore_track_audio', ignoreTrackAudio() ? '0' : '1'); } catch (e) {}
      trackAudioOnlyDraft = false;
      applyAudioSettings();
      syncSettingsSlidersToState();
      renderTrackAudioControls();
    });
    window.addEventListener('storage', (e) => { if (!e.key || /uriel_track_audio$/.test(e.key)) trackAudioStore = null; });

    const saveBtn = document.getElementById('btn-save-tempo-preset');
    const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('tempo-preset-name'));
    const save = () => {
      const TA = trackAudioLib();
      if (!TA || !nameInput) return;
      const p = TA.makePreset(nameInput.value, effectiveAudioSettings());
      if (!p) { nameInput.focus(); return; }
      const list = customTempoPresets();
      list.push(p);
      try { localStorage.setItem('uriel_tempo_presets', JSON.stringify(list)); } catch (e) {}
      nameInput.value = '';
      showToast(Tm('Preset saved'), 'info');
      renderTempoPresets();
    };
    if (saveBtn) saveBtn.addEventListener('click', save);
    if (nameInput) nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    renderTrackAudioControls();
  })();


  // ---- the visualizers and the render loop (app/visualizer.js) ----
  const visualizerPart = /** @type {UrielVisualizerPart} */ ({});
  function startVisualizers() { return visualizerPart.startVisualizers(); }
  function resizeCanvases() { return visualizerPart.resizeCanvases(); }
  window.UrielApp.visualizer({ audioEngine, cancelVizFrame, dimColor, el, formatDuration, isPhoneApp, miniLyricsShown, nextPrefetchDue, playback, prefetchNextQueueTrack, primaryColor, scheduleVizFrame, state, updateMiniLyricsHighlight, updateSyncedLyricsHighlight, viz }, visualizerPart);

  let trimTimer = 0;
  function handleVisibilityChange(/** @type {boolean} */ visible) {
    state.isWindowVisible = visible;
    syncBgVideoPlayback();
    if (audioEngine && audioEngine.setHidden) audioEngine.setHidden(!visible);
    if (!visible) {
      if (typeof lyricsScrollRaf !== 'undefined' && lyricsScrollRaf) {
        cancelAnimationFrame(lyricsScrollRaf);
        lyricsScrollRaf = 0;
      }
      if (typeof gradientRaf !== 'undefined' && gradientRaf) {
        cancelAnimationFrame(gradientRaf);
        gradientRaf = 0;
      }
      if (typeof gradientTimer !== 'undefined' && gradientTimer) {
        clearTimeout(gradientTimer);
        gradientTimer = 0;
      }
      cancelVizFrame();
      pauseCacheBars();
      document.body.classList.add('app-paused');
      document.body.classList.add('hidden-window');
      if (getAdv('trim_bg', true)) {
        clearTimeout(trimTimer);
        // wait a bit so quick alt-tabs don't throw away decoded images we're about to redraw
        trimTimer = window.setTimeout(() => {
          if (!state.isWindowVisible && window.electronAPI && window.electronAPI.trimMemory) window.electronAPI.trimMemory();
        }, 10000);
      }
    } else {
      document.body.classList.remove('app-paused');
      document.body.classList.remove('hidden-window');
      resizeCanvases();
      // the daily mixes wait while the window is hidden (#16): make them now if they're still missing
      try { if (spHomeReady && isSpotifyHome() && !readDailyMixes()) renderMadeForYou(); } catch (e) {}
      viz.hasDrawnPausedFrame = false;
      if (state.isPlaying || playback.isDraggingScrubber) startVisualizers();
      resumeCacheBars();
      if (typeof updateLyricsPadding === 'function') {
        const syncOnRestore = () => {
          updateLyricsPadding();
          state.forceSnapLyrics = true;
          state.forceLyricsScroll = true;
          state.lastActiveLyricIdx = -1;
          if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
        };
        syncOnRestore();
        requestAnimationFrame(syncOnRestore);
        setTimeout(syncOnRestore, 80);
        setTimeout(syncOnRestore, 220);
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    handleVisibilityChange(!document.hidden);
  });

  if (window.electronAPI && window.electronAPI.onWindowVisibility) {
    window.electronAPI.onWindowVisibility((/** @type {boolean} */ visible) => handleVisibilityChange(visible));
  }
  // WKWebView doesn't always fire visibilitychange on lock/home; the native app-state event does
  try {
    const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (capApp && capApp.addListener) capApp.addListener('appStateChange', (/** @type {{ isActive?: boolean }} */ s) => handleVisibilityChange(!!(s && s.isActive)));
  } catch (_) {}

  function applyVisualEffects() {
    const v = state.vfx;

    if (el.coverContainer) {
      el.coverContainer.classList.toggle('vinyl-mode', !!v.vinylSpin);
      el.coverContainer.classList.toggle('spinning', !!v.vinylSpin && state.isPlaying);
    }
    document.body.classList.toggle('vfx-spotlight-on', !!v.lyricsSpotlight);
    syncVisualSettingsUI();
  }

  function syncVisualSettingsUI() {
    const v = state.vfx;
    const vfxList = [
      { id: 'vfx-pulse', key: 'bassPulse' },
      { id: 'vfx-vinyl', key: 'vinylSpin' },
      { id: 'vfx-spotlight', key: 'lyricsSpotlight' }
    ];

    vfxList.forEach(item => {
      const card = document.getElementById(`card-${item.id}`);
      const badge = document.getElementById(`badge-${item.id}`);
      const btn = document.getElementById(`toggle-${item.id}`);
      const isEnabled = v[item.key];

      if (card) card.classList.toggle('enabled', !!isEnabled);
      if (badge) badge.textContent = T(isEnabled ? 'on' : 'off');
      if (btn) {
        btn.classList.toggle('active', !!isEnabled);
        
      }
    });
  }

  const EQ_BAND_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

  function syncSettingsSlidersToState() {
    const s = effectiveAudioSettings();
    // the engine dropdown is plain markup that always said hqmusic-3, whatever engine was saved or reset to
    const engine = state.hqSettings && state.hqSettings.engine;
    if (engine) {
      if (el.hqEngineSelect) el.hqEngineSelect.value = engine;
      const opts = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#hq-engine-menu .m3-dropdown-option'));
      opts.forEach((o) => o.classList.toggle('selected', o.dataset.value === engine));
      const picked = [...opts].find(o => o.dataset.value === engine);
      const label = document.getElementById('hq-engine-label');
      if (picked && label) label.textContent = picked.textContent;
    }
    if (el.sliderSpeed) el.sliderSpeed.value = s.speed;
    if (el.valSpeed) el.valSpeed.textContent = `${s.speed.toFixed(2)}x`;

    if (el.sliderSpeedPitch) el.sliderSpeedPitch.value = s.speedPitch;
    if (el.valSpeedPitch) el.valSpeedPitch.textContent = `${s.speedPitch.toFixed(2)}x`;

    if (el.sliderPitch) el.sliderPitch.value = s.pitch;
    if (el.valPitch) el.valPitch.textContent = `${s.pitch > 0 ? '+' : ''}${s.pitch} st`;

    if (el.sliderReverb) el.sliderReverb.value = s.reverb;
    if (el.valReverb) el.valReverb.textContent = `${s.reverb}%`;

    if (el.sliderDistortion) el.sliderDistortion.value = s.distortion;
    if (el.valDistortion) el.valDistortion.textContent = `${s.distortion}%`;

    if (el.sliderGain) el.sliderGain.value = String(Math.round(s.volume * 100));
    if (el.valGain) el.valGain.textContent = `${Math.round(s.volume * 100)}%`;

    if (el.sliderEcho) el.sliderEcho.value = s.echo;
    if (el.valEcho) el.valEcho.textContent = `${s.echo}%`;

    const eq = s.eq || { low: 0, mid: 0, high: 0 };
    if (el.sliderEqLow) el.sliderEqLow.value = eq.low;
    if (el.valEqLow) el.valEqLow.textContent = `${eq.low > 0 ? '+' : ''}${eq.low} dB`;
    if (el.sliderEqMid) el.sliderEqMid.value = eq.mid;
    if (el.valEqMid) el.valEqMid.textContent = `${eq.mid > 0 ? '+' : ''}${eq.mid} dB`;
    if (el.sliderEqHigh) el.sliderEqHigh.value = eq.high;
    if (el.valEqHigh) el.valEqHigh.textContent = `${eq.high > 0 ? '+' : ''}${eq.high} dB`;

    const bands = s.eqBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (el.eqBands) {
      const inputs = /** @type {NodeListOf<HTMLInputElement>} */ (el.eqBands.querySelectorAll('.eq-band-range'));
      const valLabels = el.eqBands.querySelectorAll('.eq-band-val');
      inputs.forEach((input, i) => {
        const v = bands[i] !== undefined ? bands[i] : 0;
        input.value = String(v);
        if (valLabels[i]) valLabels[i].textContent = `${v > 0 ? '+' : ''}${v} dB`;
      });
    }

    if (state.hqSettings) {
      if (el.sliderHqVocal) { el.sliderHqVocal.value = state.hqSettings.vocal; if (el.valHqVocal) el.valHqVocal.textContent = `${state.hqSettings.vocal > 0 ? '+' : ''}${state.hqSettings.vocal}%`; }
      if (el.sliderHqAir) { el.sliderHqAir.value = state.hqSettings.air; if (el.valHqAir) el.valHqAir.textContent = `${state.hqSettings.air > 0 ? '+' : ''}${state.hqSettings.air}%`; }
      if (el.sliderHqBass) { el.sliderHqBass.value = state.hqSettings.bass; if (el.valHqBass) el.valHqBass.textContent = `${state.hqSettings.bass > 0 ? '+' : ''}${state.hqSettings.bass}%`; }
      if (el.hqPresetChips) el.hqPresetChips.forEach((/** @type {HTMLElement} */ c) => c.classList.toggle('active', c.dataset.preset === state.hqSettings.preset));
    }
  }

  // Crossfades cover art: the old image is cloned into a ghost that fades/shrinks out
  // while the new one blurs in underneath. The new src is decoded first so it never pops.
  const artSwapTokens = new WeakMap();
  function swapArtwork(/** @type {HTMLImageElement} */ img, /** @type {string} */ src) {
    const token = {};
    artSwapTokens.set(img, token);
    const shown = img.style.display === 'block' && img.complete && img.naturalWidth > 0;
    if (!shown || img.getAttribute('src') === src || document.body.classList.contains('perf') || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      img.src = src;
      img.style.display = 'block';
      return;
    }
    const pre = new Image();
    pre.src = src;
    const commit = () => {
      if (artSwapTokens.get(img) !== token) return;
      /** @type {HTMLElement} */ (img.parentElement).querySelectorAll('.art-ghost').forEach((/** @type {Element} */ g) => g.remove());
      const ghost = /** @type {HTMLElement} */ (img.cloneNode(false));
      ghost.removeAttribute('id');
      ghost.classList.remove('art-in');
      ghost.classList.add('art-ghost');
      ghost.style.cssText = `position:absolute;left:${img.offsetLeft}px;top:${img.offsetTop}px;width:${img.offsetWidth}px;height:${img.offsetHeight}px;display:block;margin:0;pointer-events:none;`;
      img.after(ghost);
      ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
      setTimeout(() => ghost.remove(), 900);
      img.src = src;
      img.style.display = 'block';
      img.classList.remove('art-in');
      void img.offsetWidth;
      img.classList.add('art-in');
    };
    pre.decode().then(commit, commit);
  }

  const FADE_IMG_SEL = '.track-row-thumb, .my-wave-track-cover, .quick-play-pill-img';
  // covers that already loaded once skip the fade: a scrolled list draws its rows again and again, and fading each
  // cover in from nothing made rows look like they disappeared while scrolling (#40)
  const shownThumbs = new Set();
  const markImgLoaded = (/** @type {Event} */ e) => {
    const t = /** @type {HTMLImageElement} */ (e.target);
    if (t.tagName !== 'IMG' || !t.matches(FADE_IMG_SEL)) return;
    t.classList.add('is-loaded');
    if (e.type === 'load') shownThumbs.add(t.getAttribute('src'));
  };
  document.addEventListener('load', markImgLoaded, true);
  document.addEventListener('error', markImgLoaded, true);

  // Colours the drawer with a soft glow from the cover's own palette (cheap stand-in for the old blurred banner).
  function tintNowPlaying(/** @type {string} */ src) {
    const panel = el.rightPanel;
    if (!panel) return;
    if (!src) {
      panel.style.removeProperty('--np-c1');
      panel.style.removeProperty('--np-c2');
      return;
    }
    analyzeCover(src).then(a => {
      if (!state.currentTrack || getTrackThumbUrl(state.currentTrack) !== src) return;
      panel.style.setProperty('--np-c1', a.accent);
      panel.style.setProperty('--np-c2', a.accent2 || a.accent);
    });
  }

  /** @param {UrielTrack} track */
  function updateNowPlayingUI(track) {
    window.dispatchEvent(new CustomEvent('uriel:track', { detail: track }));
    if (el.playbarTitle) el.playbarTitle.textContent = track.title || 'Untitled';
    if (el.playbarTitle) el.playbarTitle.dataset.origTitle = track.title || '';
    if (el.playbarArtist) {
      el.playbarArtist.textContent = track.artist || 'Unknown artist';
      el.playbarArtist.classList.remove('play-failed');
      el.playbarArtist.removeAttribute('title');
    }

    const thumb = getTrackThumbUrl(track);
    if (thumb) {
      if (el.playbarArtwork) {
        el.playbarArtwork.onload = () => {
          // a fallback that loaded replaces the song's dead cover for good
          const shown = el.playbarArtwork.getAttribute('src') || '';
          if (el.playbarArtwork.__artTrack === track && shown !== thumb) rememberTrackArt(getTrackCanonicalId(track), shown);
          if (state.currentTrack && 'mediaSession' in navigator && navigator.mediaSession.metadata) {
            const curThumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : '') || state.currentTrack.thumbnail || '';
            const art = getMediaArtwork(curThumb);
            if (art.length > 0) {
              navigator.mediaSession.metadata.artwork = art;
            }
          }
        };
        swapArtwork(el.playbarArtwork, thumb);
        if (typeof m3cSetImage === 'function') m3cSetImage(thumb);
        el.playbarArtwork.onerror = () => {
          // a dead cover: try the song's other covers (the right panel follows) before showing the placeholder
          const next = nextPlayerArt(track, el.playbarArtwork);
          if (next) {
            if (typeof m3cSetImage === 'function') m3cSetImage(next);
            if (el.rightPanelCover) el.rightPanelCover.src = next;
            updateRightPanelBanner(next);
            updateThemeFromState();
            return;
          }
          el.playbarArtwork.style.display = 'none';
          if (el.artworkFallback) el.artworkFallback.style.display = 'flex';
        };
      }
      if (el.artworkFallback) el.artworkFallback.style.display = 'none';
      if (el.rightPanelCover) {
        swapArtwork(el.rightPanelCover, thumb);
        el.rightPanelCover.onerror = () => {
          const next = nextPlayerArt(track, el.rightPanelCover);
          if (next) { updateRightPanelBanner(next); return; }
          el.rightPanelCover.style.display = 'none';
          if (el.rightPanelFallback) el.rightPanelFallback.style.display = 'flex';
        };
      }
      if (el.rightPanelFallback) el.rightPanelFallback.style.display = 'none';
    } else {
      if (el.playbarArtwork) el.playbarArtwork.style.display = 'none';
      if (typeof m3cSetImage === 'function') m3cSetImage('');
      if (el.artworkFallback) el.artworkFallback.style.display = 'flex';
      if (el.rightPanelCover) el.rightPanelCover.style.display = 'none';
      if (el.rightPanelFallback) el.rightPanelFallback.style.display = 'flex';
    }

    if (el.rightPanelTitle) el.rightPanelTitle.textContent = track.title || 'Untitled';
    if (el.rightPanelArtist) el.rightPanelArtist.textContent = track.artist || 'Unknown artist';

    if (el.btnPlaybarMore) el.btnPlaybarMore.style.display = track.platform === 'local' ? 'none' : '';
    if (el.timeDuration && track && track.duration) el.timeDuration.textContent = formatDuration(track.duration);

    updateRightPanelBanner(thumb);
    tintNowPlaying(thumb);
    refreshMeshCover();
    setCoverBg(thumb);
    updateFavoriteIcon();
    applyVisualEffects();
    highlightPlayingRow();
    updateThemeFromState();
    updateMediaSession();
    if (state.isTvKaraokeOpen) updateTvKaraokeMeta();
  }

  function updateRightPanelBanner(/** @type {string} */ thumbUrl) {
    const banner = /** @type {HTMLElement} */ (document.getElementById('right-panel-banner'));
    if (!banner) return;
    if (!getAdv('banners', true) || !getAdv('track_banners', true)) {
      banner.style.display = 'none';
      if (state.isTvKaraokeOpen) syncTvBanner();
      return;
    }
    banner.style.display = '';
    const bannerImg = /** @type {HTMLElement} */ (banner.querySelector('.banner-image') || banner);
    const trackArt = state.currentTrack ? getTrackArt(state.currentTrack) : {};
    const trackBanner = trackArt.banner || null;
    const globalMedia = localStorage.getItem('uriel_banner_media');
    const mediaToUse = trackBanner || globalMedia || thumbUrl;
    banner._pendingMedia = mediaToUse;

    if (!mediaToUse) {
      banner.classList.add('fading-out');
      setTimeout(() => {
        bannerImg.style.backgroundImage = 'none';
        const vid = banner.querySelector('video.banner-video');
        if (vid) vid.remove();
        banner.style.opacity = '0';
        banner.classList.remove('fading-out');
        if (state.isTvKaraokeOpen) syncTvBanner();
      }, 300);
      if (state.isTvKaraokeOpen) syncTvBanner();
      return;
    }

    const isVideo = /\.(mp4|webm)($|\?)/i.test(mediaToUse);
    if (isVideo) {
      bannerImg.style.backgroundImage = 'none';
      let vid = /** @type {HTMLVideoElement} */ (banner.querySelector('video.banner-video'));
      if (!vid) {
        vid = document.createElement('video');
        vid.className = 'banner-video';
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        banner.appendChild(vid);
      }
      vid.onerror = () => {
        if (trackBanner && state.currentTrack) {
          setTrackArt(state.currentTrack, { banner: undefined });
          updateRightPanelBanner(thumbUrl);
        } else {
          banner.style.opacity = '0';
          if (state.isTvKaraokeOpen) syncTvBanner();
        }
      };
      if (vid.src !== mediaToUse) {
        vid.src = mediaToUse;
        vid.play().catch(() => {});
      }
      banner.style.opacity = '1';
      if (state.isTvKaraokeOpen) syncTvBanner();
      return;
    }

    const vid = banner.querySelector('video.banner-video');
    if (vid) vid.remove();

    const img = new Image();
    img.src = mediaToUse;
    img.onload = () => {
      if (banner._pendingMedia !== mediaToUse) return;
      const nextBg = `url("${mediaToUse}")`;
      const cur = /** @type {HTMLElement} */ (banner.querySelector('.banner-image'));
      const curBg = cur ? cur.style.backgroundImage : '';
      if (cur && curBg === nextBg) {
        banner.style.opacity = '1';
      } else if (!cur || !curBg || curBg === 'none' || banner.style.opacity !== '1' || document.body.classList.contains('perf')) {
        bannerImg.style.backgroundImage = nextBg;
        banner.style.opacity = '1';
      } else {
        // Crossfade: new layer goes underneath (first in DOM, so querySelector finds it), old one fades out on top.
        banner.querySelectorAll('.banner-image.banner-leaving').forEach(n => n.remove());
        const next = /** @type {HTMLElement} */ (cur.cloneNode(false));
        next.style.backgroundImage = nextBg;
        cur.before(next);
        cur.classList.add('banner-leaving');
        cur.addEventListener('animationend', () => cur.remove(), { once: true });
        setTimeout(() => cur.remove(), 1200);
      }
      if (state.isTvKaraokeOpen) syncTvBanner();
    };
    img.onerror = () => {
      if (trackBanner && state.currentTrack) {
        setTrackArt(state.currentTrack, { banner: undefined });
        updateRightPanelBanner(thumbUrl);
      } else {
        banner.style.opacity = '0';
        if (state.isTvKaraokeOpen) syncTvBanner();
      }
    };
    if (state.isTvKaraokeOpen) syncTvBanner();
  }

  function updatePlaylistDetailBanner(/** @type {string} */ thumbUrl) {
    const banner = document.getElementById('playlist-header-banner');
    if (!banner) return;
    if (!getAdv('banners', true)) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = '';
    const bannerImg = /** @type {HTMLElement} */ (banner.querySelector('.banner-image') || banner);
    const globalMedia = localStorage.getItem('uriel_banner_media');
    const mediaToUse = globalMedia || thumbUrl;

    if (!mediaToUse) {
      banner.style.opacity = '0';
      bannerImg.style.backgroundImage = 'none';
      const vid = banner.querySelector('video.banner-video');
      if (vid) vid.remove();
      return;
    }

    const isVideo = /\.(mp4|webm)($|\?)/i.test(mediaToUse);
    if (isVideo) {
      bannerImg.style.backgroundImage = 'none';
      let vid = /** @type {HTMLVideoElement} */ (banner.querySelector('video.banner-video'));
      if (!vid) {
        vid = document.createElement('video');
        vid.className = 'banner-video';
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        banner.appendChild(vid);
      }
      if (vid.src !== mediaToUse) {
        vid.src = mediaToUse;
        vid.play().catch(() => {});
      }
      banner.style.opacity = '1';
      return;
    }

    const vid = banner.querySelector('video.banner-video');
    if (vid) vid.remove();

    const img = new Image();
    img.src = mediaToUse;
    img.onload = () => {
      bannerImg.style.backgroundImage = `url("${mediaToUse}")`;
      banner.style.opacity = '1';
    };
    img.onerror = () => {
      banner.style.opacity = '0';
    };
  }

  function getTrackCanonicalId(/** @type {UrielTrack} */ track) {
    if (!track) return '';
    const platform = track.platform || state.platform || 'yt';
    if (track.id) return `${platform}:${track.id}`;
    if (track.url || track.videoId) return `${platform}:${track.url || track.videoId}`;
    const t = (track.title || '').trim().toLowerCase();
    const a = (track.artist || '').trim().toLowerCase();
    const d = Math.round(Number(track.duration) || 0);
    return `${platform}:${t}|${a}|${d}`;
  }

  function isSameTrack(/** @type {UrielTrack | null} */ a, /** @type {UrielTrack | null} */ b) {
    if (!a || !b) return false;
    return getTrackCanonicalId(a) === getTrackCanonicalId(b);
  }

  function matchesTrackQuery(/** @type {UrielTrack} */ track, /** @type {string} */ query) {
    if (!query) return true;
    return normalizeSearch(track && track.title).includes(query) || normalizeSearch(track && track.artist).includes(query);
  }

  // a song's own pictures and banner effects (Track art dialog), kept in uriel_track_art by song id
  /** @type {{ raw: string, parsed: Record<string, UrielTrackArt> }} */
  const trackArtCache = { raw: '', parsed: {} };
  /** @returns {UrielTrackArt} */
  function getTrackArt(/** @type {UrielTrack} */ t) {
    try {
      // every list row asks while it is built: parse only when the saved text changed (Sync and backups write it too)
      const raw = localStorage.getItem('uriel_track_art') || '{}';
      if (trackArtCache.raw !== raw) {
        trackArtCache.parsed = JSON.parse(raw);
        trackArtCache.raw = raw;
      }
      return trackArtCache.parsed[getTrackCanonicalId(t)] || {};
    } catch (e) {
      return {};
    }
  }

  function setTrackArt(/** @type {UrielTrack} */ t, /** @type {UrielTrackArt | null} */ patch) {
    /** @type {Record<string, UrielTrackArt>} */
    let all = {};
    try {
      all = JSON.parse(localStorage.getItem('uriel_track_art') || '{}');
    } catch (e) {}
    const id = getTrackCanonicalId(t);
    if (!id) return;
    /** @type {Record<string, unknown>} */
    const cur = { ...(all[id] || {}), ...patch };
    for (const k in cur) if (!cur[k]) delete cur[k];
    if (Object.keys(cur).length) all[id] = cur; else delete all[id];
    localStorage.setItem('uriel_track_art', JSON.stringify(all));
  }

  // ---- Crossfade: the old song plays out on a second player while the next one starts (app/crossfade.js) ----
  const crossfadePart = /** @type {UrielCrossfadePart} */ ({});
  function crossfadeSeconds() { return crossfadePart.crossfadeSeconds(); }
  function canOverlap(/** @type {HTMLAudioElement | null} */ a) { return crossfadePart.canOverlap(a); }
  function prepareCrossfade(/** @type {number} */ point, /** @type {number} */ end) { return crossfadePart.prepareCrossfade(point, end); }
  function crossfadePrepared() { return crossfadePart.crossfadePrepared(); }
  function crossfadeFadeIn() { return crossfadePart.crossfadeFadeIn(); }
  function crossfadeOnTrackChange() { return crossfadePart.crossfadeOnTrackChange(); }
  function cancelEndFade() { return crossfadePart.cancelEndFade(); }
  function dropCrossfadePrep() { return crossfadePart.dropCrossfadePrep(); }
  function pauseCrossfadeTail() { return crossfadePart.pauseCrossfadeTail(); }
  function resumeCrossfadeTail() { return crossfadePart.resumeCrossfadeTail(); }
  window.UrielApp.crossfade({ audioEngine, el, isPhoneApp, playNext, playback, queueFinished, state, usingHls: () => !!hlsInstance }, crossfadePart);

  let currentAlbumPlayRunId = 0;

  function pushPlayHistory(/** @type {UrielTrack} */ track) {
    if (!track) return;
    const h = state.playHistory || (state.playHistory = []);
    if (h.length && h[h.length - 1].id === track.id) return;
    h.push(track);
    if (h.length > 100) h.shift();
  }
  let navigatingBack = false;

  // every song that has played since Uriel opened (any queue, shuffle or not), by id and by artist + title, so the
  // same song from another list or source counts too: shuffle leaves them for last
  const sessionPlayed = new Set();
  const playedThisSession = (/** @type {UrielTrack} */ t) => !!t && (sessionPlayed.has(getTrackCanonicalId(t)) || sessionPlayed.has(getTrackNormalizedKey(t.artist, t.title)));
  function notePlayedThisSession(/** @type {UrielTrack | null} */ t) {
    if (!t) return;
    const id = getTrackCanonicalId(t);
    if (id) sessionPlayed.add(id);
    if (t.title) sessionPlayed.add(getTrackNormalizedKey(t.artist, t.title));
  }

  // Shuffle mixes the queue itself: the playing song goes first and the rest follow in a random order, so the
  // queue shows what plays next and Next just takes the following song. It used to pick a random song at each
  // Next, so the queue only ever showed the playlist's own order. Songs heard earlier this session go last.
  // The array is changed in place: a My Wave or radio top-up still loading for it keeps its place.
  function shuffleQueue() {
    const q = state.queue;
    if (state.queueIndex < 0 || q.length < 2) return;
    if (!state.unshuffledQueue) state.unshuffledQueue = q.slice();
    const mix = (/** @type {UrielTrack[]} */ list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    const rest = q.filter((/** @type {UrielTrack} */ t, /** @type {number} */ i) => i !== state.queueIndex);
    const order = [q[state.queueIndex], ...mix(rest.filter((/** @type {UrielTrack} */ t) => !playedThisSession(t))), ...mix(rest.filter(playedThisSession))];
    order.forEach((t, i) => { q[i] = t; });
    state.queueIndex = 0;
    state.queueHistory = [0];
  }

  // back to the order from before shuffle; songs added since keep their place after it
  function unshuffleQueue() {
    const before = state.unshuffledQueue;
    state.unshuffledQueue = null;
    const q = state.queue;
    if (!before || !q.length) return;
    // counted, not just looked up: the same song can be in the queue twice
    const left = new Map();
    q.forEach((/** @type {UrielTrack} */ t) => left.set(t, (left.get(t) || 0) + 1));
    const order = [];
    for (const t of [...before, ...q]) {
      if (left.get(t) > 0) { order.push(t); left.set(t, left.get(t) - 1); }
    }
    const current = q[state.queueIndex];
    order.forEach((t, i) => { q[i] = t; });
    state.queueIndex = Math.max(0, q.indexOf(current));
    state.queueHistory = [state.queueIndex];
  }

  // A song that can't be played used to stop a whole playlist. When playing through a list (or after Next)
  // it is skipped instead; several failures in a row (offline, say) still stop.
  const SKIP_CONTEXTS = new Set(['playlist', 'favorites', 'album', 'queue', 'history', 'local', 'artist']);
  let advancing = false; // true while playNext starts the next song
  let skipOnFailToken = -1; // loadToken of the song that gets skipped if it fails
  let failStreak = 0;
  // true from the moment a song is asked for until it plays (or fails for good). Nothing is audible in
  // between, so the phone apps keep themselves running on this (mobile/background-audio.ts, media-controls.ts).
  function setTrackLoading(/** @type {boolean} */ on) {
    if (!!state.trackLoading === on) return;
    state.trackLoading = on;
    window.dispatchEvent(new Event('uriel:loading'));
  }
  // Nothing is playing any more: without this a failed start left is-playing on, and the background and cover
  // animations kept running with no sound
  function stopAfterFailure() {
    state.isPlaying = false;
    document.body.classList.remove('is-playing');
    if (el.coverContainer) el.coverContainer.classList.remove('spinning');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    updatePlayPauseButton(false, false);
  }
  // The toast goes away after a few seconds; the player keeps saying why it is sitting at 0:00 until the next song.
  /** @param {UrielText} message */
  function showPlayFailure(message, type = 'error') {
    showToast(message, type, 8000);
    if (!el.playbarArtist) return;
    el.playbarArtist.textContent = String(Tm("Couldn't play"));
    el.playbarArtist.title = String(message);
    el.playbarArtist.classList.add('play-failed');
  }
  // every failure path asks this; a false answer means nothing else will be loaded, so loading is over
  function skipUnplayable(/** @type {number} */ token, /** @type {UrielTrack | null} */ track) {
    if (token !== state.loadToken) return false;
    if (token !== skipOnFailToken) { setTrackLoading(false); return false; }
    if (state.queue.length < 2 || failStreak >= Math.min(5, state.queue.length - 1)) { failStreak = 0; setTrackLoading(false); return false; }
    failStreak++;
    showToast(track && track.title ? Tm('Couldn\'t play "{0}", playing the next one', track.title) : Tm("Couldn't play this song, playing the next one"), 'info');
    setTimeout(() => { if (token === state.loadToken) playNext(); }, 1200);
    return true;
  }

  async function playTrack(/** @type {UrielTrack} */ track, /** @type {UrielTrack[] | null} */ queueList = null, startIndex = -1, /** @type {string | null} */ context = null) {
    if (!track || !el.nativeAudio) return;
    // a song that is cached or saved still plays without yt-dlp, so this only reminds
    if (track.platform !== 'local') toolsReady(['yt-dlp']);
    resetLevelWatcher();
    visualizerPart.resetLevelHistory();
    if (state.currentTrack && state.currentTrack.id !== track.id && !navigatingBack) pushPlayHistory(state.currentTrack);
    if (state.currentTrack) offlineChanged(state.currentTrack);
    // a new list that isn't My Wave's ends My Wave: it isn't topped up with wave songs, and its skips don't count
    if (queueList && queueList !== state.queue && context !== 'wave') state.myWaveActive = false;

    if (!state._isNaturalEnding && state.myWaveActive && state.currentTrack && !isSameTrack(state.currentTrack, track)) {
      const curId = (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(state.currentTrack) : '') || state.currentTrack.id;
      if (state._skipRecordedFor !== curId) {
        const cur = (el.nativeAudio && typeof el.nativeAudio.currentTime === 'number') ? el.nativeAudio.currentTime : 0;
        if (cur < 12 && typeof recordWaveSkip === 'function') {
          recordWaveSkip(state.currentTrack);
        }
      }
    }
    state._skipRecordedFor = null;

    if (context !== 'album') currentAlbumPlayRunId++;
    cancelEndFade();
    crossfadeOnTrackChange();
    state.nextTrackPrefetched = false;
    initAudioContext();
    el.nativeAudio.preload = 'auto';

    try {
      el.nativeAudio.pause();
      el.nativeAudio.removeAttribute('src');
      el.nativeAudio.load();
    } catch (e) {}

    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch (e) {}
      hlsInstance = null;
    }

    state.isPlaying = false;
    updatePlayPauseButton(false, true);
    sendStateToServer();

    if (el.lyricsContainer) el.lyricsContainer.scrollTop = 0;
    if (typeof lyricsScrollRaf !== 'undefined' && lyricsScrollRaf) {
      cancelAnimationFrame(lyricsScrollRaf);
      lyricsScrollRaf = 0;
    }
    state.lastActiveLyricIdx = -1;
    state.forceLyricsScroll = true;
    state.forceSnapLyrics = true;

    if (el.timeCurrent) el.timeCurrent.textContent = '0:00';
    if (el.timeDuration) el.timeDuration.textContent = formatDuration(track.duration || 0);
    visualizerPart.resetScrubber();

    state.loadToken++;
    state.queueRestorePosition = 0; // a place in the song before this one (Play reads it before it gets here)
    const currentToken = state.loadToken;
    if (advancing || SKIP_CONTEXTS.has(context || '')) skipOnFailToken = currentToken;
    setTrackLoading(true);

    if (state.currentAbortController) {
      state.currentAbortController.abort();
    }
    state.currentAbortController = new AbortController();
    const signal = state.currentAbortController.signal;

    state.currentTrack = track;
    emitPluginEvent('trackchange', track);
    onTrackAudioTrackChange();
    state.currentTrackContext = context;
    state.currentTrackIndexInContext = startIndex;

    if (queueList) {
      // a tap on a song in the queue itself keeps the queue's order
      const newList = queueList !== state.queue;
      state.queue = [...queueList];
      if (startIndex >= 0 && startIndex < state.queue.length && isSameTrack(state.queue[startIndex], track)) {
        state.queueIndex = startIndex;
      } else {
        state.queueIndex = state.queue.findIndex((/** @type {UrielTrack} */ t) => isSameTrack(t, track));
      }
      if (state.queueIndex === -1) {
        state.queue.unshift(track);
        state.queueIndex = 0;
      }
      state.queueHistory = [state.queueIndex];
      if (newList) {
        state.unshuffledQueue = null;
        // My Wave is topped up as it plays; mixing only the first few songs of it means nothing
        if (state.isShuffle && context !== 'wave') shuffleQueue();
      }
    } else {
      const existingIndex = state.queue.findIndex((/** @type {UrielTrack} */ t) => isSameTrack(t, track));
      if (existingIndex === -1) {
        state.queue.push(track);
        state.queueIndex = state.queue.length - 1;
      } else {
        state.queueIndex = existingIndex;
      }
      state.queueHistory = [state.queueIndex];
    }
    updateQueueBadge();

    track.playedAt = Date.now();
    state.history = state.history.filter((/** @type {UrielTrack} */ t) => !isSameTrack(t, track));
    state.history.unshift(track);
    if (state.history.length > 100) state.history.pop();
    localStorage.setItem('devsize_history', JSON.stringify(state.history));
    if (state.currentView === 'history') renderHistoryView();

    updateNowPlayingUI(track);
    updatePlayPauseButton(false, true);

    loadSyncedLyrics(track.title || '', track.artist || '', currentToken);

    try {
      if (track.platform === 'local') {
        const streamUrl = tokenUrl(`http://127.0.0.1:${state.serverPort}/api/library-file?id=${encodeURIComponent(track.id)}`);
        if (currentToken !== state.loadToken) return;
        el.nativeAudio.preload = 'auto';
        el.nativeAudio.src = streamUrl;
        playSmooth();
        applyAudioSettings();
        return;
      }

      let resolvedUrl = track.url;
      let resolvedId = track.id;

      if ((!resolvedUrl && !resolvedId) || (resolvedUrl && resolvedUrl.includes('/results?search_query='))) {
        if (track.searchQuery) {
          // a song already on this device plays from there at once; only otherwise is its video searched for
          if (await attachStream(track, resolvedUrl, resolvedId, currentToken, signal, false, true)) {
            applyAudioSettings();
            return;
          }
          if (currentToken !== state.loadToken) return;
          try {
            const searchRes = await fetch(`http://127.0.0.1:${state.serverPort}/api/search?q=${encodeURIComponent(track.searchQuery)}&platform=youtube&limit=1`, { signal });
            const sData = await searchRes.json();
            // another song started while this one was searched for: leave that one alone
            if (currentToken !== state.loadToken) return;
            const cur = state.currentTrack;
            if (cur && sData.success && sData.tracks && sData.tracks[0]) {
              resolvedUrl = sData.tracks[0].url;
              resolvedId = sData.tracks[0].id;
              cur.id = resolvedId;
              cur.url = resolvedUrl;
              if (!cur.thumbnail && sData.tracks[0].thumbnail) cur.thumbnail = sData.tracks[0].thumbnail;
            }
          } catch (e) {}
        }
      }

      if (!await attachStream(track, resolvedUrl, resolvedId, currentToken, signal, false)) return;
      applyAudioSettings();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (currentToken === state.loadToken) {
        logPlaybackIssue('Song playback notice', err);
        if (retryFresh(currentToken, track)) return;
        stopAfterFailure();
        if (!skipUnplayable(currentToken, track)) showPlayFailure((err instanceof Error && err.message) || Tm('Could not load audio stream'));
      }
    }
  }

  // Looks the song up (/api/stream-info) and gives its stream to the audio element. Resolves false when
  // another song was started meanwhile; throws when there is nothing to play. localOnly: only a copy on this
  // device counts, and without one it resolves false.
  /** @param {UrielTrack} track @param {string | undefined} resolvedUrl @param {string | undefined} resolvedId @param {number} currentToken @param {AbortSignal} signal @param {boolean} fresh */
  async function attachStream(track, resolvedUrl, resolvedId, currentToken, signal, fresh, localOnly = false) {
    const streamInfoUrl = `http://127.0.0.1:${state.serverPort}/api/stream-info?url=${encodeURIComponent(resolvedUrl || '')}&id=${encodeURIComponent(resolvedId || '')}${fresh ? '&fresh=1' : ''}${localOnly || navigator.onLine === false ? '&localOnly=1' : ''}&platform=${track.platform || state.platform}&title=${encodeURIComponent(track.title || '')}&artist=${encodeURIComponent(track.artist || '')}&duration=${encodeURIComponent(track.duration || 0)}&thumbnail=${encodeURIComponent(track.thumbnail || '')}`;
    const res = await fetch(streamInfoUrl, { signal });
    const data = await res.json();

    if (currentToken !== state.loadToken) return false;
    if (localOnly && !(data && data.success)) return false;

    // a downloaded, cached or device copy plays: the song is available offline
    if (data && data.success && data.isLocal) { try { offlineChanged(track, true); } catch (e) {} }

    if (!data || !data.success || !data.streamUrl) {
      // offline only saved copies are looked up (above), so this answers at once instead of trying every source
      if (!navigator.onLine) throw new Error(String(Tm('Offline: this song is not available in local cache')));
      throw new Error((data && data.error) || 'Failed to extract audio stream');
    }

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    el.nativeAudio.preload = 'auto';

    // hls.js (600 KB) loads with the first HLS stream instead of with the app
    if (data.isHls && !window.Hls) {
      await loadScriptOnce('assets/hls.min.js').catch(() => {});
      if (currentToken !== state.loadToken) return false;
    }
    if (data.isHls && window.Hls && Hls.isSupported()) {
      const created = /** @type {UrielHls} */ (new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000 }));
      hlsInstance = created;
      created.loadSource(data.streamUrl);
      // hls.js needs the real element: this song plays there (mobile/native-audio.ts)
      if (el.nativeAudio.useWeb) el.nativeAudio.useWeb();
      created.attachMedia(el.nativeAudio.webElement || el.nativeAudio);
      created.on(Hls.Events.MANIFEST_PARSED, () => {
        if (currentToken === state.loadToken) {
          playSmooth();
        }
      });
      // without this a dead HLS stream just sat on the loading spinner
      created.on(Hls.Events.ERROR, (/** @type {string} */ evt, /** @type {{ fatal?: boolean, type?: string, details?: string }} */ info) => {
        if (!info || !info.fatal || currentToken !== state.loadToken) return;
        const hls = created;
        if (info.type === Hls.ErrorTypes.MEDIA_ERROR && !hls._urielRecovered) {
          hls._urielRecovered = true;
          try { hls.recoverMediaError(); return; } catch (e) {}
        }
        if (recoverMidSong(currentToken, track)) return;
        try { hls.destroy(); } catch (e) {}
        if (hlsInstance === hls) hlsInstance = null;
        state.isPlaying = false;
        document.body.classList.remove('is-playing');
        updatePlayPauseButton(false, false);
        if (retryFresh(currentToken, track)) return;
        if (!skipUnplayable(currentToken, track)) showPlayFailure(Tm('Could not play this song. Try again or skip.'));
      });
    } else {
      // #17: a YouTube media URL is bound to the player client yt-dlp resolved it with; Chromium fetching it
      // with its own headers got "Format error" (code 4). On desktop it plays through the local proxy,
      // which fetches with yt-dlp's headers; the direct URL stays as a fallback.
      const src = pickStreamSrc(data);
      proxyFallback = src !== data.streamUrl ? null : { token: currentToken, track, url: data.proxyUrl || '' };
      el.nativeAudio.src = src;
      playSmooth();
    }
    return true;
  }

  function isGoogleVideoUrl(/** @type {string} */ u) {
    try { const h = new URL(u).hostname; return h === 'googlevideo.com' || h.endsWith('.googlevideo.com'); } catch (e) { return false; }
  }
  // the src the audio element gets for a /api/stream-info answer (same rule as stream-source.js): phones
  // play downloaded files and keep the URL they were given
  function pickStreamSrc(/** @type {UrielStreamInfo} */ data) {
    const isMobile = !!(window.electronAPI && window.electronAPI.isMobile);
    if (!isMobile && !data.isHls && !data.isLocal && data.proxyUrl && isGoogleVideoUrl(data.streamUrl)) return data.proxyUrl;
    return data.streamUrl;
  }
  // a direct (not proxied) stream that failed to load is tried once through the local proxy before a fresh lookup
  /** @type {{ token: number, track: UrielTrack, url: string } | null} */
  let proxyFallback = null;
  function tryProxyFallback(/** @type {number} */ token, /** @type {UrielTrack} */ track) {
    const fb = proxyFallback;
    proxyFallback = null;
    if (!fb || !fb.url || fb.token !== token || token !== state.loadToken || fb.track !== track || track !== state.currentTrack) return false;
    if (window.electronAPI && window.electronAPI.isMobile) return false;
    const me = el.nativeAudio.error;
    if (!me || (me.code !== 4 && me.code !== 2)) return false;
    console.warn('Track playback: direct stream failed, trying the local proxy');
    el.nativeAudio.src = fb.url;
    playSmooth();
    return true;
  }

  // A song that fails the first time (the lookup, the audio element on its URL, or nothing arriving) is
  // looked up once more, afresh, before the listener is told: the first failure was usually passing (a
  // shared lookup that failed, a remembered stream URL YouTube no longer serves) and Retry then played it.
  let freshRetryToken = -1;
  // One line for the console and the app log: what failed, with the DOMException's name and message and
  // the audio element's state (error code, readyState, networkState, which host it was loading from).
  /** @param {HTMLAudioElement} audio */
  function describeMediaState(audio) {
    if (!audio) return 'no audio element';
    let host = '';
    try { const s = audio.currentSrc || audio.src; host = s ? new URL(s).host : '(none)'; } catch (e) { host = '(bad url)'; }
    const me = audio.error;
    return `mediaError=${me ? me.code + (me.message ? ' ' + me.message : '') : 'none'} readyState=${audio.readyState} networkState=${audio.networkState} paused=${audio.paused} src=${host}${hlsInstance ? ' hls' : ''}`;
  }
  /** @param {string} what @param {unknown} err */
  function logPlaybackIssue(what, err) {
    const e = /** @type {{ name?: string, message?: string } | null} */ (err);
    const desc = e ? `${e.name || 'Error'}: ${e.message || String(e)}` : 'no details';
    const line = `${what}: ${desc} | ${describeMediaState(el.nativeAudio)} | load=${state.loadToken}`;
    console.warn(line);
    try { if (window.__riffLogError) window.__riffLogError('WARN', line, null); } catch (e) {}
    return line;
  }
  /** @param {number} token @param {UrielTrack | null} track */
  function retryFresh(token, track) {
    if (resumeAt && resumeAt.token === token) return recoverMidSong(token, track);
    if (token !== state.loadToken || freshRetryToken === token || !state.trackLoading || !track || track !== state.currentTrack || track.platform === 'local') return false;
    if (!navigator.onLine) return false;
    freshRetryToken = token;
    console.warn('Track playback: retrying with a fresh lookup');
    if (hlsInstance) { try { hlsInstance.destroy(); } catch (e) {} hlsInstance = null; }
    try { el.nativeAudio.pause(); el.nativeAudio.removeAttribute('src'); el.nativeAudio.load(); } catch (e) {}
    setTrackLoading(true);
    const signal = state.currentAbortController ? state.currentAbortController.signal : undefined;
    attachStream(track, track.url, track.id, token, signal, true).then((ok) => { if (ok) applyAudioSettings(); }, (err) => {
      if (err && err.name === 'AbortError') return;
      if (token !== state.loadToken) return;
      logPlaybackIssue('Song playback notice (fresh retry)', err);
      stopAfterFailure();
      if (!skipUnplayable(token, track)) showPlayFailure((err && err.message) || Tm('Could not load audio stream'));
    });
    return true;
  }

  // A song that was playing and lost its stream continues where it stopped (playback-recovery.js). When it won't
  // come back the song is unloaded, so that Play looks it up again at the same place. False: not for this path.
  const midSongRecovery = window.UrielPlaybackRecovery.createMidSongRecovery();
  let midSongLookup = -1; // loadToken of the look-up under way
  /** @type {{ token: number, track: UrielTrack, pos: number } | null} */
  let waitingForNet = null;
  /** @type {{ token: number, pos: number } | null} */
  let resumeAt = null;
  function unloadAtPosition(/** @type {number} */ pos) {
    const a = el.nativeAudio;
    if (hlsInstance) { try { hlsInstance.destroy(); } catch (e) {} hlsInstance = null; }
    try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) {}
    state.queueRestorePosition = pos;
    state.isPlaying = false;
    document.body.classList.remove('is-playing');
  }
  function recoverMidSong(/** @type {number} */ token, /** @type {UrielTrack | null} */ track) {
    if (token !== state.loadToken || !track || track !== state.currentTrack) return false;
    // a look-up that came back with a stream that fails too is still the same recovery, with the same place to continue
    const resuming = !!resumeAt && resumeAt.token === token;
    if (state.trackLoading && !resuming) return false;
    if (midSongLookup === token || (waitingForNet && waitingForNet.token === token)) return true;
    const a = el.nativeAudio;
    const pos = resuming && resumeAt ? resumeAt.pos : (a.currentTime || 0);
    // nearly over anyway: on to the next song rather than the same one from the start
    if (a.duration && pos > 1 && !window.UrielPlaybackRecovery.resumePosition(pos, a.duration)) { resumeAt = null; playNext(); return true; }
    const action = midSongRecovery.decide({ song: token, local: track.platform === 'local', online: navigator.onLine });
    if (action === 'give-up') {
      resumeAt = null;
      if (track.platform === 'local') return false;
      // it stops here rather than skipping on: a song that played until now is rarely the problem, the connection is
      unloadAtPosition(pos);
      setTrackLoading(false);
      updatePlayPauseButton(false, false);
      showToast(Tm('Could not play this song. Try again or skip.'), 'error');
      return true;
    }
    if (action === 'wait-online') {
      resumeAt = null;
      setTrackLoading(false);
      waitingForNet = { token, track, pos };
      updatePlayPauseButton(true, true);
      showToast(Tm('Connection lost. The song continues when it is back.'));
      return true;
    }
    if (!resuming) { resumeStream(token, track, pos); return true; }
    midSongLookup = token; // a connection that is only just coming back gets a moment between tries
    setTimeout(() => {
      if (midSongLookup === token) midSongLookup = -1;
      if (token === state.loadToken && track === state.currentTrack) resumeStream(token, track, pos);
    }, 3000);
    return true;
  }
  function resumeStream(/** @type {number} */ token, /** @type {UrielTrack} */ track, /** @type {number} */ pos) {
    console.warn('Track playback: stream lost, looking it up again');
    midSongLookup = token;
    resumeAt = { token, pos };
    setTrackLoading(true); // nothing is audible until it continues (phones keep themselves running on this)
    updatePlayPauseButton(true, true);
    const signal = state.currentAbortController ? state.currentAbortController.signal : undefined;
    attachStream(track, track.url, track.id, token, signal, true).then((ok) => {
      if (midSongLookup === token) midSongLookup = -1;
      if (ok) applyAudioSettings();
    }, (err) => {
      if (midSongLookup === token) midSongLookup = -1;
      if ((err && err.name === 'AbortError') || token !== state.loadToken) return;
      logPlaybackIssue('Song playback notice (mid-song look-up)', err);
      recoverMidSong(token, track);
    });
  }
  window.addEventListener('online', () => {
    const w = waitingForNet;
    waitingForNet = null;
    if (!w || w.token !== state.loadToken || w.track !== state.currentTrack) return;
    if (!state.isPlaying || el.nativeAudio.paused) { unloadAtPosition(w.pos); updatePlayPauseButton(false, false); return; } // paused meanwhile: it stays paused
    resumeStream(w.token, w.track, w.pos);
  });

  function flipAnimate(/** @type {(HTMLElement | null)[] | null} */ elements, /** @type {() => void} */ mutateFn, duration = 380) {
    const validElements = /** @type {HTMLElement[]} */ ((elements || []).filter((item) => item && item.getBoundingClientRect));
    const firstRects = new Map();
    validElements.forEach((/** @type {HTMLElement} */ item) => {
      firstRects.set(item, item.getBoundingClientRect());
    });

    validElements.forEach((/** @type {HTMLElement} */ item) => {
      item.style.transition = 'none';
      item.style.transform = 'none';
    });

    if (typeof mutateFn === 'function') {
      mutateFn();
    }

    /** @type {HTMLElement[]} */
    const animatingElements = [];
    validElements.forEach((/** @type {HTMLElement} */ item) => {
      const first = firstRects.get(item);
      const last = item.getBoundingClientRect();
      if (!first || !last) return;
      if ((first.width === 0 && first.height === 0) || (last.width === 0 && last.height === 0)) return;

      const dx = first.left - last.left;
      const dy = first.top - last.top;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        item.style.transform = `translate(${dx}px, ${dy}px)`;
        animatingElements.push(item);
      } else {
        item.style.transform = '';
        item.style.transition = '';
      }
    });

    if (animatingElements.length === 0) return;

    animatingElements.forEach(item => item.offsetHeight);

    requestAnimationFrame(() => {
      animatingElements.forEach(item => {
        item.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0, 0, 1)`;
        item.style.transform = '';

        let cleaned = false;
        const cleanUp = () => {
          if (cleaned) return;
          cleaned = true;
          item.removeEventListener('transitionend', onEnd);
          item.style.transition = '';
          item.style.transform = '';
        };
        const onEnd = (/** @type {TransitionEvent} */ e) => {
          if (e.target !== item || e.propertyName !== 'transform') return;
          cleanUp();
        };
        item.addEventListener('transitionend', onEnd);
        setTimeout(cleanUp, duration + 50);
      });
    });
  }

  function setLyricsEmpty(/** @type {boolean} */ isEmpty) {
    const panel = el.rightPanel || document.getElementById('right-panel');
    if (!panel) return;
    const currentlyEmpty = panel.classList.contains('lyrics-empty');
    if (currentlyEmpty === !!isEmpty) {
      syncTvLayout();
      return;
    }

    const hero = el.rightPanelArtworkBox || document.getElementById('right-panel-artwork-box');

    flipAnimate([hero], () => {
      panel.classList.toggle('lyrics-empty', !!isEmpty);
      syncTvLayout();
    }, 380);
    syncTvLayout(!!isEmpty);
  }

  async function loadSyncedLyrics(/** @type {string} */ title, /** @type {string} */ artist, /** @type {number} */ token) {
    if (el.lyricsContainer) {
      el.lyricsContainer.scrollTop = 0;
      el.lyricsContainer.style.transition = 'opacity 200ms cubic-bezier(0.2, 0, 0, 1)';
      el.lyricsContainer.style.opacity = '0';
    }
    if (typeof lyricsScrollRaf !== 'undefined' && lyricsScrollRaf) {
      cancelAnimationFrame(lyricsScrollRaf);
      lyricsScrollRaf = 0;
    }
    state.lastActiveLyricIdx = -1;
    state.forceLyricsScroll = true;
    state.forceSnapLyrics = true;
    state.syncedLyrics = [];
    state.isCustomLyrics = false;
    // the previous song's translations were shown under the new song's lines until its own translation loaded
    state.currentTranslations = null;
    // the iPhone lock screen / Dynamic Island lyrics (mobile/live-activity.ts) follow state.syncedLyrics
    window.dispatchEvent(new Event('uriel:lyrics'));
    renderMiniLyrics();

    try {
      // skipping through songs fired one lookup (several lrclib requests) per song and got rate limited
      await new Promise(r => setTimeout(r, 350));
      if (token !== state.loadToken) return;
      const onlineParam = getAdv('online_lyrics', true) ? '1' : '0';
      const dur = state.currentTrack && (state.currentTrack.title || '') === title ? Math.round(Number(state.currentTrack.duration) || 0) : 0;
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&online=${onlineParam}${dur ? `&duration=${dur}` : ''}&source=${lyricsSourcePref()}`);
      const data = await res.json();

      if (token !== state.loadToken || (state.currentTrack && (state.currentTrack.title || '') !== title)) return;

      if (!data.success || !data.lyrics) {
        if (el.lyricsStatus) el.lyricsStatus.textContent = '';
        if (el.lyricsContainer) {
          el.lyricsContainer.innerHTML = '';
          el.lyricsContainer.scrollTop = 0;
          el.lyricsContainer.style.opacity = '1';
        }
        setLyricsEmpty(true);
        return;
      }

      state.isCustomLyrics = !!data.isCustom;

      const raw = data.lyrics;
      const lines = raw.split('\n');
      const parsed = [];
      const lrcRegex = /\[(\d+):(\d+(\.\d+)?)\](.*)/;

      for (const line of lines) {
        const match = lrcRegex.exec(line);
        if (match) {
          const min = parseInt(match[1], 10);
          const sec = parseFloat(match[2]);
          const raw = match[4].trim();
          // enhanced LRC: <mm:ss.xx> before each word gives that word its own time
          const words = raw.includes('<') && window.UrielLyricsSources ? window.UrielLyricsSources.parseEnhancedLrcWords(raw, min * 60 + sec + 4) : null;
          const text = words ? raw.replace(/<\d+:\d+(?:\.\d+)?>/g, '').replace(/\s+/g, ' ').trim() : raw;
          if (text) {
            parsed.push(words ? { time: min * 60 + sec, text, words } : { time: min * 60 + sec, text: text });
          }
        } else if (line.trim()) {
          parsed.push({ time: -1, text: line.trim() });
        }
      }

      if (parsed.length === 0) {
        if (el.lyricsStatus) el.lyricsStatus.textContent = '';
        if (el.lyricsContainer) {
          el.lyricsContainer.innerHTML = '';
          el.lyricsContainer.scrollTop = 0;
          el.lyricsContainer.style.opacity = '1';
        }
        setLyricsEmpty(true);
        return;
      }

      state.syncedLyrics = parsed;
      window.dispatchEvent(new Event('uriel:lyrics'));
      const hasSyncTimes = parsed.some(p => p.time >= 0);
      if (el.lyricsStatus) el.lyricsStatus.textContent = data.isCustom ? (hasSyncTimes ? 'Custom synced' : 'Custom') : (hasSyncTimes ? 'Synced' : 'Plain');
      if (state.trEnabled && state.trAuto) {
        state.trActive = true;
        fetchAndApplyTranslation();
      } else {
        state.trActive = false;
        state.currentTranslations = null;
      }
      updateLyricsTranslationUI();
      renderLyricsView();
      setLyricsEmpty(false);
      if (el.lyricsContainer) {
        el.lyricsContainer.scrollTop = 0;
        el.lyricsContainer.style.opacity = '0';
        requestAnimationFrame(() => {
          el.lyricsContainer.style.transition = 'opacity 250ms cubic-bezier(0.2, 0, 0, 1)';
          el.lyricsContainer.style.opacity = '1';
        });
      }
      state.lastActiveLyricIdx = -1;
      state.forceLyricsScroll = true;
      state.forceSnapLyrics = true;
      if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      if (!data.isCustom) fetchAndUpgradeWords(title, artist, token);
    } catch (e) {
      if (token === state.loadToken) {
        if (el.lyricsStatus) el.lyricsStatus.textContent = '';
        if (el.lyricsContainer) {
          el.lyricsContainer.innerHTML = '';
          el.lyricsContainer.style.opacity = '1';
        }
        setLyricsEmpty(true);
      }
    }
  }

  function getLyricsWordStyle() { return localStorage.getItem('uriel_lyrics_word_style') === 'words' ? 'words' : 'gradient'; }
  function isGradientMode() { return state.lyricsMode === 'word' && getAdv('karaoke_words', true) && getLyricsWordStyle() === 'gradient'; }

  function renderLyricsView() {
    if (!el.lyricsContainer) return;
    if (state.syncedLyrics.length === 0) return;
    el.lyricsContainer.innerHTML = '';

    state.syncedLyrics.forEach((/** @type {{ time: number, text: string }} */ line, /** @type {number} */ index) => {
      const div = document.createElement('div');
      div.className = 'lyric-line';
      div.id = `lyric-line-${index}`;
      if (isRtlText(line.text)) div.classList.add('rtl');

      if (isGradientMode()) {
        const fill = document.createElement('span');
        fill.className = 'lyric-fill';
        fill.textContent = line.text.replace(/<[^>]+>/g, '').trim();
        div.classList.add('gradient-line');
        div.appendChild(fill);
      } else if (getAdv('karaoke_words', true) && state.lyricsMode === 'word') {
        div.innerHTML = lyricWordSpans(line);
      } else {
        div.textContent = line.text;
      }

      if (state.trActive && state.currentTranslations && state.currentTranslations[index]) {
        const trDiv = document.createElement('div');
        trDiv.className = 'lyric-translation';
        trDiv.dir = 'auto';
        trDiv.textContent = state.currentTranslations[index];
        div.appendChild(trDiv);
      }

      if (line.time >= 0) {
        div.addEventListener('click', () => {
          const seekTime = getLineStartTime(index);
          if (el.nativeAudio && seekTime >= 0) el.nativeAudio.currentTime = seekTime;
        });
      }
      el.lyricsContainer.appendChild(div);
    });
    updateLyricsPadding();
    state.lastActiveLyricIdx = -1;
    state.forceLyricsScroll = true;
    state.forceSnapLyrics = true;
    if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
  }

  function updateLyricsPadding() {
    const c = el.lyricsContainer;
    if (!c || !c.clientHeight) return;
    const pad = Math.round(c.clientHeight * 0.42);
    c.style.paddingTop = `${pad}px`;
    c.style.paddingBottom = `${pad}px`;
  }
  window.addEventListener('resize', () => {
    updateLyricsPadding();
    state.forceLyricsScroll = true;
    state.forceSnapLyrics = true;
    state.lastActiveLyricIdx = -1;
    if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
  });
  if (window.ResizeObserver && el.lyricsContainer) {
    let lastObservedH = 0;
    new ResizeObserver((entries) => {
      const h = Math.round(entries[0]?.contentRect?.height || el.lyricsContainer.clientHeight || 0);
      if (h <= 0) {
        lastObservedH = 0;
        return;
      }
      if (Math.abs(h - lastObservedH) > 4) {
        lastObservedH = h;
        updateLyricsPadding();
        state.forceLyricsScroll = true;
        state.forceSnapLyrics = true;
        state.lastActiveLyricIdx = -1;
        if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      }
    }).observe(el.lyricsContainer);
  }

  const TRANSLATION_LANGUAGES = [
    { code: 'af', name: 'Afrikaans', flag: '🇿🇦' },
    { code: 'sq', name: 'Albanian', flag: '🇦🇱' },
    { code: 'am', name: 'Amharic', flag: '🇪🇹' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    { code: 'hy', name: 'Armenian', flag: '🇦🇲' },
    { code: 'as', name: 'Assamese', flag: '🇮🇳' },
    { code: 'ay', name: 'Aymara', flag: '🇧🇴' },
    { code: 'az', name: 'Azerbaijani', flag: '🇦🇿' },
    { code: 'bm', name: 'Bambara', flag: '🇲🇱' },
    { code: 'eu', name: 'Basque', flag: '🇪🇸' },
    { code: 'be', name: 'Belarusian', flag: '🇧🇾' },
    { code: 'bn', name: 'Bengali', flag: '🇧🇩' },
    { code: 'bho', name: 'Bhojpuri', flag: '🇮🇳' },
    { code: 'bs', name: 'Bosnian', flag: '🇧🇦' },
    { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
    { code: 'ca', name: 'Catalan', flag: '🇪🇸' },
    { code: 'ceb', name: 'Cebuano', flag: '🇵🇭' },
    { code: 'ny', name: 'Chichewa', flag: '🇲🇼' },
    { code: 'zh-CN', name: 'Chinese (Simplified)', flag: '🇨🇳' },
    { code: 'zh-TW', name: 'Chinese (Traditional)', flag: '🇹🇼' },
    { code: 'co', name: 'Corsican', flag: '🇫🇷' },
    { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
    { code: 'cs', name: 'Czech', flag: '🇨🇿' },
    { code: 'da', name: 'Danish', flag: '🇩🇰' },
    { code: 'dv', name: 'Dhivehi', flag: '🇲🇻' },
    { code: 'doi', name: 'Dogri', flag: '🇮🇳' },
    { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'eo', name: 'Esperanto', flag: '🌐' },
    { code: 'et', name: 'Estonian', flag: '🇪🇪' },
    { code: 'ee', name: 'Ewe', flag: '🇬🇭' },
    { code: 'tl', name: 'Filipino', flag: '🇵🇭' },
    { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'fy', name: 'Frisian', flag: '🇳🇱' },
    { code: 'gl', name: 'Galician', flag: '🇪🇸' },
    { code: 'ka', name: 'Georgian', flag: '🇬🇪' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'el', name: 'Greek', flag: '🇬🇷' },
    { code: 'gn', name: 'Guarani', flag: '🇵🇾' },
    { code: 'gu', name: 'Gujarati', flag: '🇮🇳' },
    { code: 'ht', name: 'Haitian Creole', flag: '🇭🇹' },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
    { code: 'haw', name: 'Hawaiian', flag: '🇺🇸' },
    { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
    { code: 'hmn', name: 'Hmong', flag: '🇱🇦' },
    { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
    { code: 'is', name: 'Icelandic', flag: '🇮🇸' },
    { code: 'ig', name: 'Igbo', flag: '🇳🇬' },
    { code: 'ilo', name: 'Ilocano', flag: '🇵🇭' },
    { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
    { code: 'ga', name: 'Irish', flag: '🇮🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'jw', name: 'Javanese', flag: '🇮🇩' },
    { code: 'kn', name: 'Kannada', flag: '🇮🇳' },
    { code: 'kk', name: 'Kazakh', flag: '🇰🇿' },
    { code: 'km', name: 'Khmer', flag: '🇰🇭' },
    { code: 'rw', name: 'Kinyarwanda', flag: '🇷🇼' },
    { code: 'gom', name: 'Konkani', flag: '🇮🇳' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'kri', name: 'Krio', flag: '🇸🇱' },
    { code: 'ku', name: 'Kurdish (Kurmanji)', flag: '🇹🇷' },
    { code: 'ckb', name: 'Kurdish (Sorani)', flag: '🇮🇶' },
    { code: 'ky', name: 'Kyrgyz', flag: '🇰🇬' },
    { code: 'lo', name: 'Lao', flag: '🇱🇦' },
    { code: 'la', name: 'Latin', flag: '🏛️' },
    { code: 'lv', name: 'Latvian', flag: '🇱🇻' },
    { code: 'ln', name: 'Lingala', flag: '🇨🇩' },
    { code: 'lt', name: 'Lithuanian', flag: '🇱🇹' },
    { code: 'lg', name: 'Luganda', flag: '🇺🇬' },
    { code: 'lb', name: 'Luxembourgish', flag: '🇱🇺' },
    { code: 'mk', name: 'Macedonian', flag: '🇲🇰' },
    { code: 'mai', name: 'Maithili', flag: '🇮🇳' },
    { code: 'mg', name: 'Malagasy', flag: '🇲🇬' },
    { code: 'ms', name: 'Malay', flag: '🇲🇾' },
    { code: 'ml', name: 'Malayalam', flag: '🇮🇳' },
    { code: 'mt', name: 'Maltese', flag: '🇲🇹' },
    { code: 'mi', name: 'Maori', flag: '🇳🇿' },
    { code: 'mr', name: 'Marathi', flag: '🇮🇳' },
    { code: 'mni-Mtei', name: 'Meiteilon (Manipuri)', flag: '🇮🇳' },
    { code: 'lus', name: 'Mizo', flag: '🇮🇳' },
    { code: 'mn', name: 'Mongolian', flag: '🇲🇳' },
    { code: 'my', name: 'Myanmar (Burmese)', flag: '🇲🇲' },
    { code: 'ne', name: 'Nepali', flag: '🇳🇵' },
    { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
    { code: 'or', name: 'Odia (Oriya)', flag: '🇮🇳' },
    { code: 'om', name: 'Oromo', flag: '🇪🇹' },
    { code: 'ps', name: 'Pashto', flag: '🇦🇫' },
    { code: 'fa', name: 'Persian', flag: '🇮🇷' },
    { code: 'pl', name: 'Polish', flag: '🇵🇱' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'pa', name: 'Punjabi', flag: '🇮🇳' },
    { code: 'qu', name: 'Quechua', flag: '🇵🇪' },
    { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'sm', name: 'Samoan', flag: '🇼🇸' },
    { code: 'sa', name: 'Sanskrit', flag: '🇮🇳' },
    { code: 'gd', name: 'Scots Gaelic', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
    { code: 'sr', name: 'Serbian', flag: '🇷🇸' },
    { code: 'st', name: 'Sesotho', flag: '🇱🇸' },
    { code: 'sn', name: 'Shona', flag: '🇿🇼' },
    { code: 'sd', name: 'Sindhi', flag: '🇵🇰' },
    { code: 'si', name: 'Sinhala', flag: '🇱🇰' },
    { code: 'sk', name: 'Slovak', flag: '🇸🇰' },
    { code: 'sl', name: 'Slovenian', flag: '🇸🇮' },
    { code: 'so', name: 'Somali', flag: '🇸🇴' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'su', name: 'Sundanese', flag: '🇮🇩' },
    { code: 'sw', name: 'Swahili', flag: '🇰🇪' },
    { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
    { code: 'tg', name: 'Tajik', flag: '🇹🇯' },
    { code: 'ta', name: 'Tamil', flag: '🇮🇳' },
    { code: 'tt', name: 'Tatar', flag: '🇷🇺' },
    { code: 'te', name: 'Telugu', flag: '🇮🇳' },
    { code: 'th', name: 'Thai', flag: '🇹🇭' },
    { code: 'ti', name: 'Tigrinya', flag: '🇪🇷' },
    { code: 'ts', name: 'Tsonga', flag: '🇿🇦' },
    { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
    { code: 'tk', name: 'Turkmen', flag: '🇹🇲' },
    { code: 'ak', name: 'Twi (Akan)', flag: '🇬🇭' },
    { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
    { code: 'ur', name: 'Urdu', flag: '🇵🇰' },
    { code: 'ug', name: 'Uyghur', flag: '🇨🇳' },
    { code: 'uz', name: 'Uzbek', flag: '🇺🇿' },
    { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
    { code: 'cy', name: 'Welsh', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
    { code: 'xh', name: 'Xhosa', flag: '🇿🇦' },
    { code: 'yi', name: 'Yiddish', flag: '🇮🇱' },
    { code: 'yo', name: 'Yoruba', flag: '🇳🇬' },
    { code: 'zu', name: 'Zulu', flag: '🇿🇦' }
  ];

  const lyricsTranslationCache = new Map();

  // translations go line by line, so they belong to these exact lines: edited lyrics or another source get new ones
  function translationKey() {
    const t = state.currentTrack;
    const lines = (state.syncedLyrics || []).map((/** @type {{ time: number, text: string }} */ l) => l.text).join('\n');
    return `${(t && t.title) || ''}|${(t && t.artist) || ''}|${state.trLang || 'en'}`.toLowerCase() + '\n' + lines;
  }

  async function fetchAndApplyTranslation() {
    if (!state.currentTrack || !state.syncedLyrics || state.syncedLyrics.length === 0) return;
    const lang = state.trLang || 'en';
    const cacheKey = translationKey();

    if (lyricsTranslationCache.has(cacheKey)) {
      state.currentTranslations = lyricsTranslationCache.get(cacheKey);
      renderLyricsView();
      if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      return;
    }

    const texts = state.syncedLyrics.map((/** @type {{ time: number, text: string }} */ l) => l.text);
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, targetLang: lang })
      });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.translations)) {
        lyricsTranslationCache.set(cacheKey, data.translations);
        capMap(lyricsTranslationCache, 30);
        if (translationKey() === cacheKey && state.trActive) {
          state.currentTranslations = data.translations;
          renderLyricsView();
          if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
        }
      }
    } catch (e) {
      console.error('Translation error:', e);
    }
  }

  function updateLyricsTranslationUI() {
    if (el.btnTrEnabled) el.btnTrEnabled.classList.toggle('active', !!state.trEnabled);
    if (el.selectTrLang) el.selectTrLang.value = state.trLang || 'en';
    const trLangMenu = document.getElementById('tr-lang-menu');
    const trLangLabel = document.getElementById('tr-lang-label');
    const curLang = state.trLang || 'en';
    if (trLangMenu) {
      /** @type {NodeListOf<HTMLElement>} */ (trLangMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
        const isSel = opt.dataset.value === curLang;
        opt.classList.toggle('selected', isSel);
        if (isSel && trLangLabel) trLangLabel.textContent = opt.textContent;
      });
    }
    if (trLangLabel && (!trLangMenu || !trLangMenu.querySelector('.m3-dropdown-option.selected'))) {
      const found = TRANSLATION_LANGUAGES.find(l => l.code === curLang);
      if (found) trLangLabel.textContent = `${found.flag} ${found.name} (${found.code})`;
    }
    if (el.btnTrAuto) el.btnTrAuto.classList.toggle('active', !!state.trAuto);
    if (el.btnTranslateLyrics) {
      el.btnTranslateLyrics.classList.toggle('hidden', !state.trEnabled);
      el.btnTranslateLyrics.classList.toggle('active', !!state.trActive);
    }
  }

  const CUSTOM_SHIFT_LEAD_SECONDS = 4.0;

  function getLineStartTime(/** @type {number} */ idx) {
    const lines = state.syncedLyrics;
    if (idx < 0 || idx >= lines.length) return -1;
    const raw = lines[idx].time;
    if (raw < 0) return -1;
    if (!state.isCustomLyrics) return raw;
    for (let j = idx - 1; j >= 0; j--) {
      if (lines[j].time >= 0) return lines[j].time;
    }
    return Math.max(0, raw - CUSTOM_SHIFT_LEAD_SECONDS);
  }

  function getLineEndTime(/** @type {number} */ idx) {
    const start = getLineStartTime(idx);
    const lines = state.syncedLyrics;
    for (let j = idx + 1; j < lines.length; j++) {
      const t = getLineStartTime(j);
      if (t >= 0) return t;
    }
    return start + 4.0;
  }

  /** @type {Record<string, { css: string, fn: (t: number) => number }>} */
  const LYRIC_EASINGS = {
    inout: { css: 'cubic-bezier(0.65, 0, 0.35, 1)', fn: (/** @type {number} */ t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) },
    quad: { css: 'cubic-bezier(0.45, 0, 0.55, 1)', fn: (/** @type {number} */ t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) },
    sine: { css: 'cubic-bezier(0.37, 0, 0.63, 1)', fn: (/** @type {number} */ t) => -(Math.cos(Math.PI * t) - 1) / 2 },
    out: { css: 'cubic-bezier(0.22, 1, 0.36, 1)', fn: (/** @type {number} */ t) => 1 - Math.pow(1 - t, 4) },
    outsine: { css: 'cubic-bezier(0.39, 0.575, 0.565, 1)', fn: (/** @type {number} */ t) => Math.sin((t * Math.PI) / 2) },
    expo: { css: 'cubic-bezier(0.16, 1, 0.3, 1)', fn: (/** @type {number} */ t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)) },
    linear: { css: 'linear', fn: (/** @type {number} */ t) => t }
  };
  function getLyricsEase() {
    const v = localStorage.getItem('uriel_lyrics_ease') || '';
    return LYRIC_EASINGS[v] ? v : 'inout';
  }
  function getLyricsSpeed() {
    const v = parseFloat(localStorage.getItem('uriel_lyrics_speed') || '');
    return (v >= 0.5 && v <= 2.5) ? v : 1.0;
  }
  function applyLyricsEase() {
    const ease = LYRIC_EASINGS[getLyricsEase()] || LYRIC_EASINGS.inout;
    document.documentElement.style.setProperty('--lyric-ease', ease.css);
    const speed = getLyricsSpeed();
    document.documentElement.style.setProperty('--lyric-duration', `${(0.45 / speed).toFixed(2)}s`);
  }
  function getLyricsGradientTightness() {
    const v = parseInt(localStorage.getItem('uriel_lyrics_gradient_tightness') || localStorage.getItem('uriel_gradient_tight') || '', 10);
    return (v >= 0 && v <= 40) ? v : 2;
  }
  function applyLyricsGradientTightness() {
    const span = getLyricsGradientTightness();
    document.documentElement.style.setProperty('--lyric-gradient-span', `${span}%`);
    document.documentElement.style.setProperty('--lyric-gradient-full', `${100 + span}%`);
    document.documentElement.style.setProperty('--lyric-fw', `${span}%`);
  }
  let lyricsScrollRaf = 0;
  function animateLyricsScroll(/** @type {HTMLElement} */ container, /** @type {number} */ target) {
    cancelAnimationFrame(lyricsScrollRaf);
    const from = container.scrollTop;
    const delta = target - from;
    if (Math.abs(delta) < 1) return;
    const ease = (LYRIC_EASINGS[getLyricsEase()] || LYRIC_EASINGS.inout).fn;
    const speed = getLyricsSpeed();
    const duration = Math.max(120, Math.min(750, Math.max(420, Math.abs(delta) * 1.2)) / speed);
    const start = performance.now();
    const step = (/** @type {number} */ now) => {
      const t = Math.min(1, (now - start) / duration);
      container.scrollTop = from + delta * ease(t);
      if (t < 1) lyricsScrollRaf = requestAnimationFrame(step);
    };
    lyricsScrollRaf = requestAnimationFrame(step);
  }
  if (el.lyricsContainer) ['wheel', 'touchstart', 'pointerdown'].forEach((ev) => el.lyricsContainer.addEventListener(ev, () => cancelAnimationFrame(lyricsScrollRaf), { passive: true }));
  applyLyricsEase();
  applyLyricsGradientTightness();

  const PUNCT_OR_SPACE_REGEX = /^[\s\p{P}]$/u;
  const CJK_REGEX = /^[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]$/u;
  const MARK_REGEX = /^\p{M}$/u;
  const CYRILLIC_VOWELS = new Set('аеёиоуыэюяєіїўѣѵѫѧѩѭ');
  const LATIN_VOWEL_EXTRA = new Set(['æ', 'ø', 'œ', 'ı']);

  function getCharBaseWeight(/** @type {string} */ c) {
    if (PUNCT_OR_SPACE_REGEX.test(c)) return 0.4;
    if (CJK_REGEX.test(c)) return 3.0;
    if (MARK_REGEX.test(c)) return 3.0;
    const lower = c.toLowerCase();
    if (CYRILLIC_VOWELS.has(lower)) return 3.0;
    const base = c.normalize('NFD')[0].toLowerCase();
    if ('aeiouy'.includes(base) || LATIN_VOWEL_EXTRA.has(lower)) return 3.0;
    return 1.0;
  }

  /** @type {{ lineEl: Element | null, lineIdx: number, text: string, N: number, cumWeights: Float64Array | null, totalWeight: number }} */
  let gradientLineCache = {
    lineEl: null,
    lineIdx: -1,
    text: '',
    N: 0,
    cumWeights: null,
    totalWeight: 0
  };

  function getLineGradientWeights(/** @type {Element} */ lineEl, /** @type {number} */ idx, /** @type {string} */ text) {
    if (gradientLineCache.lineEl === lineEl && gradientLineCache.lineIdx === idx && gradientLineCache.text === text) {
      return gradientLineCache;
    }
    const chars = Array.from(text);
    const N = chars.length;
    if (N === 0) {
      gradientLineCache = { lineEl, lineIdx: idx, text, N: 0, cumWeights: null, totalWeight: 0 };
      return gradientLineCache;
    }
    const outroStart = Math.floor(N * 0.8);
    const cumWeights = new Float64Array(N + 1);
    cumWeights[0] = 0;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const baseW = getCharBaseWeight(chars[i]);
      const w = (i >= outroStart) ? baseW * 1.6 : baseW;
      total += w;
      cumWeights[i + 1] = total;
    }
    gradientLineCache = {
      lineEl,
      lineIdx: idx,
      text,
      N,
      cumWeights,
      totalWeight: total
    };
    return gradientLineCache;
  }

  let gradientRaf = 0;
  let gradientTimer = 0;
  function updateActiveGradient() {
    const lineEl = document.querySelector('.lyric-line.active.gradient-line');
    if (!lineEl || !el.nativeAudio) return;
    const fill = /** @type {HTMLElement} */ (lineEl.firstElementChild);
    if (!fill) return;

    const idx = parseInt(lineEl.id.replace('lyric-line-', ''), 10);
    const start = getLineStartTime(idx);
    const dur = Math.max(0.5, getLineEndTime(idx) - start);
    const t = el.nativeAudio.currentTime + (state.isCustomLyrics ? 0.25 : 0);
    const tau = Math.min(1, Math.max(0, (t - start) / dur));

    const text = fill.textContent || '';
    const cache = getLineGradientWeights(lineEl, idx, text);
    const timed = lineTimedWords(state.syncedLyrics[idx]);
    const timedK = timed ? window.UrielLyricsSources.timedProgress(timed, t) : null;

    let k = tau;
    if (timedK !== null) {
      k = timedK;
    } else if (cache.N > 0 && cache.totalWeight > 0) {
      if (tau <= 0) {
        k = 0;
      } else if (tau >= 1) {
        k = 1;
      } else {
        const tw = tau * cache.totalWeight;
        const cw = /** @type {Float64Array} */ (cache.cumWeights);
        const N = cache.N;
        let low = 0, high = N - 1;
        let i = 0;
        while (low <= high) {
          const mid = (low + high) >> 1;
          if (cw[mid + 1] <= tw) {
            low = mid + 1;
          } else if (cw[mid] > tw) {
            high = mid - 1;
          } else {
            i = mid;
            break;
          }
        }
        const charWeight = cw[i + 1] - cw[i];
        const pi = charWeight > 0 ? (tw - cw[i]) / charWeight : 0;
        k = Math.min(1, Math.max(0, (i + pi) / N));
      }
    }

    fill.style.setProperty('--k', k.toFixed(4));
  }
  function startGradientLoop() {
    if (gradientRaf || gradientTimer) return;
    const tick = () => {
      gradientRaf = 0;
      if (!state.isPlaying || !state.isWindowVisible || !isGradientMode()) return;
      updateActiveGradient();
      // the word fill restyles the lyrics each time: 30 fps on phones and the Settings cap here look just as smooth
      const fps = isPhoneApp ? 30 : viz.userFpsCap;
      if (!fps) { gradientRaf = requestAnimationFrame(tick); return; }
      gradientTimer = window.setTimeout(() => { gradientTimer = 0; gradientRaf = requestAnimationFrame(tick); }, Math.max(0, 1000 / fps - 7));
    };
    gradientRaf = requestAnimationFrame(tick);
  }

  function getLyricTargetScroll(/** @type {HTMLElement | null} */ activeEl, /** @type {HTMLElement | null} */ parent) {
    if (!activeEl || !parent) return 0;
    let top = 0;
    /** @type {HTMLElement | null} */
    let curr = activeEl;
    let reachedParent = false;
    while (curr) {
      if (curr === parent) {
        reachedParent = true;
        break;
      }
      top += curr.offsetTop;
      curr = /** @type {HTMLElement | null} */ (curr.offsetParent);
    }
    const parentH = parent.clientHeight;
    const lineH = activeEl.offsetHeight;
    if (!reachedParent) {
      const pR = parent.getBoundingClientRect(), lR = activeEl.getBoundingClientRect();
      if (pR.height > 0) {
        return Math.max(0, parent.scrollTop + (lR.top - pR.top) - (pR.height / 2) + (lR.height / 2));
      }
      return 0;
    }
    return Math.max(0, top - (parentH / 2) + (lineH / 2));
  }

  function updateSyncedLyricsHighlight(/** @type {number} */ currentTime) {
    if (miniLyricsShown()) updateMiniLyricsHighlight(currentTime);
    if (state.syncedLyrics.length === 0 || !state.isWindowVisible) return;
    const lookAhead = state.isCustomLyrics ? 0.25 : 0.0;
    const matchTime = currentTime + lookAhead;
    const activeIndex = window.UrielLyricsSources.activeLineIndex(state.syncedLyrics.length, getLineStartTime, matchTime, state.lastActiveLyricIdx);

    if (activeIndex >= 0 && state.isPlaying) {
      const currentLineTime = getLineStartTime(activeIndex);
      const nextLineTime = getLineEndTime(activeIndex);
      const lineDur = Math.max(0.5, nextLineTime - currentLineTime);
      const progress = Math.min(Math.max((matchTime - currentLineTime) / lineDur, 0), 0.999);

      // this runs every frame: split a line once, when it becomes the active one
      const activeLine = state.syncedLyrics[activeIndex];
      if (state.lyricWordsLine !== activeLine) {
        state.lyricWordsLine = activeLine;
        state.lyricWords = activeLine.text.replace(/<[^>]+>/g, '').trim().split(/\s+/).filter(Boolean);
      }
      const words = state.lyricWords;
      const totalWords = words.length;
      const currentWordIndex = totalWords > 0 ? Math.floor(progress * totalWords) : 0;
      const activeWordText = totalWords > 0 ? words[currentWordIndex] : '';

      const stateKey = `${activeIndex}-${currentWordIndex}`;
      if (state.lastBroadcastStateKey !== stateKey) {
        state.lastBroadcastStateKey = stateKey;
        sendStateToServer(activeWordText, currentWordIndex, activeIndex);
      }
    }

    const parent = el.lyricsContainer;
    const hasLayout = !!(parent && parent.clientHeight >= 40);
    const lineChanged = state.lastActiveLyricIdx !== activeIndex || state.forceLyricsScroll;
    const shouldSnap = state.forceSnapLyrics;
    let targetY = null;
    const autoscroll = !(lineChanged || shouldSnap) || getAdv('lyrics_autoscroll', true);
    if (hasLayout && (lineChanged || shouldSnap) && autoscroll) {
      if (activeIndex >= 0) {
        const activeEl = document.getElementById(`lyric-line-${activeIndex}`);
        if (activeEl) {
          targetY = getLyricTargetScroll(activeEl, parent);
          state.forceLyricsScroll = false;
          state.forceSnapLyrics = false;
          state.lastActiveLyricIdx = activeIndex;
        }
      } else {
        targetY = 0;
        state.forceLyricsScroll = false;
        state.forceSnapLyrics = false;
        state.lastActiveLyricIdx = activeIndex;
      }
    } else if (hasLayout && (!state.forceLyricsScroll || !autoscroll)) {
      state.lastActiveLyricIdx = activeIndex;
      // with auto-scroll off nothing else clears these, and every frame would count as a new line
      if (!autoscroll) { state.forceLyricsScroll = false; state.forceSnapLyrics = false; }
    }

    const gradientMode = isGradientMode();
    const wordMode = !gradientMode && state.lyricsMode === 'word' && getAdv('karaoke_words', true);
    const activeLineEl = activeIndex >= 0 ? document.getElementById(`lyric-line-${activeIndex}`) : null;

    // Every line only needs touching when the active line changes (or the lines were rebuilt)
    if (lineChanged || activeLineEl !== state.lyricSweptEl) {
      state.lyricSweptEl = activeLineEl;
      state.lyricWordKey = null;
      /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.lyric-line')).forEach((lineEl, idx) => {
        if (lineChanged) {
          // the blur and fade stop changing 4 lines away: far lines keep their value and aren't restyled
          const dist = activeIndex >= 0 ? Math.min(Math.abs(idx - activeIndex), 5) : 0;
          if (lineEl._lyricDist !== dist) {
            lineEl._lyricDist = dist;
            lineEl.style.setProperty('--dist', String(dist));
          }
        }
        if (idx === activeIndex) {
          lineEl.classList.add('active');
          return;
        }
        lineEl.classList.remove('active');
        if (lineEl.classList.contains('gradient-line')) {
          lineEl.firstElementChild && /** @type {HTMLElement} */ (lineEl.firstElementChild).style.setProperty('--k', '0');
        }
        if (wordMode) {
          lineEl.querySelectorAll('.lyric-word').forEach(wSpan => {
            wSpan.className = idx < activeIndex ? 'lyric-word past-word' : 'lyric-word';
          });
        }
      });
    }

    if (activeLineEl && gradientMode) {
      // the running loop draws it; when it isn't running (paused, seeking) draw once here
      if (!gradientRaf && !gradientTimer) updateActiveGradient();
      startGradientLoop();
    } else if (activeLineEl && wordMode) {
      const currentLineTime = getLineStartTime(activeIndex);
      const lineDur = Math.max(0.5, getLineEndTime(activeIndex) - currentLineTime);
      const progress = Math.min(Math.max((matchTime - currentLineTime) / lineDur, 0), 0.999);
      const wordSpans = activeLineEl.querySelectorAll('.lyric-word');
      const totalWords = wordSpans.length;
      const timed = lineTimedWords(state.syncedLyrics[activeIndex]);
      const currentWordIndex = timed && timed.length === totalWords ? timedWordIndex(timed, matchTime) : Math.floor(progress * totalWords);
      if (state.lyricWordKey !== currentWordIndex) {
        state.lyricWordKey = currentWordIndex;
        wordSpans.forEach((wSpan, wIdx) => {
          if (wIdx < currentWordIndex) {
            wSpan.className = 'lyric-word past-word';
          } else if (wIdx === currentWordIndex) {
            wSpan.className = 'lyric-word active-word';
          } else {
            wSpan.className = 'lyric-word';
          }
        });
      }
    }

    if (targetY !== null && parent) {
      if (shouldSnap) {
        cancelAnimationFrame(lyricsScrollRaf);
        parent.scrollTop = targetY;
      } else {
        animateLyricsScroll(parent, targetY);
      }
    }
  }

  function updateLyricsModeButton() {
    if (!el.btnLyricsMode) return;
    const isWordEnabled = getAdv('karaoke_words', true);
    if (!isWordEnabled && state.lyricsMode === 'word') {
      state.lyricsMode = 'line';
    }
    I18N.text(el.btnLyricsMode.querySelector('span'), state.lyricsMode === 'word' ? 'Word' : 'Line');
  }

  if (el.btnLyricsMode) {
    updateLyricsModeButton();
    el.btnLyricsMode.addEventListener('click', () => {
      if (!getAdv('karaoke_words', true)) {
        state.lyricsMode = 'line';
        updateLyricsModeButton();
        return;
      }
      state.lyricsMode = state.lyricsMode === 'line' ? 'word' : 'line';
      updateLyricsModeButton();
      renderLyricsView();
      // word timings are only looked up for word-by-word karaoke
      if (state.lyricsMode === 'word' && state.currentTrack && !state.isCustomLyrics) fetchAndUpgradeWords(state.currentTrack.title || '', state.currentTrack.artist || '', state.loadToken);
      if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
    });
  }

  if (el.btnTranslateLyrics) {
    el.btnTranslateLyrics.addEventListener('click', () => {
      state.trActive = !state.trActive;
      updateLyricsTranslationUI();
      if (state.trActive) {
        fetchAndApplyTranslation();
      } else {
        state.currentTranslations = null;
        renderLyricsView();
        if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      }
    });
  }

  /** @type {HTMLElement | null} */
  let lyricsContainerParent = null;
  /** @type {ChildNode | null} */
  let lyricsContainerSibling = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tvIdleTimer = null;

  function resetTvIdleTimer() {
    if (!state.isTvKaraokeOpen || !el.tvKaraoke) return;
    el.tvKaraoke.classList.remove('tv-idle');
    if (tvIdleTimer) clearTimeout(tvIdleTimer);
    tvIdleTimer = setTimeout(() => {
      const tvkPanel = document.getElementById('tvk-panel');
      if (tvkPanel && tvkPanel.classList.contains('open')) return;
      if (state.isTvKaraokeOpen && el.tvKaraoke) {
        el.tvKaraoke.classList.add('tv-idle');
      }
    }, 3000);
  }

  let activeTvBannerKey = '';
  let activeTvLayerIdx = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tvBannerTransitionTimer = null;

  function syncTvBanner() {
    const tvBg = el.tvBg || document.getElementById('tv-bg');
    if (!tvBg) return;

    let layerA = /** @type {HTMLElement} */ (document.getElementById('tv-bg-layer-a'));
    let layerB = /** @type {HTMLElement} */ (document.getElementById('tv-bg-layer-b'));
    if (!layerA || !layerB) {
      tvBg.innerHTML = '<div class="tv-bg-layer active" id="tv-bg-layer-a"></div><div class="tv-bg-layer" id="tv-bg-layer-b"></div>';
      layerA = /** @type {HTMLElement} */ (document.getElementById('tv-bg-layer-a'));
      layerB = /** @type {HTMLElement} */ (document.getElementById('tv-bg-layer-b'));
      activeTvLayerIdx = 0;
      activeTvBannerKey = '';
    }

    const banner = document.getElementById('right-panel-banner');
    let bannerType = 'none';
    let bannerSrc = '';

    if (banner && banner.style.display !== 'none' && banner.style.opacity !== '0') {
      const bannerImg = /** @type {HTMLElement} */ (banner.querySelector('.banner-image'));
      const video = banner.querySelector('video');
      const img = banner.querySelector('img');
      if (video && video.src) {
        bannerType = 'video';
        bannerSrc = video.src;
      } else if (img && img.src) {
        bannerType = 'img';
        bannerSrc = img.src;
      } else if (bannerImg && bannerImg.style.backgroundImage && bannerImg.style.backgroundImage !== 'none') {
        bannerType = 'bg';
        bannerSrc = bannerImg.style.backgroundImage;
      } else if (banner.style.backgroundImage && banner.style.backgroundImage !== 'none') {
        bannerType = 'bg';
        bannerSrc = banner.style.backgroundImage;
      }
    }

    // the song's own banner (Track art dialog), with its own blur / opacity / fade when it has them (Riff 43)
    const songArt = state.currentTrack ? getTrackArt(state.currentTrack) : {};
    applyTrackBannerFx(songArt);
    if (bannerType === 'none' && songArt.banner) {
      bannerType = /\.(mp4|webm)($|\?)/i.test(songArt.banner) ? 'video' : 'img';
      bannerSrc = songArt.banner;
    }

    // no banner (they're gone in Uriel): use the custom background if there is one, else the cover
    const customBg = localStorage.getItem('uriel_bg_url') || '';
    if (bannerType === 'none' && customBg) {
      bannerType = /\.(mp4|webm)($|\?)/i.test(customBg) ? 'video' : 'img';
      bannerSrc = customBg;
    }

    if (bannerType === 'none') {
      const thumb = getTrackThumbUrl(state.currentTrack);
      if (thumb) {
        bannerType = 'fallback';
        bannerSrc = thumb;
      }
    }
    setTvkAmbient(bannerType === 'fallback' || bannerType === 'none');

    const newKey = `${bannerType}:${bannerSrc}`;
    if (newKey === activeTvBannerKey) return;

    const layers = [layerA, layerB];
    const prevLayer = layers[activeTvLayerIdx];
    const nextIdx = 1 - activeTvLayerIdx;
    const nextLayer = layers[nextIdx];

    if (tvBannerTransitionTimer) {
      clearTimeout(tvBannerTransitionTimer);
      tvBannerTransitionTimer = null;
    }

    nextLayer.innerHTML = '';
    nextLayer.style.backgroundImage = '';
    nextLayer.classList.remove('fallback');

    let transitionDone = false;
    const activateNext = () => {
      if (transitionDone) return;
      transitionDone = true;
      nextLayer.classList.add('active');
      prevLayer.classList.remove('active');
      activeTvLayerIdx = nextIdx;
      activeTvBannerKey = newKey;

      tvBannerTransitionTimer = setTimeout(() => {
        prevLayer.innerHTML = '';
        prevLayer.style.backgroundImage = '';
        prevLayer.classList.remove('fallback');
        tvBannerTransitionTimer = null;
      }, 550);
    };

    if (bannerType === 'video') {
      const vid = document.createElement('video');
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.src = bannerSrc;
      vid.onloadeddata = () => {
        vid.play().catch(() => {});
        activateNext();
      };
      vid.onerror = () => activateNext();
      nextLayer.appendChild(vid);
    } else if (bannerType === 'img') {
      const img = document.createElement('img');
      img.onload = () => activateNext();
      img.onerror = () => activateNext();
      img.src = bannerSrc;
      nextLayer.appendChild(img);
    } else if (bannerType === 'bg') {
      nextLayer.style.backgroundImage = bannerSrc;
      activateNext();
    } else if (bannerType === 'fallback') {
      nextLayer.classList.add('fallback');
      const img = new Image();
      img.onload = () => {
        nextLayer.style.backgroundImage = `url("${bannerSrc}")`;
        activateNext();
      };
      img.onerror = () => {
        nextLayer.style.backgroundImage = `url("${bannerSrc}")`;
        activateNext();
      };
      img.src = bannerSrc;
    } else {
      activateNext();
    }
  }

  /** @param {boolean} [forcedNoLyrics] */

  function syncTvLayout(forcedNoLyrics) {
    const tv = el.tvKaraoke || document.getElementById('tv-karaoke');
    if (!tv) return;
    const panel = el.rightPanel || document.getElementById('right-panel');
    const noLyrics = typeof forcedNoLyrics === 'boolean'
      ? forcedNoLyrics
      : (panel ? panel.classList.contains('lyrics-empty') : (!state.syncedLyrics || state.syncedLyrics.length === 0));
    const wasNoLyrics = tv.classList.contains('tv-nolyrics');
    tv.classList.toggle('tv-nolyrics', !!noLyrics);
    if (wasNoLyrics !== !!noLyrics && typeof resizeCanvases === 'function') {
      requestAnimationFrame(resizeCanvases);
    }
  }

  let lastTvMetaTrackKey = '';
  function updateTvKaraokeMeta() {
    const curTrack = state.currentTrack;
    const trackKey = curTrack ? `${curTrack.id || ''}:${curTrack.title || ''}:${curTrack.artist || ''}` : '';
    const isNew = trackKey !== lastTvMetaTrackKey;
    lastTvMetaTrackKey = trackKey;

    const titleText = (curTrack && curTrack.title) || 'No song';
    const artistText = (curTrack && curTrack.artist) || '';

    if (el.tvKaraokeTitle) {
      if (isNew && el.tvKaraokeTitle.textContent !== titleText) {
        el.tvKaraokeTitle.style.opacity = '0';
        el.tvKaraokeTitle.style.transform = 'translateY(6px)';
        setTimeout(() => {
          el.tvKaraokeTitle.textContent = titleText;
          el.tvKaraokeTitle.style.opacity = '1';
          el.tvKaraokeTitle.style.transform = 'none';
        }, 120);
      } else {
        el.tvKaraokeTitle.textContent = titleText;
      }
    }
    if (el.tvKaraokeArtist) {
      if (isNew && el.tvKaraokeArtist.textContent !== artistText) {
        el.tvKaraokeArtist.style.opacity = '0';
        el.tvKaraokeArtist.style.transform = 'translateY(6px)';
        setTimeout(() => {
          el.tvKaraokeArtist.textContent = artistText;
          el.tvKaraokeArtist.style.opacity = '1';
          el.tvKaraokeArtist.style.transform = 'none';
        }, 120);
      } else {
        el.tvKaraokeArtist.textContent = artistText;
      }
    }

    const coverEl = /** @type {HTMLImageElement} */ (el.tvCover || document.getElementById('tv-cover'));
    if (coverEl) {
      const thumb = getTrackThumbUrl(curTrack);
      if (thumb) {
        if (coverEl.dataset.currentThumb !== thumb) {
          coverEl.dataset.currentThumb = thumb;
          const preImg = new Image();
          preImg.onload = () => {
            if (coverEl.dataset.currentThumb === thumb) {
              coverEl.style.opacity = '0';
              coverEl.style.transform = 'scale(0.96)';
              setTimeout(() => {
                coverEl.src = thumb;
                coverEl.style.display = 'block';
                coverEl.style.opacity = '1';
                coverEl.style.transform = 'scale(1)';
              }, 120);
            }
          };
          preImg.onerror = () => {
            // a slow failure for an earlier song mustn't replace the cover that is showing now
            if (coverEl.dataset.currentThumb !== thumb) return;
            coverEl.src = thumb;
            coverEl.style.display = 'block';
            coverEl.style.opacity = '1';
            coverEl.style.transform = 'scale(1)';
          };
          preImg.src = thumb;
        }
      } else {
        coverEl.dataset.currentThumb = '';
        coverEl.style.display = 'none';
        coverEl.src = '';
      }
    }
    syncTvBanner();
    syncTvLayout();
  }

  /** @type {ReturnType<typeof setInterval> | null} */
  let tvkOutputInterval = null;
  async function updateTvkOutput() {
    const nameEl = document.getElementById('tvk-output-name');
    const batteryEl = document.getElementById('tvk-battery');
    const batteryPctEl = document.getElementById('tvk-battery-pct');
    const batteryLevelEl = document.getElementById('tvk-battery-level');
    const outputContainer = document.getElementById('tvk-output');
    if (!nameEl) return;

    let deviceName = '';
    let batteryLevel = null;

    if (window.electronAPI && typeof window.electronAPI.getAudioOutputInfo === 'function') {
      try {
        const info = await window.electronAPI.getAudioOutputInfo();
        if (info && info.name && info.name !== 'Default output') {
          deviceName = info.name;
        }
        if (info && typeof info.battery === 'number') {
          batteryLevel = info.battery;
        }
      } catch (e) {}
    }

    if (!deviceName) {
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/audio-output-info`);
        if (res.ok) {
          const info = await res.json();
          if (info && info.name && info.name !== 'Default output') {
            deviceName = info.name;
          }
          if (info && typeof info.battery === 'number') {
            batteryLevel = info.battery;
          }
        }
      } catch (e) {}
    }

    if (!deviceName && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        const audioEl = el.nativeAudio || document.getElementById('native-audio');
        const sinkId = (audioEl && audioEl.sinkId) ? audioEl.sinkId : '';

        let matched = null;
        if (sinkId) {
          matched = audioOutputs.find(d => d.deviceId === sinkId);
        }
        if (!matched) {
          matched = audioOutputs.find(d => d.deviceId === 'default') || audioOutputs[0];
        }

        let label = matched && matched.label ? matched.label.trim() : '';
        label = label.replace(/^Default\s*[-–—:]\s*/i, '').trim();
        if (label && label.toLowerCase() !== 'default') {
          deviceName = label;
        }
      } catch (e) {}
    }

    const finalName = deviceName || T('Default output');
    nameEl.textContent = finalName;
    if (outputContainer) outputContainer.title = finalName;

    if (batteryEl && batteryPctEl && batteryLevelEl) {
      if (batteryLevel !== null && !isNaN(batteryLevel) && batteryLevel >= 0) {
        const clampedPct = Math.max(0, Math.min(100, Math.round(batteryLevel)));
        batteryPctEl.textContent = `${clampedPct}%`;
        const fillH = Math.max(clampedPct > 0 ? 1 : 0, Math.min(12, Math.round(12 * (clampedPct / 100))));
        const fillY = 19 - fillH;
        batteryLevelEl.setAttribute('y', String(fillY));
        batteryLevelEl.setAttribute('height', String(fillH));
        batteryLevelEl.setAttribute('x', '8');
        batteryLevelEl.setAttribute('width', '8');
        batteryEl.classList.remove('hidden');
        batteryEl.classList.toggle('battery-low', clampedPct <= 20);
        batteryEl.title = Tf('Battery level: {0}%', clampedPct);
      } else {
        batteryEl.classList.add('hidden');
      }
    }
  }

  function openTvKaraoke() {
    if (!el.tvKaraoke || !el.lyricsContainer) return;
    if (state.isTvKaraokeOpen) return;
    state.isTvKaraokeOpen = true;
    if (!viz.animationFrameId) { viz.hasDrawnPausedFrame = false; startVisualizers(); }

    lyricsContainerParent = el.lyricsContainer.parentElement;
    lyricsContainerSibling = el.lyricsContainer.nextSibling;

    if (el.tvKaraokeContent) {
      el.tvKaraokeContent.appendChild(el.lyricsContainer);
    }
    if (el.lyricsContainer) {
      el.lyricsContainer.style.paddingTop = '';
      el.lyricsContainer.style.paddingBottom = '';
      el.lyricsContainer.scrollTop = 0;
    }
    updateTvKaraokeMeta();
    syncTvBanner();
    syncTvLayout();
    el.tvKaraoke.classList.remove('hidden');
    syncTvkAmbientPlayback();
    applyTvk();
    syncTvkUI();
    resetTvIdleTimer();
    resizeCanvases();
    if (state.isPlaying) {
      if (audioEngine && audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(true);
      startVisualizers();
    }

    cancelAnimationFrame(lyricsScrollRaf);
    renderLyricsView();
    const syncTvLyrics = () => {
      updateLyricsPadding();
      state.forceSnapLyrics = true;
      state.forceLyricsScroll = true;
      state.lastActiveLyricIdx = -1;
      if (el.nativeAudio) {
        const cur = el.nativeAudio.currentTime || 0;
        const dur = el.nativeAudio.duration || (state.currentTrack ? state.currentTrack.duration : 0);
        updateSyncedLyricsHighlight(cur);
        syncTvkProgress(cur, dur);
      }
    };
    syncTvLyrics();
    requestAnimationFrame(syncTvLyrics);
    setTimeout(syncTvLyrics, 50);
    setTimeout(syncTvLyrics, 150);
    const isTvPlaying = !!(state.isPlaying && el.nativeAudio && !el.nativeAudio.paused);
    updatePlayPauseButton(isTvPlaying, state.isBuffering);
    setPlayPauseState(isTvPlaying, false);
    updateTvkOutput();
    if (tvkOutputInterval) clearInterval(tvkOutputInterval);
    tvkOutputInterval = setInterval(updateTvkOutput, 8000);
  }

  function closeTvKaraoke() {
    if (!state.isTvKaraokeOpen || !el.tvKaraoke) return;
    state.isTvKaraokeOpen = false;
    if (tvIdleTimer) clearTimeout(tvIdleTimer);
    if (tvkOutputInterval) {
      clearInterval(tvkOutputInterval);
      tvkOutputInterval = null;
    }
    const tvkPanel = document.getElementById('tvk-panel');
    if (tvkPanel) {
      tvkPanel.classList.remove('open');
      const btnSettings = document.getElementById('btn-tvk-settings');
      if (btnSettings) btnSettings.classList.remove('open');
    }
    el.tvKaraoke.classList.remove('tv-idle');
    el.tvKaraoke.classList.add('hidden');
    syncTvkAmbientPlayback();

    const targetParent = (lyricsContainerParent && lyricsContainerParent.isConnected)
      ? lyricsContainerParent
      : (document.querySelector('.lyrics-section') || (el.rightPanel && el.rightPanel.querySelector('.lyrics-section')));
    if (targetParent && el.lyricsContainer) {
      if (lyricsContainerSibling && lyricsContainerSibling.parentNode === targetParent) {
        targetParent.insertBefore(el.lyricsContainer, lyricsContainerSibling);
      } else {
        targetParent.appendChild(el.lyricsContainer);
      }
    }
    if (el.lyricsContainer) {
      el.lyricsContainer.style.paddingTop = '';
      el.lyricsContainer.style.paddingBottom = '';
      el.lyricsContainer.scrollTop = 0;
    }

    cancelAnimationFrame(lyricsScrollRaf);
    renderLyricsView();
    const syncSidebarLyrics = () => {
      updateLyricsPadding();
      state.forceSnapLyrics = true;
      state.forceLyricsScroll = true;
      state.lastActiveLyricIdx = -1;
      if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
    };
    syncSidebarLyrics();
    requestAnimationFrame(syncSidebarLyrics);
    setTimeout(syncSidebarLyrics, 50);
    setTimeout(syncSidebarLyrics, 150);
    setTimeout(syncSidebarLyrics, 300);
  }

  window.openTvKaraoke = openTvKaraoke;
  window.closeTvKaraoke = closeTvKaraoke;

  if (el.btnTvKaraoke) {
    el.btnTvKaraoke.addEventListener('click', openTvKaraoke);
  }
  if (el.tvKaraokeClose) {
    el.tvKaraokeClose.addEventListener('click', closeTvKaraoke);
  }
  if (el.tvKaraoke) {
    el.tvKaraoke.addEventListener('mousemove', resetTvIdleTimer);
  }

  const btnTvkPrev = document.getElementById('btn-tvk-prev');
  const btnTvkPlay = document.getElementById('btn-tvk-play');
  const btnTvkNext = document.getElementById('btn-tvk-next');
  if (btnTvkPrev) btnTvkPrev.addEventListener('click', () => playPrev());
  if (btnTvkNext) btnTvkNext.addEventListener('click', () => playNext());
  if (btnTvkPlay) btnTvkPlay.addEventListener('click', () => togglePlayPause());
  if (el.btnTvkFav) el.btnTvkFav.addEventListener('click', () => {
    if (state.currentTrack) toggleFavoriteTrack(state.currentTrack);
  });

  // ---- Settings > Tracks > Output device (from Riff 43.1; computers) ----
  // The song plays through the Web Audio graph when it is set up and through the <audio> element before that,
  // so both get the device. A device that disappears while it plays (headphones unplugged) pauses the song
  // instead of letting it go on from the speakers.
  const OUTPUT_DEVICE_KEY = 'uriel_audio_output_device';
  const canPickOutput = !isPhoneApp && !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) && !!el.nativeAudio && typeof el.nativeAudio.setSinkId === 'function';
  let outputDeviceId = (() => { try { return localStorage.getItem(OUTPUT_DEVICE_KEY) || ''; } catch (e) { return ''; } })();
  /** @type {Set<string> | null} */
  let knownOutputIds = null;
  async function applyOutputDevice() {
    if (!canPickOutput) return;
    const id = outputDeviceId === 'default' ? '' : outputDeviceId;
    try { if (el.nativeAudio.sinkId !== id) await el.nativeAudio.setSinkId(id); } catch (e) { console.warn('Output device:', e instanceof Error ? e.message : e); }
    const ctx = audioEngine && audioEngine.ctx;
    try { if (ctx && typeof ctx.setSinkId === 'function' && (ctx.sinkId || '') !== id) await ctx.setSinkId(id); } catch (e) {}
  }
  async function listOutputDevices() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput'); } catch (e) { return []; }
  }
  async function renderOutputDevices() {
    const menu = document.getElementById('audio-output-menu');
    const label = document.getElementById('audio-output-label');
    if (!canPickOutput || !menu) return;
    const devices = (await listOutputDevices()).filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
    knownOutputIds = new Set(devices.map((d) => d.deviceId));
    menu.textContent = '';
    const add = (/** @type {string} */ value, /** @type {string} */ text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm3-dropdown-option' + ((outputDeviceId || '') === value ? ' selected' : '');
      b.dataset.value = value;
      b.textContent = text;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        outputDeviceId = value;
        try { if (value) localStorage.setItem(OUTPUT_DEVICE_KEY, value); else localStorage.removeItem(OUTPUT_DEVICE_KEY); } catch (_) {}
        document.getElementById('audio-output-dropdown')?.classList.remove('open');
        renderOutputDevices();
        applyOutputDevice().then(() => updateTvkOutput());
      });
      menu.appendChild(b);
      if ((outputDeviceId || '') === value && label) label.textContent = text;
    };
    add('', T('System default'));
    devices.forEach((d, i) => add(d.deviceId, (d.label || '').replace(/^Default\s*[-–—:]\s*/i, '').trim() || Tf('Output {0}', i + 1)));
    // the saved device is not connected now: shown as itself, played on the system default until it is back
    if (outputDeviceId && !knownOutputIds.has(outputDeviceId)) add(outputDeviceId, T('Saved device (not connected)'));
  }
  if (canPickOutput) {
    const row = document.getElementById('setting-audio-output-row');
    if (row) row.hidden = false;
    const dd = document.getElementById('audio-output-dropdown');
    const trigger = document.getElementById('audio-output-trigger');
    if (dd && trigger) {
      trigger.addEventListener('click', (e) => { e.stopPropagation(); renderOutputDevices(); dd.classList.toggle('open'); });
      document.addEventListener('click', () => dd.classList.remove('open'));
    }
    renderOutputDevices();
    if (outputDeviceId) applyOutputDevice();
    // the Web Audio graph is made on the first play: it gets the device then
    el.nativeAudio.addEventListener('playing', () => { if (outputDeviceId) applyOutputDevice(); });
  }

  // Following the system's output, headphones going away must pause too, not carry on out loud from the speakers (#32).
  // On Windows and macOS the "default" entry shares a groupId with the real device it stands for. On Linux its groupId
  // is just "default", so which device was in use is unknown and any device going away pauses: pausing needlessly when
  // another device is unplugged beats suddenly playing out loud.
  /** @type {MediaDeviceInfo[] | null} */
  let lastOutputs = null;
  if (canPickOutput) listOutputDevices().then((list) => { lastOutputs = list; });
  function defaultOutputLost(/** @type {MediaDeviceInfo[] | null} */ before, /** @type {MediaDeviceInfo[]} */ after) {
    if (!before) return false;
    const realOf = (/** @type {MediaDeviceInfo[]} */ list) => list.filter((/** @type {MediaDeviceInfo} */ d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
    const was = realOf(before);
    const now = realOf(after);
    const def = before.find((/** @type {MediaDeviceInfo} */ d) => d.deviceId === 'default');
    const group = def && def.groupId;
    if (group && was.some((/** @type {MediaDeviceInfo} */ d) => d.groupId === group)) return !now.some((/** @type {MediaDeviceInfo} */ d) => d.groupId === group);
    return was.some((/** @type {MediaDeviceInfo} */ d) => !now.some((/** @type {MediaDeviceInfo} */ n) => n.deviceId === d.deviceId));
  }
  if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      updateTvkOutput();
      if (!canPickOutput) return;
      const before = knownOutputIds;
      const outputs = await listOutputDevices();
      const now = new Set(outputs.map((d) => d.deviceId).filter((id) => id && id !== 'default' && id !== 'communications'));
      const lostChosen = !!outputDeviceId && !!before && before.has(outputDeviceId) && !now.has(outputDeviceId);
      const lostDefault = !outputDeviceId && defaultOutputLost(lastOutputs, outputs);
      lastOutputs = outputs;
      if (state.isPlaying && (lostChosen || lostDefault) && el.nativeAudio && !el.nativeAudio.paused) {
        el.nativeAudio.pause();
        showToast(Tm('Paused: the output device was disconnected'), 'info');
      }
      renderOutputDevices();
      if (outputDeviceId && now.has(outputDeviceId)) applyOutputDevice();
    });
  }

  const TVK_DEFAULTS = {
    font: 'inherit',
    align: 'center',
    size: 100,
    weight: 700,
    gap: 16,
    anim: 'slide',
    speed: 900
  };

  /** @type {Record<string, string>} */
  const TVK_FONTS = {
    'default': 'inherit',
    'inherit': 'inherit',
    'sf': SF_FONT_STACK,
    'SF Pro': SF_FONT_STACK,
    [SF_FONT_STACK]: SF_FONT_STACK,
    'serif': "Georgia, 'Times New Roman', serif",
    "Georgia, 'Times New Roman', serif": "Georgia, 'Times New Roman', serif",
    'rounded': "ui-rounded, 'Nunito', system-ui, sans-serif",
    "ui-rounded, 'Nunito', system-ui, sans-serif": "ui-rounded, 'Nunito', system-ui, sans-serif",
    'mono': "ui-monospace, 'JetBrains Mono', monospace",
    "ui-monospace, 'JetBrains Mono', monospace": "ui-monospace, 'JetBrains Mono', monospace",
    'condensed': "'Arial Narrow', 'Roboto Condensed', sans-serif",
    "'Arial Narrow', 'Roboto Condensed', sans-serif": "'Arial Narrow', 'Roboto Condensed', sans-serif"
  };

  function getTvk() {
    try {
      const raw = localStorage.getItem('uriel_tvk');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          font: parsed.font || TVK_DEFAULTS.font,
          align: ['left', 'center', 'right'].includes(parsed.align) ? parsed.align : TVK_DEFAULTS.align,
          size: Number(parsed.size) || TVK_DEFAULTS.size,
          weight: Number(parsed.weight) || TVK_DEFAULTS.weight,
          gap: (parsed.gap !== undefined && !isNaN(Number(parsed.gap))) ? Number(parsed.gap) : TVK_DEFAULTS.gap,
          anim: parsed.anim || TVK_DEFAULTS.anim,
          speed: Number(parsed.speed) || TVK_DEFAULTS.speed
        };
      }
    } catch (_) {}
    return { ...TVK_DEFAULTS };
  }

  function saveTvk(/** @type {Record<string, unknown>} */ settings) {
    try {
      localStorage.setItem('uriel_tvk', JSON.stringify(settings));
    } catch (_) {}
  }

  function updateTvkVisualizerSetting(/** @type {boolean | string} */ enabled) {
    const on = enabled !== false && enabled !== 'false';
    localStorage.setItem('uriel_tvk_visualizer', on ? 'true' : 'false');
    const tv = document.getElementById('tv-karaoke');
    if (tv) {
      tv.classList.toggle('no-tvk-visualizer', !on);
    }
    const btnTvkVis = document.getElementById('btn-tvk-visualizer');
    if (btnTvkVis) btnTvkVis.classList.toggle('active', on);
    const btnTvkVisSetting = document.getElementById('btn-tvk-visualizer-setting');
    if (btnTvkVisSetting) btnTvkVisSetting.classList.toggle('active', on);
    if (on && state.isPlaying) {
      if (audioEngine && audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(true);
      startVisualizers();
    }
  }

  function updateTvkVisualizerLyricsSetting(/** @type {boolean | string} */ enabled) {
    const on = enabled === true || enabled === 'true';
    localStorage.setItem('uriel_tvk_visualizer_lyrics', on ? 'true' : 'false');
    const tv = document.getElementById('tv-karaoke');
    if (tv) {
      tv.classList.toggle('tvk-show-lyrics-visualizer', on);
    }
    const btnTvkVisLyrics = document.getElementById('btn-tvk-visualizer-lyrics');
    if (btnTvkVisLyrics) btnTvkVisLyrics.classList.toggle('active', on);
    const btnTvkVisLyricsSetting = document.getElementById('btn-tvk-visualizer-lyrics-setting');
    if (btnTvkVisLyricsSetting) btnTvkVisLyricsSetting.classList.toggle('active', on);
    if (on && state.isPlaying) {
      if (audioEngine && audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(true);
      startVisualizers();
    }
  }

  function updateTvkVisualizerOpacity(/** @type {string | number} */ opacityVal) {
    let val = parseInt(String(opacityVal), 10);
    if (isNaN(val)) val = 85;
    val = Math.max(10, Math.min(100, val));
    localStorage.setItem('uriel_tvk_visualizer_opacity', val.toString());

    const norm = (val / 100).toFixed(2);
    const tv = document.getElementById('tv-karaoke');
    if (tv) {
      tv.style.setProperty('--tvk-vis-opacity', norm);
    }

    const sliderPanel = /** @type {HTMLInputElement} */ (document.getElementById('tvk-vis-opacity'));
    if (sliderPanel && parseInt(sliderPanel.value, 10) !== val) sliderPanel.value = String(val);
    const valPanel = document.getElementById('val-tvk-vis-opacity');
    if (valPanel) valPanel.textContent = `${val}%`;

    const sliderSetting = /** @type {HTMLInputElement} */ (document.getElementById('slider-tvk-vis-opacity-setting'));
    if (sliderSetting && parseInt(sliderSetting.value, 10) !== val) sliderSetting.value = String(val);
    const valSetting = document.getElementById('val-tvk-vis-opacity-setting');
    if (valSetting) valSetting.textContent = `${val}%`;
  }

  function applyTvk() {
    const tv = document.getElementById('tv-karaoke');
    if (!tv) return;
    const s = getTvk();
    const font = TVK_FONTS[s.font] || s.font || 'inherit';
    if (s.font === 'sf' || font.includes('SF Pro')) {
      ensureSfFontLoaded();
    }
    const align = ['left', 'center', 'right'].includes(s.align) ? s.align : 'center';
    const scale = (Number(s.size) || 100) / 100;
    const weight = Number(s.weight) || 700;
    const gap = (s.gap !== undefined && !isNaN(Number(s.gap))) ? Number(s.gap) : 16;
    const speed = Number(s.speed) || 900;
    const anim = ['smooth', 'slide', 'fade', 'pop', 'none'].includes(s.anim) ? s.anim : 'slide';

    tv.style.setProperty('--tvk-font', font);
    tv.style.setProperty('--tvk-scale', String(scale));
    tv.style.setProperty('--tvk-weight', String(weight));
    tv.style.setProperty('--tvk-gap', `${gap}px`);
    tv.style.setProperty('--tvk-speed', `${speed}ms`);
    tv.setAttribute('data-tvk-anim', anim);
    tv.setAttribute('data-tvk-align', align);

    const tvkVisOn = localStorage.getItem('uriel_tvk_visualizer') !== 'false';
    tv.classList.toggle('no-tvk-visualizer', !tvkVisOn);
    const tvkVisLyricsOn = localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true';
    tv.classList.toggle('tvk-show-lyrics-visualizer', tvkVisLyricsOn);
    const visOpacity = parseInt(localStorage.getItem('uriel_tvk_visualizer_opacity') || '85', 10);
    tv.style.setProperty('--tvk-vis-opacity', (Math.max(10, Math.min(100, visOpacity)) / 100).toFixed(2));
  }

  function syncTvkUI() {
    const s = getTvk();
    const selFont = /** @type {HTMLSelectElement} */ (document.getElementById('tvk-font'));
    const sliderSize = /** @type {HTMLInputElement} */ (document.getElementById('tvk-size'));
    const sliderWeight = /** @type {HTMLInputElement} */ (document.getElementById('tvk-weight'));
    const sliderGap = /** @type {HTMLInputElement} */ (document.getElementById('tvk-gap'));
    const selAnim = /** @type {HTMLSelectElement} */ (document.getElementById('tvk-anim'));
    const sliderSpeed = /** @type {HTMLInputElement} */ (document.getElementById('tvk-speed'));

    const valSize = document.getElementById('val-tvk-size');
    const valWeight = document.getElementById('val-tvk-weight');
    const valGap = document.getElementById('val-tvk-gap');
    const valSpeed = document.getElementById('val-tvk-speed');

    const fontVal = TVK_FONTS[s.font] || s.font;
    if (selFont) {
      selFont.value = fontVal;
      if (!selFont.value) selFont.value = s.font;
    }
    const fontLabel = document.getElementById('tvk-font-label');
    const fontMenu = document.getElementById('tvk-font-menu');
    if (fontMenu) {
      const options = /** @type {NodeListOf<HTMLElement>} */ (fontMenu.querySelectorAll('.m3-dropdown-option'));
      let matched = false;
      options.forEach((opt) => {
        const isMatch = opt.dataset.value === s.font || opt.dataset.value === fontVal;
        opt.classList.toggle('selected', isMatch);
        if (isMatch) {
          if (fontLabel) fontLabel.textContent = opt.textContent;
          matched = true;
        }
      });
      if (!matched && fontLabel) fontLabel.textContent = 'Default';
    }

    const alignGroup = document.getElementById('tvk-align-group');
    if (alignGroup) {
      /** @type {NodeListOf<HTMLElement>} */ (alignGroup.querySelectorAll('.tvk-pill-btn')).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === s.align);
      });
    }

    const animGroup = document.getElementById('tvk-anim-group');
    if (animGroup) {
      /** @type {NodeListOf<HTMLElement>} */ (animGroup.querySelectorAll('.tvk-pill-btn')).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === s.anim);
      });
    }
    if (selAnim) selAnim.value = s.anim;

    if (sliderSize) sliderSize.value = String(s.size);
    if (sliderWeight) sliderWeight.value = String(s.weight);
    if (sliderGap) sliderGap.value = String(s.gap);
    if (sliderSpeed) sliderSpeed.value = String(s.speed);

    if (valSize) valSize.textContent = `${s.size}%`;
    if (valWeight) valWeight.textContent = `${s.weight}`;
    if (valGap) valGap.textContent = `${s.gap}px`;
    if (valSpeed) valSpeed.textContent = `${s.speed}ms`;

    const tvkVisOn = localStorage.getItem('uriel_tvk_visualizer') !== 'false';
    const btnTvkVis = document.getElementById('btn-tvk-visualizer');
    if (btnTvkVis) btnTvkVis.classList.toggle('active', tvkVisOn);
    const btnTvkVisSetting = document.getElementById('btn-tvk-visualizer-setting');
    if (btnTvkVisSetting) btnTvkVisSetting.classList.toggle('active', tvkVisOn);

    const tvkVisLyricsOn = localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true';
    const btnTvkVisLyrics = document.getElementById('btn-tvk-visualizer-lyrics');
    if (btnTvkVisLyrics) btnTvkVisLyrics.classList.toggle('active', tvkVisLyricsOn);
    const btnTvkVisLyricsSetting = document.getElementById('btn-tvk-visualizer-lyrics-setting');
    if (btnTvkVisLyricsSetting) btnTvkVisLyricsSetting.classList.toggle('active', tvkVisLyricsOn);

    const visOpacity = parseInt(localStorage.getItem('uriel_tvk_visualizer_opacity') || '85', 10);
    const sliderTvkVisOpacity = /** @type {HTMLInputElement} */ (document.getElementById('tvk-vis-opacity'));
    if (sliderTvkVisOpacity) sliderTvkVisOpacity.value = String(visOpacity);
    const valTvkVisOpacity = document.getElementById('val-tvk-vis-opacity');
    if (valTvkVisOpacity) valTvkVisOpacity.textContent = `${visOpacity}%`;

    const sliderTvkVisOpacitySetting = /** @type {HTMLInputElement} */ (document.getElementById('slider-tvk-vis-opacity-setting'));
    if (sliderTvkVisOpacitySetting) sliderTvkVisOpacitySetting.value = String(visOpacity);
    const valTvkVisOpacitySetting = document.getElementById('val-tvk-vis-opacity-setting');
    if (valTvkVisOpacitySetting) valTvkVisOpacitySetting.textContent = `${visOpacity}%`;
  }

  function initTvk() {
    applyTvk();
    syncTvkUI();

    const btnSettings = document.getElementById('btn-tvk-settings');
    const panel = document.getElementById('tvk-panel');
    const btnReset = document.getElementById('btn-tvk-reset');

    const selFont = /** @type {HTMLSelectElement} */ (document.getElementById('tvk-font'));
    const fontDropdown = document.getElementById('tvk-font-dropdown');
    const fontTrigger = document.getElementById('tvk-font-trigger');
    const fontMenu = document.getElementById('tvk-font-menu');

    const alignGroup = document.getElementById('tvk-align-group');
    const animGroup = document.getElementById('tvk-anim-group');

    const sliderSize = /** @type {HTMLInputElement} */ (document.getElementById('tvk-size'));
    const sliderWeight = /** @type {HTMLInputElement} */ (document.getElementById('tvk-weight'));
    const sliderGap = /** @type {HTMLInputElement} */ (document.getElementById('tvk-gap'));
    const selAnim = /** @type {HTMLSelectElement} */ (document.getElementById('tvk-anim'));
    const sliderSpeed = /** @type {HTMLInputElement} */ (document.getElementById('tvk-speed'));

    const valSize = document.getElementById('val-tvk-size');
    const valWeight = document.getElementById('val-tvk-weight');
    const valGap = document.getElementById('val-tvk-gap');
    const valSpeed = document.getElementById('val-tvk-speed');

    if (btnSettings && panel) {
      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel.classList.contains('open');
        if (!isOpen) {
          panel.classList.add('open');
          btnSettings.classList.add('open');
          if (el.tvKaraoke) el.tvKaraoke.classList.remove('tv-idle');
          if (tvIdleTimer) clearTimeout(tvIdleTimer);
        } else {
          panel.classList.remove('open');
          btnSettings.classList.remove('open');
          if (fontDropdown) fontDropdown.classList.remove('open');
          resetTvIdleTimer();
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (!panel || !panel.classList.contains('open')) return;
      if (!panel.contains(/** @type {Node} */ (e.target)) && (!btnSettings || !btnSettings.contains(/** @type {Node} */ (e.target)))) {
        panel.classList.remove('open');
        if (btnSettings) btnSettings.classList.remove('open');
        if (fontDropdown) fontDropdown.classList.remove('open');
        resetTvIdleTimer();
      }
    });

    if (fontTrigger && fontDropdown) {
      fontTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        fontDropdown.classList.toggle('open');
      });
    }

    if (fontMenu) {
      /** @type {NodeListOf<HTMLElement>} */ (fontMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.dataset.value || '';
          if (selFont) selFont.value = val;
          const current = getTvk();
          current.font = val;
          saveTvk(current);
          applyTvk();
          syncTvkUI();
          if (fontDropdown) fontDropdown.classList.remove('open');
        });
      });
    }

    if (alignGroup) {
      /** @type {NodeListOf<HTMLElement>} */ (alignGroup.querySelectorAll('.tvk-pill-btn')).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = btn.dataset.value || '';
          const current = getTvk();
          current.align = val;
          saveTvk(current);
          applyTvk();
          syncTvkUI();
        });
      });
    }

    if (animGroup) {
      /** @type {NodeListOf<HTMLElement>} */ (animGroup.querySelectorAll('.tvk-pill-btn')).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = btn.dataset.value || '';
          if (selAnim) selAnim.value = val;
          const current = getTvk();
          current.anim = val;
          saveTvk(current);
          applyTvk();
          syncTvkUI();
        });
      });
    }

    const onTvkInput = () => {
      const current = getTvk();
      const tvk = {
        font: (selFont && selFont.value) || current.font || 'inherit',
        align: current.align || 'center',
        size: Number(sliderSize && sliderSize.value) || 100,
        weight: Number(sliderWeight && sliderWeight.value) || 700,
        gap: (sliderGap && sliderGap.value !== undefined) ? Number(sliderGap.value) : 16,
        anim: (selAnim && selAnim.value) || current.anim || 'smooth',
        speed: Number(sliderSpeed && sliderSpeed.value) || 350
      };
      saveTvk(tvk);
      applyTvk();
      if (valSize) valSize.textContent = `${tvk.size}%`;
      if (valWeight) valWeight.textContent = `${tvk.weight}`;
      if (valGap) valGap.textContent = `${tvk.gap}px`;
      if (valSpeed) valSpeed.textContent = `${tvk.speed}ms`;
    };

    [selFont, sliderSize, sliderWeight, sliderGap, selAnim, sliderSpeed].forEach(input => {
      if (!input) return;
      input.addEventListener('input', onTvkInput);
      input.addEventListener('change', onTvkInput);
    });

    const btnTvkVis = document.getElementById('btn-tvk-visualizer');
    if (btnTvkVis) {
      btnTvkVis.addEventListener('click', () => {
        const cur = localStorage.getItem('uriel_tvk_visualizer') !== 'false';
        updateTvkVisualizerSetting(!cur);
      });
    }
    const btnTvkVisSetting = document.getElementById('btn-tvk-visualizer-setting');
    if (btnTvkVisSetting) {
      btnTvkVisSetting.addEventListener('click', () => {
        const cur = localStorage.getItem('uriel_tvk_visualizer') !== 'false';
        updateTvkVisualizerSetting(!cur);
      });
    }

    const btnTvkVisLyrics = document.getElementById('btn-tvk-visualizer-lyrics');
    if (btnTvkVisLyrics) {
      btnTvkVisLyrics.addEventListener('click', () => {
        const cur = localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true';
        updateTvkVisualizerLyricsSetting(!cur);
      });
    }
    const btnTvkVisLyricsSetting = document.getElementById('btn-tvk-visualizer-lyrics-setting');
    if (btnTvkVisLyricsSetting) {
      btnTvkVisLyricsSetting.addEventListener('click', () => {
        const cur = localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true';
        updateTvkVisualizerLyricsSetting(!cur);
      });
    }

    const sliderTvkVisOpacity = document.getElementById('tvk-vis-opacity');
    if (sliderTvkVisOpacity) {
      const onOpInput = (/** @type {Event} */ e) => {
        updateTvkVisualizerOpacity(/** @type {HTMLInputElement} */ (e.target).value);
      };
      sliderTvkVisOpacity.addEventListener('input', onOpInput);
      sliderTvkVisOpacity.addEventListener('change', onOpInput);
    }
    const sliderTvkVisOpacitySetting = document.getElementById('slider-tvk-vis-opacity-setting');
    if (sliderTvkVisOpacitySetting) {
      const onOpInput = (/** @type {Event} */ e) => {
        updateTvkVisualizerOpacity(/** @type {HTMLInputElement} */ (e.target).value);
      };
      sliderTvkVisOpacitySetting.addEventListener('input', onOpInput);
      sliderTvkVisOpacitySetting.addEventListener('change', onOpInput);
    }

    const sliderVizSmooth = /** @type {HTMLInputElement} */ (document.getElementById('slider-viz-smooth'));
    const valVizSmooth = document.getElementById('val-viz-smooth');
    if (sliderVizSmooth) {
      const saved = localStorage.getItem('uriel_viz_smooth');
      if (saved !== null) sliderVizSmooth.value = saved;
      if (valVizSmooth) valVizSmooth.textContent = `${sliderVizSmooth.value}%`;
      const onSmoothInput = (/** @type {Event} */ e) => {
        const v = /** @type {HTMLInputElement} */ (e.target).value;
        if (valVizSmooth) valVizSmooth.textContent = `${v}%`;
        localStorage.setItem('uriel_viz_smooth', v);
      };
      sliderVizSmooth.addEventListener('input', onSmoothInput);
      sliderVizSmooth.addEventListener('change', onSmoothInput);
    }

    const sliderVizSens = /** @type {HTMLInputElement} */ (document.getElementById('slider-viz-sens'));
    const valVizSens = document.getElementById('val-viz-sens');
    if (sliderVizSens) {
      const saved = localStorage.getItem('uriel_viz_sens');
      if (saved !== null) sliderVizSens.value = saved;
      if (valVizSens) valVizSens.textContent = `${sliderVizSens.value}%`;
      const onSensInput = (/** @type {Event} */ e) => {
        const v = /** @type {HTMLInputElement} */ (e.target).value;
        if (valVizSens) valVizSens.textContent = `${v}%`;
        localStorage.setItem('uriel_viz_sens', v);
      };
      sliderVizSens.addEventListener('input', onSensInput);
      sliderVizSens.addEventListener('change', onSensInput);
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        saveTvk(TVK_DEFAULTS);
        updateTvkVisualizerSetting(true);
        updateTvkVisualizerLyricsSetting(false);
        updateTvkVisualizerOpacity(85);
        applyTvk();
        syncTvkUI();
      });
    }
  }

  // ---- your own lyrics and timing them (app/lyricsEditor.js) ----
  const lyricsEditorPart = /** @type {UrielLyricsEditorPart} */ ({});
  function handleSyncLineClick(/** @type {number} */ idx) { return lyricsEditorPart.handleSyncLineClick(idx); }
  window.UrielApp.lyricsEditor({ animateLyricsScroll, closeModal, el, loadSyncedLyrics, openModal, playSmooth, showToast, state, Tm }, lyricsEditorPart);
  const syncState = lyricsEditorPart.syncState;

  let smoothFadeToken = 0;
  let isAppClosing = false;
  window.addEventListener('beforeunload', () => { isAppClosing = true; });

  function pauseSmooth() {
    const curToken = ++smoothFadeToken;
    state.isPlaying = false;
    // a pause someone asked for: not undone when another app's sound ends (mobile/audio-interruption.ts)
    state.pausedByUser = true;
    setTrackLoading(false);
    updatePlayPauseButton(false, false);
    document.body.classList.remove('is-playing');
    if (el.coverContainer) el.coverContainer.classList.remove('spinning');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
    sendStateToServer();
    updateMediaSession();
    // a pause during a crossfade holds the old song's tail too (the fade follows its time, so it resumes in place)
    dropCrossfadePrep();
    pauseCrossfadeTail();

    const audio = el.nativeAudio;
    if (isAppClosing || !audio || audio.paused) {
      if (audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
        try {
          audioEngine.fadeGain.gain.cancelScheduledValues(audioEngine.ctx.currentTime);
          audioEngine.fadeGain.gain.setValueAtTime(0, audioEngine.ctx.currentTime);
        } catch (e) {}
      }
      if (audio) {
        try { audio.pause(); } catch (e) {}
      }
      if (state.secondaryAudio) {
        try { state.secondaryAudio.pause(); } catch (e) {}
      }
      if (audioEngine && audioEngine.flushEffects) {
        audioEngine.flushEffects();
      }
      return;
    }

    if (audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
      try {
        const ct = audioEngine.ctx.currentTime;
        audioEngine.fadeGain.gain.cancelScheduledValues(ct);
        audioEngine.fadeGain.gain.setTargetAtTime(0, ct, 0.06);
      } catch (e) {}
    }

    setTimeout(() => {
      if (curToken !== smoothFadeToken) return;
      if (audio) {
        try { audio.pause(); } catch (e) {}
      }
      if (state.secondaryAudio) {
        try { state.secondaryAudio.pause(); } catch (e) {}
      }
      if (audioEngine && audioEngine.flushEffects) {
        audioEngine.flushEffects();
      }
    }, 280);
  }

  async function playSmooth() {
    const curToken = ++smoothFadeToken;
    state.isPlaying = true;
    state.pausedByUser = false;
    document.body.classList.add('is-playing');
    updatePlayPauseButton(true, false);
    if (el.coverContainer && state.vfx.vinylSpin) el.coverContainer.classList.add('spinning');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    sendStateToServer();
    updateMediaSession();

    resumeCrossfadeTail();
    initAudioContext();
    if (audioEngine && audioEngine.ctx && audioEngine.needsResume()) {
      // in a backgrounded WebView resume() can hang until the app is opened; don't let it hold play() back (#24).
      // The 'play' / 'playing' handlers ask the context to resume again.
      await Promise.race([audioEngine.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
    }
    if (curToken !== smoothFadeToken) return;

    if (playback.crossfadeFadeInPending) {
      if (audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
        try {
          audioEngine.fadeGain.gain.cancelScheduledValues(audioEngine.ctx.currentTime);
          audioEngine.fadeGain.gain.setValueAtTime(1, audioEngine.ctx.currentTime);
        } catch (e) {}
      }
    } else {
      if (audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
        try {
          const ct = audioEngine.ctx.currentTime;
          audioEngine.fadeGain.gain.cancelScheduledValues(ct);
          audioEngine.fadeGain.gain.setValueAtTime(0, ct);
        } catch (e) {}
      }
    }

    if (el.nativeAudio) {
      const loadTok = state.loadToken;
      const playSrc = el.nativeAudio.currentSrc || el.nativeAudio.src;
      el.nativeAudio.play().catch((/** @type {unknown} */ e) => {
        // "[object DOMException]" told nobody anything (#17): say which one, and what the element was doing
        logPlaybackIssue('Play error', e);
        // AbortError: our own pause() or a newer src/load() interrupted this play(), not a failure
        if (e instanceof Error && e.name === 'AbortError') return;
        // a newer song (or a newer play/pause) took over meanwhile
        if (loadTok !== state.loadToken || curToken !== smoothFadeToken) return;
        if ((el.nativeAudio.currentSrc || el.nativeAudio.src) !== playSrc && !hlsInstance) return;
        // a media error also fires the element's 'error' event, which retries / tells the listener itself
        if (el.nativeAudio.error) return;
        if (!el.nativeAudio.paused) return;
        // anything else (NotAllowedError, NotSupportedError without a media error): look it up afresh once
        if (retryFresh(loadTok, state.currentTrack)) return;
        // a refused play() (no gesture yet, source gone) left the button showing pause on a silent player.
        state.isPlaying = false;
        setTrackLoading(false);
        document.body.classList.remove('is-playing');
        updatePlayPauseButton(false, false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      });
    }

    if (!playback.crossfadeFadeInPending && audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
      try {
        const ct = audioEngine.ctx.currentTime;
        audioEngine.fadeGain.gain.setTargetAtTime(1, ct, 0.05);
      } catch (e) {}
    }
  }

  window.pauseSmooth = pauseSmooth;
  window.playSmooth = playSmooth;

  let queueEndedToken = -1; // the song the queue ended on with repeat off, see the 'ended' handler
  function togglePlayPause() {
    if (!state.currentTrack) {
      if (state.queue.length > 0) playTrack(state.queue[0]);
      else if (el.nativeAudio && el.nativeAudio.src) {
        if (state.isPlaying) pauseSmooth();
        else playSmooth();
      }
      return;
    }
    if (state.isPlaying) {
      pauseSmooth();
      saveQueueState();
    } else if (queueEndedToken === state.loadToken && el.nativeAudio && el.nativeAudio.ended) {
      queueEndedToken = -1;
      playNext();
    } else if (el.nativeAudio && !el.nativeAudio.src && state.currentTrack) {
      const resumeAt = state.queueRestorePosition || 0;
      state.queueRestorePosition = 0;
      playTrack(state.currentTrack, state.queue, state.queueIndex);
      // playTrack bumps loadToken before its first await: a skip before the song loads must not seek the next one
      const resumeToken = state.loadToken;
      if (resumeAt > 3) {
        const seekOnce = () => {
          el.nativeAudio.removeEventListener('loadedmetadata', seekOnce);
          if (resumeToken !== state.loadToken) return;
          if (!el.nativeAudio.duration || resumeAt < el.nativeAudio.duration - 5) el.nativeAudio.currentTime = resumeAt;
        };
        el.nativeAudio.addEventListener('loadedmetadata', seekOnce);
      }
    } else {
      playSmooth();
    }
  }

  // The phone's earbuds played songs while this page wasn't running (mobile/media-controls.ts, ColdPlayer.java), and
  // may have got further in the queue: carry on from that song and place, as if it had played here. Only before
  // anything is loaded here (the page has just started). False when it can't.
  function restoreQueueAt(/** @type {number} */ index, /** @type {number} */ position, /** @type {boolean} */ play) {
    const t = state.queue[index];
    if (!t || state.isPlaying || (el.nativeAudio && el.nativeAudio.src)) return false;
    state.queueIndex = index;
    state.queueHistory = [index];
    state.currentTrack = t;
    state.queueRestorePosition = Math.max(0, Number(position) || 0);
    updateNowPlayingUI(t);
    onTrackAudioTrackChange();
    updateQueueBadge();
    renderQueueView();
    saveQueueState();
    if (play) togglePlayPause();
    return true;
  }

  // The native player was already playing a song of the queue when this page started (earbuds started it while
  // Uriel was closed; mobile/media-controls.ts): the page shows it as its own, without loading anything.
  function adoptQueueAt(/** @type {number} */ index) {
    const t = state.queue[index];
    if (!t || state.isPlaying) return false;
    state.queueIndex = index;
    state.queueHistory = [index];
    state.currentTrack = t;
    state.queueRestorePosition = 0;
    updateNowPlayingUI(t);
    onTrackAudioTrackChange();
    updateQueueBadge();
    renderQueueView();
    return true;
  }

  // With repeat off, the queue plays once: true while the last song of it plays. Repeat 'all' starts over
  // instead, and My Wave keeps adding songs.
  function queueFinished() {
    const q = state.queue;
    if (state.repeatMode !== 'off' || state.myWaveActive || !q.length) return false;
    return state.queueIndex >= q.length - 1;
  }

  function recordPlayedIndex(/** @type {number} */ idx) {
    if (typeof idx !== 'number' || idx < 0) return;
    const h = state.queueHistory;
    if (h[h.length - 1] !== idx) h.push(idx);
    if (h.length > 200) h.shift();
  }

  function playNext() {
    advancing = true;
    try { playNextSong(); } finally { advancing = false; }
  }

  function playNextSong() {
    if (state.queue.length === 0) return;

    if (!state._isNaturalEnding && state.myWaveActive && state.currentTrack) {
      const cur = (el.nativeAudio && typeof el.nativeAudio.currentTime === 'number') ? el.nativeAudio.currentTime : 0;
      if (cur < 12 && typeof recordWaveSkip === 'function') {
        recordWaveSkip(state.currentTrack);
        state._skipRecordedFor = (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(state.currentTrack) : '') || state.currentTrack.id;
      }
    }

    let nextIdx = state.queueIndex + 1;
    while (nextIdx < state.queue.length && isBlocked(state.queue[nextIdx])) nextIdx++;
    if (nextIdx >= state.queue.length) {
      if (state.myWaveActive && typeof extendMyWaveQueue === 'function') {
        const tok = state.loadToken;
        setTrackLoading(true); // the next songs are still being picked
        const done = () => { if (tok === state.loadToken) setTrackLoading(false); };
        extendMyWaveQueue().then((/** @type {boolean} */ added) => {
          if (added && tok === state.loadToken && state.queueIndex + 1 < state.queue.length) {
            playNext();
          } else done();
        }, done);
        return;
      }
      nextIdx = 0;
      while (nextIdx < state.queueIndex && isBlocked(state.queue[nextIdx])) nextIdx++;
    }
    state.queueIndex = nextIdx;
    recordPlayedIndex(nextIdx);
    playTrack(state.queue[nextIdx]);

    if (state.myWaveActive && state.queueIndex >= state.queue.length - 3 && typeof extendMyWaveQueue === 'function') {
      extendMyWaveQueue();
    }
  }

  function playPrev() {
    if (el.nativeAudio && el.nativeAudio.currentTime > 3) {
      el.nativeAudio.currentTime = 0;
      return;
    }
    {
      const h = state.playHistory || [];
      if (h.length) {
        const prev = h.pop();
        navigatingBack = true;
        try { playTrack(prev); } finally { navigatingBack = false; }
        const prevIdx = state.queue.findIndex((/** @type {UrielTrack} */ t) => t.id === prev.id || isSameTrack(t, prev));
        if (prevIdx !== -1) state.queueIndex = prevIdx;
        return;
      }
    }
    if (state.queue.length === 0) return;

    const h = state.queueHistory;
    if (h.length > 1) {
      h.pop();
      const prevIdx = h[h.length - 1];
      if (prevIdx >= 0 && prevIdx < state.queue.length) {
        state.queueIndex = prevIdx;
        playTrack(state.queue[prevIdx]);
        return;
      }
      h.push(state.queueIndex);
    }

    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) prevIdx = state.queue.length - 1;
    state.queueIndex = prevIdx;
    state.queueHistory = [prevIdx];
    playTrack(state.queue[prevIdx]);
  }

  // Each look-up starts yt-dlp, which can run a JavaScript runtime at full CPU (#16), so the computer
  // only looks up the one song that plays next, and only near the end of this one. Phones download
  // whole songs to play them, so they start on that halfway through.
  function prefetchNextQueueTrack() {
    const nextTrack = state.queue && state.queue.slice(state.queueIndex + 1).find((/** @type {UrielTrack} */ t) => !isBlocked(t));
    if (!nextTrack || nextTrack.platform === 'local' || !(nextTrack.url || nextTrack.id)) return;
    const q = `url=${encodeURIComponent(nextTrack.url || '')}&id=${encodeURIComponent(nextTrack.id || '')}&platform=${nextTrack.platform || state.platform}&title=${encodeURIComponent(nextTrack.title || '')}&artist=${encodeURIComponent(nextTrack.artist || '')}&duration=${encodeURIComponent(nextTrack.duration || 0)}&thumbnail=${encodeURIComponent(nextTrack.thumbnail || '')}`;
    fetch(`http://127.0.0.1:${state.serverPort}/api/${isPhoneApp ? 'stream-info' : 'prefetch'}?${q}&next=1`).catch(() => {});
  }

  if (el.nativeAudio) {
    el.nativeAudio.addEventListener('error', () => {
      // only an error on the song that is actually loaded counts (unloading one between songs is not a failure)
      if (!state.currentTrack || (!el.nativeAudio.src && !hlsInstance)) return;
      logPlaybackIssue('Audio element error', null);
      if (recoverMidSong(state.loadToken, state.currentTrack)) return;
      state.isPlaying = false;
      document.body.classList.remove('is-playing');
      if (tryProxyFallback(state.loadToken, state.currentTrack)) return;
      if (retryFresh(state.loadToken, state.currentTrack)) return;
      updatePlayPauseButton(false, false);
      if (skipUnplayable(state.loadToken, state.currentTrack)) return;
      if (state.currentTrack.platform === 'local') showPlayFailure(Tm('File missing from library'), 'info');
      else showPlayFailure(Tm('Could not play this song. Try again or skip.'));
    });

    el.nativeAudio.addEventListener('waiting', () => {
      updatePlayPauseButton(state.isPlaying, true);
      if (!el.nativeAudio.paused) watchStall();
    });
    el.nativeAudio.addEventListener('stalled', () => { if (!el.nativeAudio.paused) watchStall(); });
    ['playing', 'pause', 'emptied'].forEach((ev) => el.nativeAudio.addEventListener(ev, clearStall));

    // A stream that stops delivering mid-song (an expired or throttled link) is looked up afresh after 12 s
    // and continues where it stopped, instead of spinning forever (Riff 44)
    /** @type {ReturnType<typeof setTimeout> | null} */
    let stallTimer = null;
    function clearStall() { if (stallTimer) clearTimeout(stallTimer); stallTimer = null; }
    function watchStall() {
      clearStall();
      const token = state.loadToken;
      const track = state.currentTrack;
      stallTimer = setTimeout(() => {
        stallTimer = null;
        const a = el.nativeAudio;
        if (token !== state.loadToken || track !== state.currentTrack || a.paused || a.readyState >= 3) return;
        if (!track || track.platform === 'local' || state.trackLoading) return;
        recoverMidSong(token, track);
      }, 12000);
    }

    // whichever look-up brings the stream back (a failed one is tried again): it continues at the saved place
    el.nativeAudio.addEventListener('loadedmetadata', () => {
      const r = resumeAt;
      if (!r || r.token !== state.loadToken) return;
      const pos = window.UrielPlaybackRecovery.resumePosition(r.pos, el.nativeAudio.duration);
      if (pos) el.nativeAudio.currentTime = pos;
    });

    el.nativeAudio.addEventListener('playing', () => {
      notePlayedThisSession(state.currentTrack);
      resumeAt = null;
      failStreak = 0;
      state.isPlaying = true;
      setTrackLoading(false);
      registerMediaActions();
      document.body.classList.add('is-playing');
      updatePlayPauseButton(true, false);
      // phones warm up the next two songs (staggered) so skipping or a slow network never leaves a gap;
      // the computer looks up only the next one, near the end of this one (prefetchNextQueueTrack, #16)
      const upcoming = !isPhoneApp ? [] : [1, 2].map(ahead => state.queue && state.queue[state.queueIndex + ahead]);
      upcoming.forEach((nextTrack, k) => {
        if (nextTrack && nextTrack.url && nextTrack.platform !== 'local') {
          setTimeout(() => {
            fetch(`http://127.0.0.1:${state.serverPort}/api/prefetch?url=${encodeURIComponent(nextTrack.url || '')}&id=${encodeURIComponent(nextTrack.id || '')}&platform=${nextTrack.platform || state.platform}&title=${encodeURIComponent(nextTrack.title || '')}&artist=${encodeURIComponent(nextTrack.artist || '')}&duration=${encodeURIComponent(nextTrack.duration || 0)}&thumbnail=${encodeURIComponent(nextTrack.thumbnail || '')}`).catch(() => {});
          }, 2000 + k * 6000);
        }
      });
    });

    el.nativeAudio.addEventListener('canplay', () => {
      updatePlayPauseButton(state.isPlaying, false);
    });

    el.nativeAudio.addEventListener('play', () => {
      emitPluginEvent('play');
      if (!hasNotifiedMediaKeysActive) {
        hasNotifiedMediaKeysActive = true;
        if (window.electronAPI && window.electronAPI.mediaKeysActive) {
          window.electronAPI.mediaKeysActive();
        }
      }
      updatePlayPauseButton(true, false);
      if (!state.isPlaying) {
        state.isPlaying = true;
        document.body.classList.add('is-playing');
        if (el.coverContainer && state.vfx.vinylSpin) el.coverContainer.classList.add('spinning');
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
        sendStateToServer();
        updateMediaSession();
      }
      updateMediaPositionState();
      viz.hasDrawnPausedFrame = false;
      if (!viz.animationFrameId) startVisualizers();
      if (audioEngine) {
        if (audioEngine.resumeAudioContext) audioEngine.resumeAudioContext();
        audioEngine._applyMasterVolume();
      }
      if (playback.crossfadeFadeInPending) {
        playback.crossfadeFadeInPending = false;
        crossfadeFadeIn();
      }
      sendStateToServer();
      updateMediaSession();
      if (typeof m3cStart === 'function') m3cStart();
    });

    el.nativeAudio.addEventListener('pause', () => {
      if (!el.nativeAudio.ended) cancelEndFade();
      emitPluginEvent('pause');
      updatePlayPauseButton(false, false);
      if (state.isPlaying) {
        state.isPlaying = false;
        document.body.classList.remove('is-playing');
        if (el.coverContainer) el.coverContainer.classList.remove('spinning');
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
        sendStateToServer();
        updateMediaSession();
      }
      updateMediaPositionState();
      if (audioEngine) {
        if (audioEngine.suspendAudioContextDebounced) audioEngine.suspendAudioContextDebounced(5000);
        if (audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(false);
      }
      if (typeof applyM3Cover === 'function') applyM3Cover();
    });

    el.nativeAudio.addEventListener('ended', () => {
      updatePlayPauseButton(false, false);
      if (state.sleepTimer && state.sleepTimer.mode === 'end') {
        state.sleepTimer = null;
        updateSleepTimerUI();
        return;
      }
      if (audioEngine) {
        if (audioEngine.suspendAudioContextDebounced) audioEngine.suspendAudioContextDebounced(5000);
        if (audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(false);
      }
      // a song that faded out (Crossfade) hands over to one that fades in
      const fadedOut = playback.crossfadeTriggered && !state.isRepeat && !queueFinished();
      if (!fadedOut) cancelEndFade();
      if (state.isRepeat) {
        el.nativeAudio.currentTime = 0;
        playSmooth();
      } else if (queueFinished()) {
        // repeat is off and that was the last song: stop here; play starts the queue over
        queueEndedToken = state.loadToken;
        saveQueueState();
      } else {
        if (fadedOut) playback.crossfadeFadeInPending = true;
        state._isNaturalEnding = true;
        try {
          playNext();
        } finally {
          state._isNaturalEnding = false;
        }
      }
    });

    // speed / pitch (Sound settings) for every song: iPhones put playbackRate back to 1 once a new song
    // has loaded, which undid the settings applied when it started loading (issue #5)
    const keepPlaybackRate = () => {
      if (!audioEngine || !audioEngine.playbackFor) return;
      const { rate, preservePitch } = audioEngine.playbackFor();
      const a = el.nativeAudio;
      if (Math.abs(a.playbackRate - rate) > 0.001 || a.preservesPitch !== preservePitch) audioEngine.applySettings(a);
    };
    ['loadedmetadata', 'canplay', 'playing'].forEach(ev => el.nativeAudio.addEventListener(ev, keepPlaybackRate));

    // The iPhone's Now Playing widget moves its progress bar on its own from the last position and rate it was
    // given. Told only at play / pause, it kept the rate WebKit had reset to 1 before the song's speed was put
    // back (a sped-up song's bar lagged), and a length that wasn't known yet (#26). Tell it again whenever any
    // of them changes, and now and then while playing.
    let positionSentAt = 0;
    const sendPosition = () => { positionSentAt = Date.now(); updateMediaPositionState(); };
    ['ratechange', 'durationchange', 'loadedmetadata', 'seeked', 'playing'].forEach(ev => el.nativeAudio.addEventListener(ev, sendPosition));
    el.nativeAudio.addEventListener('timeupdate', () => {
      if (!el.nativeAudio.paused && Date.now() - positionSentAt > 10000) sendPosition();
    });

    el.nativeAudio.addEventListener('durationchange', () => {
      const audio = el.nativeAudio;
      if (state.currentTrack && Number.isFinite(audio.duration) && audio.duration > 1) {
        const newDur = Math.round(audio.duration);
        if (Math.abs(audio.duration - (state.currentTrack.duration || 0)) > 1.5) {
          state.currentTrack.duration = newDur;
          const tid = state.currentTrack.id;
          if (Array.isArray(state.queue)) {
            state.queue.forEach((t) => { if (t && t.id === tid) t.duration = newDur; });
          }
          if (Array.isArray(state.playlists)) {
            state.playlists.forEach((p) => {
              if (p && Array.isArray(p.tracks)) {
                p.tracks.forEach((/** @type {UrielTrack} */ t) => { if (t && t.id === tid) t.duration = newDur; });
              }
            });
          }
        }
        if (el.timeDuration) el.timeDuration.textContent = formatDuration(newDur);
      }
      updateMediaPositionState();
    });

    el.nativeAudio.addEventListener('seeked', () => {
      cancelEndFade(); // timeupdate fades again from here if the seek stayed inside the last seconds
      updateMediaPositionState();
      updateDiscordPresence();
      state.forceLyricsScroll = true;
      state.forceSnapLyrics = true;
      state.lastActiveLyricIdx = -1;
      if (state.isRightPanelOpen || state.isTvKaraokeOpen) {
        updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      }
    });

    let lastTimeupdateSec = -1;
    el.nativeAudio.addEventListener('timeupdate', () => {
      if (enforceTrackTrim()) return;
      const cur = (el.nativeAudio && Number.isFinite(el.nativeAudio.currentTime)) ? el.nativeAudio.currentTime : 0;
      const dur = (el.nativeAudio && Number.isFinite(el.nativeAudio.duration) && el.nativeAudio.duration > 0)
        ? el.nativeAudio.duration
        : (state.currentTrack && Number.isFinite(state.currentTrack.duration) ? state.currentTrack.duration : 0);
      if (state.isTvKaraokeOpen) syncTvkProgress(cur, dur);
      if (miniLyricsShown()) updateMiniLyricsHighlight(cur);

      // Crossfade (off by default): fade the song out over its last X seconds while it keeps playing; the
      // 'ended' handler starts the next one, which fades in. This used to skip to the next song X seconds before
      // the end, which cut every song short by the crossfade length (#22).
      // With overlap (#29) the last X seconds move to a second player that plays them to the end while the next
      // song starts (prepareCrossfade); the song itself is never cut short.
      const X = crossfadeSeconds();
      if (X > 0 && !playback.crossfadeTriggered && !state.isRepeat && !el.nativeAudio.paused && audioEngine && !audioEngine.isLiveStream(el.nativeAudio) && window.UrielTrim) {
        const trim = state.currentTrack ? getTrackTrim(state.currentTrack) : null;
        const end = trim && window.UrielTrim.isActive(trim) ? Math.min(trim.end, dur) : dur;
        const sleepAtEnd = state.sleepTimer && state.sleepTimer.mode === 'end';
        const step = !sleepAtEnd && canOverlap(el.nativeAudio) && !queueFinished() ? window.UrielTrim.crossfadeStep(cur, end, X, el.nativeAudio.playbackRate) : null;
        if (step && !crossfadePrepared()) {
          const point = window.UrielTrim.crossfadePoint(end, X);
          if (point !== null) prepareCrossfade(point, end);
        } else if (!step && !crossfadePrepared()) {
          const fade = window.UrielTrim.endFadeSeconds(cur, end, X, el.nativeAudio.playbackRate);
          if (fade > 0) {
            playback.crossfadeTriggered = true;
            audioEngine.fadeOut(fade);
          }
        }
      }

      if (state.isPlaying && nextPrefetchDue(cur, dur) && !state.nextTrackPrefetched) {
        state.nextTrackPrefetched = true;
        prefetchNextQueueTrack();
      }

      if (!state.isPlaying && typeof m3cDraw === 'function' && typeof m3cEnabled === 'function' && m3cEnabled()) {
        m3cDraw(performance.now());
      }

      if (playback.isDraggingScrubber || state.isPlaying) return;
      const roundedSec = Math.floor(cur);
      if (lastTimeupdateSec === roundedSec) return;
      lastTimeupdateSec = roundedSec;
      if (state.isRightPanelOpen || state.isTvKaraokeOpen) {
        updateSyncedLyricsHighlight(cur);
      }
      if (el.timeCurrent) el.timeCurrent.textContent = formatDuration(cur);
      if (el.timeDuration) el.timeDuration.textContent = formatDuration(dur);
    });
  }


  function updateScrubberPositionFromEvent(/** @type {PointerEvent} */ e) {
    if (!el.scrubberTrack) return 0;
    const rect = el.scrubberTrack.getBoundingClientRect();
    const padLeft = 5.5;
    const trackWidth = rect.width - 2 * padLeft;
    let pos = trackWidth > 0 ? (e.clientX - rect.left - padLeft) / trackWidth : 0;
    pos = Math.max(0, Math.min(1, pos));
    const dur = (el.nativeAudio && Number.isFinite(el.nativeAudio.duration) && el.nativeAudio.duration > 0)
      ? el.nativeAudio.duration
      : (state.currentTrack && Number.isFinite(state.currentTrack.duration) ? state.currentTrack.duration : 0);
    const targetTime = pos * dur;

    state.scrubberDragTargetTime = targetTime;
    if (el.timeCurrent) el.timeCurrent.textContent = formatDuration(targetTime);
    return targetTime;
  }

  // Pointer events (not mouse events) so a finger drag scrubs too: on Android a touch drag never fires
  // mousemove, only the tap's synthesized mousedown/mouseup, so only tapping used to seek (#21).
  /** @type {number | null} */
  let scrubberPointerId = null;
  if (el.scrubberTrack) {
    el.scrubberTrack.style.touchAction = 'none';
    el.scrubberTrack.addEventListener('pointerdown', (/** @type {PointerEvent} */ e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      playback.isDraggingScrubber = true;
      scrubberPointerId = e.pointerId;
      try { el.scrubberTrack.setPointerCapture(e.pointerId); } catch (_) {}
      viz.hasDrawnPausedFrame = false;
      if (!viz.animationFrameId) startVisualizers();
      el.scrubberTrack.classList.add('dragging');
      updateScrubberPositionFromEvent(e);
    });
  }

  window.addEventListener('pointermove', (e) => {
    if (!playback.isDraggingScrubber || e.pointerId !== scrubberPointerId) return;
    updateScrubberPositionFromEvent(e);
  });

  const endScrub = (/** @type {PointerEvent} */ e, /** @type {boolean} */ commit) => {
    if (!playback.isDraggingScrubber || e.pointerId !== scrubberPointerId) return;
    playback.isDraggingScrubber = false;
    scrubberPointerId = null;
    if (el.scrubberTrack) el.scrubberTrack.classList.remove('dragging');
    const targetTime = commit ? updateScrubberPositionFromEvent(e) : state.scrubberDragTargetTime;
    if (targetTime !== undefined && !isNaN(targetTime) && el.nativeAudio) {
      el.nativeAudio.currentTime = targetTime;
      updateMediaPositionState();
    }
    state.scrubberDragTargetTime = undefined;
  };
  window.addEventListener('pointerup', (e) => endScrub(e, true));
  window.addEventListener('pointercancel', (e) => endScrub(e, false));

  function getAllPresets() {
    return [...defaultPresets, ...state.customPresets];
  }

  function renderPresets() {
    if (!el.presetsContainer) return;
    el.presetsContainer.innerHTML = '';
    const all = getAllPresets();
    all.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'preset-chip';
      if (state.activePresetId === p.id) chip.classList.add('active');

      const isCustom = p.id.startsWith('custom_');
      chip.dataset.isCustom = isCustom ? 'true' : 'false';
      chip.dataset.presetId = p.id;

      chip.innerHTML = `
      <span class="preset-name-label">${escapeHtml(p.name)}</span>
      ${isCustom ? `
        <div class="preset-actions">
          <button type="button" class="preset-btn-action btn-rename-p" title="Rename" aria-label="Rename preset">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button type="button" class="preset-btn-action btn-delete-p" title="Delete" aria-label="Delete preset">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>` : ''}
        `;

        if (isCustom) {
          const btnRename = chip.querySelector('.btn-rename-p');
          const btnDelete = chip.querySelector('.btn-delete-p');
          if (btnRename) {
            btnRename.addEventListener('click', (e) => {
              e.stopPropagation();
              openRenamePresetModal(p);
            });
          }
          if (btnDelete) {
            btnDelete.addEventListener('click', (e) => {
              e.stopPropagation();
              openDeletePresetConfirm(p);
            });
          }
        }

        chip.addEventListener('click', (e) => {
          if (/** @type {HTMLElement} */ (e.target).closest('.btn-delete-p') || /** @type {HTMLElement} */ (e.target).closest('.btn-rename-p')) return;
          applyPreset(p);
        });

        el.presetsContainer.appendChild(chip);
    });
    updatePresetsFade();
  }

  function updateFade(/** @type {Element | null} */ el) {
    if (!el) return;
    el.classList.toggle('fade-top', el.scrollTop > 4);
    el.classList.toggle('fade-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }
  window.updateFade = updateFade;

  function updatePresetsFade() {
    updateFade(/** @type {HTMLElement} */ (document.getElementById('presets-container')));
  }

  if (el.presetsContainer) {
    el.presetsContainer.addEventListener('scroll', updatePresetsFade, { passive: true });
  }
  window.addEventListener('resize', () => {
    updatePresetsFade();
    const c = document.querySelector('#view-album .album-tracks-col');
    if (c) updateFade(c);
  });

  /** @type {number | null} */
  let activeTweenRaf = null;
  function tweenSettings(/** @type {Record<string, any>} */ from, /** @type {Record<string, any>} */ to, /** @type {number} */ ms, /** @type {(cur: Record<string, any>) => void} */ apply) {
    if (activeTweenRaf) cancelAnimationFrame(activeTweenRaf);
    const t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / ms), e = k * k * (3 - 2 * k);
      /** @type {Record<string, any>} */
      const cur = {};
      for (const key in to) {
        if (typeof to[key] === 'number') cur[key] = from[key] + (to[key] - from[key]) * e;
        else if (Array.isArray(to[key])) {
          cur[key] = to[key].map((v, idx) => (from[key]?.[idx] ?? 0) + (v - (from[key]?.[idx] ?? 0)) * e);
        } else if (typeof to[key] === 'object' && to[key] !== null) {
          cur[key] = { ...from[key] };
          for (const subKey in to[key]) cur[key][subKey] = (from[key]?.[subKey] ?? 0) + (to[key][subKey] - (from[key]?.[subKey] ?? 0)) * e;
        } else cur[key] = to[key];
      }
      apply(cur);
      if (k < 1) activeTweenRaf = requestAnimationFrame(step);
      else activeTweenRaf = null;
    })(t0);
  }

  function applyPreset(/** @type {UrielPreset} */ preset) {
    const normalized = normalizePreset(preset);
    if (!normalized) return;
    state.activePresetId = normalized.id;
    initAudioContext();
    renderPresets();
    if (activeTweenRaf) { cancelAnimationFrame(activeTweenRaf); activeTweenRaf = null; }
    if (localStorage.getItem('uriel_smooth_presets') === 'false') {
      state.audioSettings = { ...normalized.settings };
      syncSettingsSlidersToState();
      applyAudioSettings();
      return;
    }
    const fromAudio = JSON.parse(JSON.stringify(state.audioSettings));
    const toAudio = JSON.parse(JSON.stringify(normalized.settings));
    tweenSettings(fromAudio, toAudio, 400, (/** @type {Record<string, any>} */ cur) => {
      state.audioSettings = { ...state.audioSettings, ...cur };
      syncSettingsSlidersToState();
      applyAudioSettings();
    });
  }

  function saveCustomPreset(/** @type {string} */ name) {
    if (!name || !name.trim()) return;
    const newPreset = {
      id: 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: name.trim(),
      settings: {
        ...state.audioSettings,
        eq: { ...(state.audioSettings.eq || {}) },
        eqBands: [...(state.audioSettings.eqBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]
      }
    };
    state.customPresets.push(newPreset);
    state.activePresetId = newPreset.id;
    localStorage.setItem('devsize_custom_presets', JSON.stringify(state.customPresets));
    renderPresets();
    persistSoundSettings();
  }

  function openRenamePresetModal(/** @type {UrielPreset} */ preset) {
    state.presetToRenameId = preset.id;
    if (el.renamePresetName) el.renamePresetName.value = preset.name;
    if (el.renamePresetModal) openModal(el.renamePresetModal);
    if (el.renamePresetName) el.renamePresetName.focus();
  }

  function renameCustomPreset(/** @type {string} */ id, /** @type {string} */ newName) {
    if (!newName || !newName.trim()) return;
    const p = state.customPresets.find((/** @type {UrielPreset} */ x) => x.id === id);
    if (p) {
      p.name = newName.trim();
      localStorage.setItem('devsize_custom_presets', JSON.stringify(state.customPresets));
      renderPresets();
    }
  }

  function deleteCustomPreset(/** @type {string} */ id) {
    state.customPresets = state.customPresets.filter((/** @type {UrielPreset} */ p) => p.id !== id);
    if (state.activePresetId === id) state.activePresetId = 'p_default';
    localStorage.setItem('devsize_custom_presets', JSON.stringify(state.customPresets));
    renderPresets();
    persistSoundSettings();
  }

  function openDeletePresetConfirm(/** @type {UrielPreset} */ preset) {
    state.presetToDeleteId = preset.id;
    const msg = document.getElementById('delete-preset-msg');
    if (msg) I18N.text(msg, 'Delete preset "{0}"?', preset.name);
    const modal = document.getElementById('delete-preset-modal');
    if (modal) openModal(modal);
  }

  async function fetchArtistCardForSearch(/** @type {string} */ query, /** @type {number} */ token, /** @type {UrielTrack[]} */ searchTracks) {
    const container = document.getElementById('search-artist-card-container');
    if (!container) return;
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/artist?name=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (state.searchToken !== token) return;
      if (!data.success || !data.artist || !data.artist.name) return;

      const artist = data.artist;
      const normQ = normalizeImportText(query);
      const normA = normalizeImportText(artist.name);

      const isExactOrPrefix = normA === normQ || normA.startsWith(normQ) || normQ.startsWith(normA);
      const isTopTrackArtist = Array.isArray(searchTracks) && searchTracks.slice(0, 5).some(t => {
        const normT = normalizeImportText(t.artist);
        // a song without an artist matches nothing ("" is inside every name)
        return !!normT && (normT === normA || normT.includes(normA) || normA.includes(normT));
      });

      if (!isExactOrPrefix && !isTopTrackArtist) {
        return;
      }

      const avatarUrl = artist.avatar || (searchTracks && searchTracks[0] ? searchTracks[0].thumbnail : '');
      container.innerHTML = `
        <div class="search-artist-card" role="button" tabindex="0">
          <div class="search-artist-avatar-wrap">
            ${avatarUrl ? `<img class="search-artist-avatar" loading="lazy" decoding="async" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(artist.name)}" />` : '<div style="width:100%;height:100%;background:var(--md-sys-color-surface-container);"></div>'}
          </div>
          <div class="search-artist-info">
            <span class="search-artist-name">${escapeHtml(artist.name)}</span>
            <span class="search-artist-label" data-i18n>Artist</span>
          </div>
        </div>
      `;

      const card = /** @type {HTMLElement | null} */ (container.querySelector('.search-artist-card'));
      if (card) {
        card.addEventListener('click', () => openArtistProfile(artist.name));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openArtistProfile(artist.name);
          }
        });
      }
    } catch (e) {}
  }

  const albumResolved = new Map();

  function normalizeMatchText(/** @type {string | undefined} */ str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function resolveAlbumTrack(/** @type {UrielAlbum} */ album, /** @type {UrielTrack} */ t) {
    if (!album || !t) return null;
    const albumId = album.id || '';
    const trackNo = t.no != null ? t.no : 1;
    // per disc: track 1 of disc 2 isn't track 1 of disc 1
    const cacheKey = `${albumId}:${t.disc || 1}:${trackNo}`;
    if (albumResolved.has(cacheKey)) {
      return albumResolved.get(cacheKey);
    }

    const query = `${t.artist || album.artist || ''} ${t.title || ''}`.trim();
    const platform = state.platform || 'youtube';
    let picked = null;
    try {
      const url = `http://127.0.0.1:${state.serverPort}/api/search?q=${encodeURIComponent(query)}&platform=${platform}&limit=5`;
      const res = await fetch(url);
      const data = await res.json();
      const results = (data && Array.isArray(data.tracks)) ? data.tracks.slice(0, 5) : [];
      if (results.length > 0) {
        const normAlbumTitle = normalizeMatchText((t.title || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/\b(feat|ft)\b.*$/i, ''));
        const targetSec = t.durationMs ? t.durationMs / 1000 : null;
        const matching = normAlbumTitle
          ? results.filter((/** @type {UrielTrack} */ cand) => normalizeMatchText(cand.title).includes(normAlbumTitle))
          : [];

        if (matching.length > 0) {
          if (targetSec != null) {
            picked = matching.find((/** @type {UrielTrack} */ c) => {
              const cSec = toSeconds(c.duration);
              return cSec > 0 && Math.abs(cSec - targetSec) <= 6;
            }) || matching[0];
          } else {
            picked = matching[0];
          }
        }
      }
    } catch (err) {
      console.warn('[albums] resolve error:', err);
    }

    if (picked) {
      albumResolved.set(cacheKey, picked);
    }
    return picked;
  }

  function isEpisodeAlbum(/** @type {UrielTrack[]} */ tracks) {
    if (!tracks || tracks.length < 4) return false;
    const chapterLike = tracks.filter((/** @type {UrielTrack} */ t) => /^(kapitel|inhaltsangabe|titelmusik|teil|chapter)\b|\((teil|kapitel|part|chapter)\s*\d+\)/i.test((t.title || '').trim())).length;
    return chapterLike / tracks.length >= 0.6;
  }

  async function playEpisodeAlbum(/** @type {UrielAlbum} */ album, /** @type {UrielTrack[]} */ tracks, /** @type {number} */ runId) {
    const totalSec = tracks.reduce((/** @type {number} */ a, /** @type {UrielTrack} */ t) => a + (t.durationMs || 0), 0) / 1000;
    const platform = state.platform || 'youtube';
    const queries = [
      `${album.artist || ''} ${album.title || ''} ganzes Hörspiel`.trim(),
      `${album.artist || ''} ${album.title || ''}`.trim()
    ];
    let picked = null;
    for (const query of queries) {
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/search?q=${encodeURIComponent(query)}&platform=${platform}&limit=8`);
        const data = await res.json();
        const results = (data && Array.isArray(data.tracks)) ? data.tracks : [];
        const epTitle = normalizeMatchText((album.title || '').replace(/^\s*folge\s*\d+\s*[:\-]?\s*/i, '').replace(/\(.*?\)/g, ''));
        const epNum = ((album.title || '').match(/folge\s*(\d+)/i) || [])[1];
        const long = results.filter((/** @type {UrielTrack} */ c) => {
          if (toSeconds(c.duration) < 600) return false;
          const ct = normalizeMatchText(c.title);
          if (epTitle && ct.includes(epTitle)) return true;
          return !!epNum && new RegExp('folge\\s*' + epNum + '(\\D|$)').test(ct);
        });
        if (long.length) {
          picked = long.slice().sort((/** @type {UrielTrack} */ a, /** @type {UrielTrack} */ b) => Math.abs(toSeconds(a.duration) - totalSec) - Math.abs(toSeconds(b.duration) - totalSec))[0];
          break;
        }
      } catch (e) {}
    }
    if (currentAlbumPlayRunId !== runId) return;
    if (!picked) {
      showToast(Tm('This album does not exist'), 'warning');
      return;
    }
    playTrack(picked, [picked], 0, 'album');
  }

  async function playAlbumFrom(/** @type {UrielAlbum} */ album, /** @type {UrielTrack[]} */ tracks, startIndex = 0) {
    if (!album || !tracks || !tracks.length) return;
    const runId = ++currentAlbumPlayRunId;

    const toastTimer = setTimeout(() => {
      showToast(Tm('Finding songs…'), 'info');
    }, 800);

    if (isEpisodeAlbum(tracks)) {
      await playEpisodeAlbum(album, tracks, runId);
      clearTimeout(toastTimer);
      return;
    }

    const startIdx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const firstResolved = await resolveAlbumTrack(album, tracks[startIdx]);
    clearTimeout(toastTimer);

    if (currentAlbumPlayRunId !== runId) return;

    if (!firstResolved) {
      showToast(Tm('This album does not exist'), 'warning');
      return;
    }

    playTrack(firstResolved, [firstResolved], 0, 'album');

    const remaining = tracks.map((/** @type {UrielTrack} */ t, /** @type {number} */ idx) => ({ t, idx })).filter((/** @type {{ t: UrielTrack, idx: number }} */ item) => item.idx !== startIdx);
    const resolvedMap = new Map();
    let skippedCount = 0;

    await pool(remaining, 4, async (/** @type {{ t: UrielTrack, idx: number }} */ item) => {
      if (currentAlbumPlayRunId !== runId) return;
      const resTrack = await resolveAlbumTrack(album, item.t);
      if (currentAlbumPlayRunId !== runId) return;
      if (resTrack) {
        resolvedMap.set(item.idx, resTrack);
      } else {
        skippedCount++;
      }
    });

    if (currentAlbumPlayRunId !== runId) return;

    // the album continues after the song that was clicked; the earlier songs come after the last one
    // (they used to be queued right after it, so Next on track 4 played track 1)
    for (let k = 1; k < tracks.length; k++) {
      const i = (startIdx + k) % tracks.length;
      const cand = resolvedMap.get(i);
      if (!cand) continue;
      const alreadyInQueue = state.queue.some((/** @type {UrielTrack} */ q) => isSameTrack(q, cand));
      if (!alreadyInQueue) {
        state.queue.push(cand);
      }
    }
    // the album's songs come in after the first one starts: mix them in now
    if (state.isShuffle) { state.unshuffledQueue = null; shuffleQueue(); }
    updateQueueBadge();
    if (state.currentView === 'queue') renderQueueView();

    if (skippedCount > 0) {
      showToast(Tm('{0} songs not found', skippedCount), 'warning');
    }
  }

  // ---- saved albums: the heart on an album page and the Albums tab (Settings > Tracks > Show Albums tab) ----
  // Kept in uriel_saved_albums, the same on every linked device (sync.js). library-pages.js decides what is
  // "the same album" and what a saved album keeps.
  const Lib = window.UrielLibrary;
  const SAVED_ALBUMS_KEY = 'uriel_saved_albums';
  const getSavedAlbums = () => safeArray(SAVED_ALBUMS_KEY);
  function setSavedAlbums(/** @type {UrielAlbum[]} */ list) {
    try { localStorage.setItem(SAVED_ALBUMS_KEY, JSON.stringify(list)); } catch (e) {}
    updateAlbumsCount();
    if (state.currentView === 'albums') renderSavedAlbums();
  }
  function updateAlbumsCount() {
    const n = getSavedAlbums().length;
    const badge = document.getElementById('albums-count');
    if (badge) badge.textContent = String(n);
    const sub = document.getElementById('albums-subtitle');
    if (sub) sub.textContent = `${n} album${n === 1 ? '' : 's'} saved`;
  }
  function renderSavedAlbums() {
    const grid = document.getElementById('saved-albums-grid');
    if (!grid) return;
    updateAlbumsCount();
    const albums = sortedLibrary('albums', getSavedAlbums());
    if (!albums.length) {
      grid.innerHTML = '<div class="empty-hint">No saved albums yet. Open an album and tap the heart to save it.</div>';
      return;
    }
    renderAlbumCards(grid, albums, (/** @type {UrielAlbum} */ a) => [a.type && a.type !== 'Album' ? a.type : '', a.artist, a.year].filter(Boolean).join(' · '));
  }
  // the Albums tab and the heart only show when Settings > Tracks > Show Albums tab is on
  const btnShowAlbums = document.getElementById('btn-show-albums');
  function applyShowAlbums() {
    const show = localStorage.getItem('uriel_show_albums') === '1';
    document.body.classList.toggle('hide-albums-tab', !show);
    if (el.navAlbums) el.navAlbums.classList.toggle('nav-collapsed', !show);
    if (btnShowAlbums) btnShowAlbums.classList.toggle('active', show);
    if (!show && state.currentView === 'albums') switchView('discover');
    refreshStacks();
    updateNavIndicator(false);
  }
  if (btnShowAlbums) {
    btnShowAlbums.addEventListener('click', () => {
      localStorage.setItem('uriel_show_albums', localStorage.getItem('uriel_show_albums') === '1' ? '0' : '1');
      applyShowAlbums();
    });
  }

  // the album on the album page (an album, or a Daily Mix)
  /** @type {UrielAlbum | null} */
  let albumOnPage = null;
  function updateSaveAlbumButton() {
    const btn = document.getElementById('btn-save-album');
    if (!btn || !albumOnPage) return;
    const saved = Lib.isAlbumSaved(getSavedAlbums(), albumOnPage);
    btn.classList.toggle('active', saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.title = saved ? 'Remove from your albums' : 'Save album';
    btn.setAttribute('aria-label', btn.title);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', saved ? 'currentColor' : 'none');
  }
  const btnSaveAlbum = document.getElementById('btn-save-album');
  if (btnSaveAlbum) {
    btnSaveAlbum.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!albumOnPage || albumOnPage.type === 'Daily Mix') return;
      const r = Lib.toggleSavedAlbum(getSavedAlbums(), albumOnPage);
      setSavedAlbums(/** @type {UrielAlbum[]} */ (r.list));
      updateSaveAlbumButton();
      showToast(r.saved ? 'Saved to your albums' : 'Removed from your albums', 'info');
    });
  }

  // ---- Daily Mixes: thumbs up / down ("Do you like these songs?") on a mix's page ----
  // A liked mix makes its songs and artists count for more in My Wave and tomorrow's mixes; a disliked one keeps
  // what it brought in out of them (library-pages.js). Asked once per mix, and the mixes change every day.
  const MIX_FEEDBACK_KEY = 'uriel_mix_feedback';
  const getMixFeedback = () => Lib.cleanFeedback(safeJson(MIX_FEEDBACK_KEY, null));
  function showAlbumExtras(/** @type {UrielAlbum} */ album) {
    albumOnPage = album;
    const isMix = album.type === 'Daily Mix';
    if (btnSaveAlbum) btnSaveAlbum.hidden = isMix;
    updateSaveAlbumButton();
    const box = document.getElementById('daily-mix-feedback');
    if (!box) return;
    box.classList.toggle('hidden', !isMix || Lib.isMixRated(getMixFeedback(), album.id));
    box.classList.remove('fading-out');
    box.querySelectorAll('.daily-mix-rate-btn').forEach(b => b.classList.remove('active'));
  }
  function rateDailyMix(/** @type {boolean} */ isLike) {
    const mix = albumOnPage;
    if (!mix || mix.type !== 'Daily Mix') return;
    const fb = Lib.rateMix(getMixFeedback(), { id: mix.id, artists: mix.mixArtists || [], tracks: mix.tracks || [] }, isLike, (t) => getTrackNormalizedKey(t.artist, t.title));
    try { localStorage.setItem(MIX_FEEDBACK_KEY, JSON.stringify(fb)); } catch (e) {}
    const like = document.getElementById('btn-dm-like');
    const dislike = document.getElementById('btn-dm-dislike');
    if (like) like.classList.toggle('active', isLike);
    if (dislike) dislike.classList.toggle('active', !isLike);
    showToast(isLike ? 'Glad you like this mix' : 'Got it. Less like this from now on', 'info');
    const box = document.getElementById('daily-mix-feedback');
    setTimeout(() => {
      if (!box) return;
      box.classList.add('fading-out');
      setTimeout(() => { box.classList.add('hidden'); box.classList.remove('fading-out'); }, 280);
    }, 350);
  }
  const btnDmLike = document.getElementById('btn-dm-like');
  const btnDmDislike = document.getElementById('btn-dm-dislike');
  if (btnDmLike) btnDmLike.addEventListener('click', () => rateDailyMix(true));
  if (btnDmDislike) btnDmDislike.addEventListener('click', () => rateDailyMix(false));

  // ---- the album page and downloading a whole album (app/album.js) ----
  const albumPart = /** @type {UrielAlbumPart} */ ({});
  function openAlbum(/** @type {UrielAlbum} */ album) { return albumPart.openAlbum(album); }
  window.UrielApp.album({ Lib, T, Tf, Tm, createTrackRow, escapeHtml, getCoverDominantColors, getSavedAlbums, getTrackCanonicalId, highlightPlayingRow, openArtistProfile, openDownloadAllModal, openTrackArtist, playAlbumFrom, playTrack, resolveAlbumTrack, setSavedAlbums, showAlbumExtras, showToast, state, switchView, updateFade }, albumPart);

  function updateRowFade(/** @type {HTMLElement | null} */ row) {
    if (!row) return;
    const maxScroll = row.scrollWidth - row.clientWidth;
    if (maxScroll <= 0) {
      row.classList.remove('fade-left', 'fade-right');
      return;
    }
    row.classList.toggle('fade-left', row.scrollLeft > 4);
    row.classList.toggle('fade-right', row.scrollLeft < maxScroll - 4);
  }
  window.updateRowFade = updateRowFade;

  // one window listener for all rows: each search added its own, which kept every old album row alive
  const fadeRows = new Set();
  window.addEventListener('resize', () => {
    fadeRows.forEach(r => { if (r.isConnected) updateRowFade(r); else fadeRows.delete(r); });
  }, { passive: true });

  // a mouse wheel over a sideways row scrolls the row while it can still go that way; at its ends the page
  // scrolls on (Ctrl+wheel is zoom, left alone)
  function wheelRowSideways(/** @type {HTMLElement} */ row, /** @type {WheelEvent} */ e) {
    if (e.ctrlKey || e.defaultPrevented || row.scrollWidth <= row.clientWidth + 1) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if ((delta < 0 && row.scrollLeft > 0) || (delta > 0 && row.scrollLeft < row.scrollWidth - row.clientWidth - 1)) {
      e.preventDefault();
      glideRowBy(row, e.deltaMode === 1 ? delta * 40 : delta);
    }
  }
  // Each wheel tick adds to where the row is heading (#41). A smooth scrollBy per tick started over from wherever the
  // row was, so ticks arriving faster than it moved were lost: a fast flick went about 6% of the way.
  function glideRowBy(/** @type {HTMLElement} */ row, /** @type {number} */ px) {
    const max = row.scrollWidth - row.clientWidth;
    const from = (row._glideRaf ? row._glideTo : row.scrollLeft) || 0;
    row._glideTo = Math.max(0, Math.min(max, from + px));
    if (row._glideRaf) return;
    row.style.scrollBehavior = 'auto'; // the row's CSS would otherwise animate each step of this animation too
    let last = performance.now();
    const step = (/** @type {number} */ now) => {
      const left = (row._glideTo || 0) - row.scrollLeft;
      if (Math.abs(left) < 1) {
        row.scrollLeft = row._glideTo || 0;
        row._glideRaf = 0;
        row.style.scrollBehavior = '';
        return;
      }
      const move = left * (1 - Math.exp(-(now - last) / 70));
      last = now;
      row.scrollLeft += Math.abs(move) < 1 ? Math.sign(left) : move;
      row._glideRaf = requestAnimationFrame(step);
    };
    row._glideRaf = requestAnimationFrame(step);
  }
  // rows drawn without bindHorizontalWheel (For you: artists and songs, Your playlists, an artist's namesakes)
  // scrolled the whole page under the wheel (#10): one listener for all of them
  const SIDEWAYS_ROWS = '.fy-row, .home-pl-row, .sp-row, .search-albums-row';
  document.addEventListener('wheel', (e) => {
    const row = e.target && /** @type {HTMLElement} */ (e.target).closest ? /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest(SIDEWAYS_ROWS)) : null;
    if (row && !row._wheelBound) wheelRowSideways(row, e);
  }, { passive: false });
  function bindHorizontalWheel(/** @type {HTMLElement} */ row) {
    if (!row || row._wheelBound) return;
    row._wheelBound = true;
    row.addEventListener('wheel', (/** @type {WheelEvent} */ e) => wheelRowSideways(row, e), { passive: false });

    row.addEventListener('scroll', () => updateRowFade(row), { passive: true });
    fadeRows.add(row);
    updateRowFade(row);
  }
  window.bindHorizontalWheel = bindHorizontalWheel;

  // ---- the search results page (app/search.js) ----
  const searchPart = /** @type {UrielSearchPart} */ ({});
  function performSearch(/** @type {string} */ query) { return searchPart.performSearch(query); }
  window.UrielApp.search({ Tm, bindHorizontalWheel, el, escapeHtml, fetchArtistCardForSearch, getAdv, importSharedPlaylist, openAlbum, renderTracks, showToast, state, switchView, syncHomeAmbientVisibility, updateRowFade }, searchPart);

  const multiSel = { active: false, context: '', tracks: new Map() };

  function updateMultiSelectBar() {
    const bar = document.getElementById('multi-select-bar');
    if (!bar) return;
    bar.classList.toggle('hidden', !multiSel.active);
    const count = document.getElementById('multi-select-count');
    if (count) count.textContent = `${multiSel.tracks.size} selected`;
    const hasSel = multiSel.tracks.size > 0;
    ['multi-select-fav', 'multi-select-add', 'multi-select-radio', 'multi-select-download', 'multi-select-remove'].forEach(id => {
      const b = /** @type {HTMLButtonElement} */ (document.getElementById(id));
      if (b) b.disabled = !hasSel;
    });
  }

  function rerenderMultiSelectView() {
    if (multiSel.context === 'playlist' && state.currentPlaylistId) openPlaylistDetail(state.currentPlaylistId);
    else if (multiSel.context === 'favorites') renderFavoritesView();
  }

  function exitMultiSelect(rerender = true) {
    if (!multiSel.active) return;
    multiSel.active = false;
    multiSel.tracks.clear();
    document.body.classList.remove('multi-select-on');
    updateMultiSelectBar();
    if (rerender) rerenderMultiSelectView();
  }

  function startMultiSelect(/** @type {string} */ context) {
    if (multiSel.active) return exitMultiSelect();
    multiSel.active = true;
    multiSel.context = context;
    multiSel.tracks.clear();
    document.body.classList.add('multi-select-on');
    updateMultiSelectBar();
    rerenderMultiSelectView();
  }

  function toggleTrackSelection(/** @type {UrielTrack} */ track, /** @type {HTMLElement} */ row) {
    const key = getTrackCanonicalId(track);
    if (multiSel.tracks.has(key)) multiSel.tracks.delete(key);
    else multiSel.tracks.set(key, track);
    if (row) row.classList.toggle('selected', multiSel.tracks.has(key));
    updateMultiSelectBar();
  }

  // only what the list shows: with a search typed in, "Select all" took every song and Remove deleted hidden ones
  function multiSelectSourceTracks() {
    const fav = multiSel.context === 'favorites';
    const pl = fav ? null : state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    const all = fav ? state.favorites : (pl ? (pl.tracks || []) : []);
    const input = fav ? el.favoritesSearchInput : el.playlistSearchInput;
    const query = input ? normalizeSearch(input.value) : '';
    return query ? all.filter((/** @type {UrielTrack} */ t) => matchesTrackQuery(t, query)) : all;
  }

  // ---- "Available offline": the small arrow before a song's artist, like Spotify's ----
  // A song plays without internet when it's a local file, in the Downloads folder, or in the offline cache (songs
  // kept from playing them). Local songs are marked at once; for the others server.js is asked in one batch per
  // drawn list, and the answer is remembered until something changes (a download, a cleared cache).
  const offlineKey = (/** @type {UrielTrack} */ t) => (t ? (getTrackCanonicalId(t) || `${t.artist || ''}|${t.title || ''}`) : '');
  const offlineState = (/** @type {UrielTrack} */ t) => !!t && (t.platform === 'local' || offlineKnown.get(offlineKey(t)) === true);
  function checkOffline(/** @type {UrielTrack[]} */ tracks) {
    for (const t of tracks || []) {
      if (!t || t.platform === 'local') continue;
      const key = offlineKey(t);
      if (key && !offlineKnown.has(key)) offlinePending.set(key, t);
    }
    if (!offlinePending.size || offlineTimer || !state.serverPort) return;
    // one request for everything drawn in this moment (several lists can render together)
    offlineTimer = window.setTimeout(async () => {
      offlineTimer = 0;
      const batch = [...offlinePending.entries()].slice(0, 200);
      batch.forEach(([k]) => offlinePending.delete(k));
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/downloaded-status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: batch.map(([, t]) => ({ id: t.id || '', title: t.title || '', artist: t.artist || '', duration: Number(t.duration) || 0 })) }),
        });
        const data = await res.json();
        if (data && data.success && Array.isArray(data.downloaded)) {
          batch.forEach(([k, t], i) => { offlineKnown.set(k, !!data.downloaded[i]); offlineSeen.set(k, t); if (data.downloaded[i]) showOfflineBadges(k, true); });
          capMap(offlineKnown, 5000);
          capMap(offlineSeen, 5000);
          // the songs on the device changed since earlier answers (a scan finished, a song was imported)
          if (data.localVersion !== undefined) {
            if (offlineLocalVersion !== null && data.localVersion !== offlineLocalVersion) recheckOffline();
            offlineLocalVersion = data.localVersion;
          }
        }
      } catch (e) {}
      if (offlinePending.size) checkOffline([]);
    }, 60);
  }
  // songs found on the device (local-match.js on the server) count as offline: when that list changes, the
  // songs answered "not offline" are asked about again
  function recheckOffline() {
    const again = [];
    for (const [k, on] of offlineKnown) if (on === false) { offlineKnown.delete(k); if (offlineSeen.has(k)) again.push(offlineSeen.get(k)); }
    if (again.length) checkOffline(again);
  }
  window.addEventListener('uriel:device-music', recheckOffline);
  // computers scan the Music folder after start-up and on every change in it: look again when the app gets focus
  async function checkLocalVersion() {
    if (!state.serverPort || offlineLocalVersion === null) return;
    try {
      const data = await (await fetch(`http://127.0.0.1:${state.serverPort}/api/device-music`)).json();
      if (data && data.localVersion !== undefined && data.localVersion !== offlineLocalVersion) {
        offlineLocalVersion = data.localVersion;
        recheckOffline();
      }
    } catch (e) {}
  }
  window.addEventListener('focus', checkLocalVersion);
  setTimeout(checkLocalVersion, 15000);
  function showOfflineBadges(/** @type {string} */ key, /** @type {boolean} */ on) {
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.offline-badge[data-offline-key]')).forEach((b) => { if (b.dataset.offlineKey === key) b.hidden = !on; });
  }
  // something changed: this song (downloaded, removed) or everything (offline library cleared)
  /** @param {UrielTrack} [track] @param {boolean} [on] */
  function offlineChanged(track, on) {
    if (!track) { offlineKnown.clear(); /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.offline-badge[data-offline-key]')).forEach((b) => { b.hidden = !b.hasAttribute('data-local'); }); return; }
    const key = offlineKey(track);
    if (on === undefined) offlineKnown.delete(key); else { offlineKnown.set(key, on); showOfflineBadges(key, on); }
  }

  function createTrackRow(/** @type {UrielTrack} */ track, /** @type {number} */ idx, /** @type {string} */ currentCanonicalId, /** @type {string} */ context, /** @type {UrielTrack[]} */ tracks, /** @type {HTMLElement} */ container) {
      const row = document.createElement('div');
      row.className = 'track-row';
      row.tabIndex = 0;
      const canonicalId = getTrackCanonicalId(track);
      row.dataset.canonicalId = canonicalId;
      row.dataset.trackIndex = String(idx);
      if (context === 'queue' && idx < state.queueIndex) row.classList.add('queue-played');
      row.dataset.trackId = track.id || '';
      row.dataset.trackTitle = track.title || '';
      row.dataset.trackArtist = track.artist || '';

      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });

      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openTrackContextMenu(e.clientX, e.clientY, track, context, row);
      });

      const isMatch = currentCanonicalId && canonicalId === currentCanonicalId;
      if (isMatch) {
        if (state.currentTrackContext === context && state.currentTrackIndexInContext >= 0) {
          if (state.currentTrackIndexInContext === idx) {
            row.classList.add('playing');
          }
        } else {
          row.classList.add('playing');
        }
      }

      const isFav = isFavoriteSong(track);
      const rowThumb = getTrackThumbUrl(track);
      const rowListThumb = listThumb(rowThumb) || '';
      const isAlbum = context === 'album';
      const albumArtist = (track.albumArtist || '').trim().toLowerCase();
      const trackArtist = (track.artist || '').trim().toLowerCase();
      const showArtist = isAlbum ? (Boolean(trackArtist) && Boolean(albumArtist) && trackArtist !== albumArtist) : true;
      // [E] before the artist (Settings > Tracks > Show explicit tag hides it)
      const explicitTag = window.UrielLibrary && window.UrielLibrary.isTrackExplicit(track) ? '<span class="explicit-badge" title="Explicit">E</span>' : '';
      // the "plays without internet" mark (offlineBadge): shown now for local songs, after a check for the others
      const offline = offlineState(track);
      const offlineTag = `<span class="offline-badge" title="Available offline" data-i18n-attr="title" data-offline-key="${escapeHtml(offlineKey(track))}"${track.platform === 'local' ? ' data-local' : ''}${offline ? '' : ' hidden'}>${OFFLINE_ICON}</span>`;
      const artistSpan = showArtist ? `<span class="track-row-artist" title="View artist" data-i18n-attr="title">${escapeHtml(track.artist || 'unknown artist')}</span>` : '';

      row.innerHTML = `
      <span class="track-row-index">${(isAlbum && track.no) ? track.no : (idx + 1)}</span>
      ${!isAlbum ? `<img class="track-row-thumb${shownThumbs.has(rowListThumb) ? ' is-loaded' : ''}" src="${escapeHtml(rowListThumb)}" data-full="${escapeHtml(rowThumb || '')}" data-saved="${escapeHtml(track.thumbnail || '')}" data-art="${escapeHtml(JSON.stringify(trackArtCandidates(track)))}" alt="" onerror="${THUMB_FALLBACK}">` : ''}
      <div class="track-row-info">
      <span class="track-row-title">${escapeHtml(rowTitle(track))}</span>
      <span class="track-row-artist-wrap">${offlineTag}${explicitTag}${artistSpan}</span>
      </div>
      <span class="track-row-duration">${formatDuration(track.duration)}</span>
      <div class="track-row-actions">
      <button class="btn-icon-pill btn-row-fav" title="Favorite" data-i18n-attr="title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
      </button>
      <button class="btn-icon-pill btn-row-art" title="Customize cover & banner" data-i18n-attr="title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
      </button>
      <button class="btn-icon-pill btn-row-add-playlist" title="Add to playlist" data-i18n-attr="title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      ${track.platform === 'local' ? `
      <button class="btn-icon-pill btn-row-remove-local delete-btn" title="${track.source && track.source !== 'imported' ? 'Remove from My files (the file stays on this device)' : 'Remove from library'}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
      </button>` : `
      <button class="btn-icon-pill btn-row-more" title="Download and more">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle><circle cx="5" cy="12" r="2"></circle></svg>
      </button>`}
      ${context === 'playlist' ? `
        <button class="btn-icon-pill btn-row-remove-playlist delete-btn" title="Remove from playlist">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>` : ''}
        </div>
        `;

        if (canReorder(context)) row.appendChild(dragGrip());

        if (multiSel.active && multiSel.context === context) {
          const chk = document.createElement('span');
          chk.className = 'track-row-check';
          chk.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          row.insertBefore(chk, row.firstChild);
          row.classList.add('selectable');
          if (multiSel.tracks.has(canonicalId)) row.classList.add('selected');
        }

        row.addEventListener('click', (e) => {
          if (/** @type {HTMLElement} */ (e.target).closest('.track-row-actions')) return;
          if (multiSel.active && multiSel.context === context) {
            toggleTrackSelection(track, row);
            return;
          }
          if (/** @type {HTMLElement} */ (e.target).classList.contains('track-row-artist')) {
            e.stopPropagation();
            openTrackArtist(track);
            return;
          }
          let clickIndex = idx;
          let currentList = tracks;
          // the row's own object first: with a song in the list twice, the second copy played from the first
          const indexIn = (/** @type {UrielTrack[]} */ list) => { const i = list.indexOf(track); return i >= 0 ? i : list.findIndex((/** @type {UrielTrack} */ t) => isSameTrack(t, track)); };
          if (context === 'favorites') {
            currentList = sortTracksFor('favorites', state.favorites);
            clickIndex = indexIn(currentList);
          } else if (context === 'playlist') {
            const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
            if (pl && pl.tracks) {
              currentList = sortTracksFor('playlist', pl.tracks);
              clickIndex = indexIn(currentList);
            }
          } else if (context === 'artist') {
            const artistTracks = (state.currentArtistData && state.currentArtistData.tracks) || tracks;
            if (artistTracks) {
              currentList = artistTracks;
              clickIndex = indexIn(artistTracks);
            }
          } else if (context === 'queue') {
            // the queue as it is now: the rendered list could predate "Play next", and replaying it dropped that song
            currentList = state.queue;
            clickIndex = indexIn(currentList);
          }
          playTrack(track, currentList, clickIndex >= 0 ? clickIndex : idx, context);
        });

        // A finger tap gets moved onto the nearest element that listens for clicks, and only the buttons did,
        // so a tap on a short song title on a phone hit the heart. Listening here makes the title area its own
        // target; the click still bubbles to the row above, which plays the song.
        if (isPhoneApp) {
          const info = row.querySelector('.track-row-info');
          if (info) info.addEventListener('click', () => {});
        }

        const btnFav = row.querySelector('.btn-row-fav');
        if (btnFav) {
          btnFav.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavoriteTrack(track);
            const isFavNow = isFavoriteSong(track);
            const svg = btnFav.querySelector('svg');
            if (svg) svg.setAttribute('fill', isFavNow ? 'currentColor' : 'none');
          });
        }

        const btnArt = /** @type {HTMLElement | null} */ (row.querySelector('.btn-row-art'));
        if (btnArt) {
          btnArt.addEventListener('click', (e) => {
            e.stopPropagation();
            openTrackArtModal(track, btnArt);
          });
        }

        const btnMore = row.querySelector('.btn-row-more');
        if (btnMore) {
          btnMore.addEventListener('click', (e) => {
            e.stopPropagation();
            // phones have no right-click: "..." opens the song's menu there (Download is one of its items)
            if (isPhoneApp) {
              const r = btnMore.getBoundingClientRect();
              openTrackContextMenu(r.right, r.bottom, track, context, row);
              return;
            }
            openDownloadModal(track);
          });
        }

        const btnAddPl = row.querySelector('.btn-row-add-playlist');
        if (btnAddPl) {
          btnAddPl.addEventListener('click', (e) => {
            e.stopPropagation();
            openAddToPlaylistModal(track);
          });
        }

        const btnRemPl = row.querySelector('.btn-row-remove-playlist');
        if (btnRemPl) {
          btnRemPl.addEventListener('click', (e) => {
            e.stopPropagation();
            removeTrackFromCurrentPlaylist(track);
          });
        }

        const btnRemLocal = row.querySelector('.btn-row-remove-local');
        if (btnRemLocal) {
          btnRemLocal.addEventListener('click', async (e) => {
            e.stopPropagation();
            const keepsFile = track.source && track.source !== 'imported';
            const ask = keepsFile
              ? Tf('Remove "{0}" from My files? The file stays on this device.', track.title || '')
              : Tf('Remove "{0}" from My files? Uriel\'s copy of the file is deleted.', track.title || '');
            if (!window.confirm(ask)) return;
            try {
              const removed = await fetch(`http://127.0.0.1:${state.serverPort}/api/library-remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: track.id })
              });
              // the server refused: keep the row, it would come back on the next refresh anyway
              if (!removed.ok) throw new Error(`library-remove answered ${removed.status}`);
              if (Array.isArray(state.localTracks)) {
                state.localTracks = state.localTracks.filter(t => t.id !== track.id);
              }
              if (Array.isArray(tracks)) {
                const tIdx = tracks.findIndex(t => isSameTrack(t, track));
                if (tIdx !== -1) tracks.splice(tIdx, 1);
              }
              updateLocalBadge();
              row.remove();
              if (state.currentView === 'local') {
                if (!state.localTracks || state.localTracks.length === 0) {
                  renderLocalView();
                } else if (el.localSubtitle) {
                  const query = el.localSearchInput ? el.localSearchInput.value.trim().toLowerCase() : '';
                  el.localSubtitle.textContent = query
                    ? `${tracks.length} of ${state.localTracks.length} songs`
                    : `${state.localTracks.length} songs in library`;
                }
              }
              showToast(Tm('Removed from library'));
            } catch (err) {
              console.warn('Remove local track error:', err);
              showToast(Tm("Couldn't remove from library"), 'error');
            }
          });
        }
        
      return row;
  }

  /** @type {HTMLElement | null} */
  let trackMenuEl = null;

  function closeTrackContextMenu() {
    if (trackMenuEl) {
      trackMenuEl.remove();
      trackMenuEl = null;
    }
  }

  // ---------- blocked artists and songs (from Riff 43.1; matching in library-pages.js) ----------
  // Skipped when the queue moves on (a blocked song still plays when tapped), kept out of My Wave, the mixes and
  // For you. Per profile, and the same on linked devices (sync.js).
  const BLOCKED_ARTISTS_KEY = 'uriel_blocked_artists';
  const BLOCKED_SONGS_KEY = 'uriel_blocked_tracks';
  // parsed again only when the stored text changed (a linked device or another profile wrote it)
  /** @type {{ rawA: string | null, rawS: string | null, artists: string[], songs: UrielTrack[] } | null} */
  let blocksCache = null;
  function getBlocks() {
    let rawA = '', rawS = '';
    try { rawA = localStorage.getItem(BLOCKED_ARTISTS_KEY) || ''; rawS = localStorage.getItem(BLOCKED_SONGS_KEY) || ''; } catch (e) {}
    if (blocksCache && blocksCache.rawA === rawA && blocksCache.rawS === rawS) return blocksCache;
    const parse = (/** @type {string | null} */ raw) => { try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
    blocksCache = { rawA, rawS, artists: parse(rawA).filter((a) => typeof a === 'string'), songs: parse(rawS).filter((t) => t && typeof t === 'object') };
    return blocksCache;
  }
  function isBlocked(/** @type {UrielTrack} */ track) {
    const b = getBlocks();
    return (b.artists.length > 0 || b.songs.length > 0) && Lib.isTrackBlocked(b, track);
  }
  function saveBlocks(/** @type {string} */ key, /** @type {unknown[]} */ list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
    blocksCache = null;
    renderBlockedSettings();
    updateArtistBlockButton();
  }
  function toggleBlockArtist(/** @type {string} */ name) {
    const r = Lib.toggleBlockedArtist(getBlocks().artists, name);
    saveBlocks(BLOCKED_ARTISTS_KEY, r.list);
    showToast(Tm(r.blocked ? 'Blocked {0}: their songs are skipped' : 'Unblocked {0}', name), 'info');
  }
  function toggleBlockSong(/** @type {UrielTrack} */ track) {
    const r = Lib.toggleBlockedSong(getBlocks().songs, track);
    saveBlocks(BLOCKED_SONGS_KEY, r.list);
    showToast(Tm(r.blocked ? 'Blocked "{0}": it is skipped' : 'Unblocked "{0}"', track.title || ''), 'info');
  }
  // Settings > Tracks: what is blocked, a tap unblocks it
  function renderBlockedSettings() {
    const box = document.getElementById('blocked-items-list');
    if (!box) return;
    const { artists, songs } = getBlocks();
    box.textContent = '';
    if (!artists.length && !songs.length) {
      const none = document.createElement('span');
      none.className = 'blocked-empty';
      I18N.text(none, 'Nothing blocked. Block an artist or a song from its menu or the artist page.');
      box.appendChild(none);
      return;
    }
    const pill = (/** @type {string} */ label, /** @type {string} */ kind, /** @type {() => void} */ run) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'blocked-item-pill';
      b.title = T('Unblock');
      const name = document.createElement('span');
      name.className = 'blocked-item-name';
      name.textContent = label;
      const tag = document.createElement('span');
      tag.className = 'blocked-item-kind';
      I18N.text(tag, kind);
      b.append(name, tag);
      b.insertAdjacentHTML('beforeend', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>');
      b.addEventListener('click', run);
      box.appendChild(b);
    };
    artists.forEach((/** @type {string} */ a) => pill(a, 'Artist', () => toggleBlockArtist(a)));
    songs.forEach((/** @type {UrielTrack} */ t) => pill(t.artist ? `${t.title} · ${t.artist}` : t.title || '', 'Song', () => toggleBlockSong(t)));
  }
  renderBlockedSettings();

  // one index of the favourites, rebuilt when the list changes (track-sort.js favoriteIndex)
  /** @type {{ list: UrielTrack[], length: number, first: UrielTrack | undefined, last: UrielTrack | undefined, index: ReturnType<typeof favoriteIndex> } | null} */
  var favIndexCache = null;
  // an edit in the middle of the list (a renamed song, Sync) keeps its length and ends: start over on any library change
  window.addEventListener('uriel:library', () => { favIndexCache = null; });
  function isFavoriteSong(/** @type {UrielTrack} */ track) {
    const list = state.favorites || [];
    let c = favIndexCache;
    if (!c || c.list !== list || c.length !== list.length || c.first !== list[0] || c.last !== list[list.length - 1]) {
      c = favIndexCache = { list, length: list.length, first: list[0], last: list[list.length - 1], index: favoriteIndex(list) };
    }
    return c.index.has(track);
  }

  function openTrackContextMenu(/** @type {number} */ x, /** @type {number} */ y, /** @type {UrielTrack} */ track, /** @type {string} */ context, /** @type {HTMLElement} */ row) {
    closeTrackContextMenu();
    const isFav = isFavoriteSong(track);
    /** @type {{ label: string, run: () => void, danger?: boolean }[]} */
    const items = [
      { label: 'Play', run: () => row.click() },
      { label: 'Play next', run: () => {
        if (!state.queue.length || state.queueIndex < 0) { playTrack(track); return; }
        // in place: the queue stays the same array, so a My Wave top-up still loading for it keeps going
        for (let i = state.queue.length - 1; i > state.queueIndex; i--) {
          if (isSameTrack(state.queue[i], track)) state.queue.splice(i, 1);
        }
        state.queue.splice(state.queueIndex + 1, 0, track);
        updateQueueBadge();
        showToast(Tm('Playing next'), 'success');
      } },
      { label: 'Add to queue', run: () => {
        // only songs still to come count: one that already played is queued again
        const upcoming = state.queue.findIndex((/** @type {UrielTrack} */ t, /** @type {number} */ i) => i > state.queueIndex && isSameTrack(t, track));
        if (upcoming >= 0 || (state.queue[state.queueIndex] && isSameTrack(state.queue[state.queueIndex], track))) {
          showToast(Tm('Already in the queue'), 'info');
          return;
        }
        state.queue.push(track);
        updateQueueBadge();
        showToast(Tm('Added to queue'), 'success');
      } },
      ...(songRadioEnabled() ? [{ label: 'Start radio', run: () => startSongRadio([track]) }] : []),
      { label: 'Add to playlist…', run: () => openAddToPlaylistModal(track) },
      { label: isFav ? 'Remove from favorites' : 'Add to favorites', run: () => {
        toggleFavoriteTrack(track);
        const on = isFavoriteSong(track);
        const svg = row.querySelector('.btn-row-fav svg');
        if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
      } }
    ];
    if (track.artist && !/^unknown artist$/i.test(track.artist)) {
      items.push({ label: 'Go to artist', run: () => openTrackArtist(track) });
    }
    if (track.platform !== 'local') {
      items.push({ label: 'Download…', run: () => openDownloadModal(track) });
    }
    if (track.platform !== 'local') {
      items.push({ label: 'Share…', run: () => sharePlaylist({ name: [track.title, track.artist].filter(Boolean).join(' · ') || 'A song', tracks: [track] }) });
      if (track.url) items.push({ label: 'Copy song link', run: async () => { const ok = await copyText(track.url || ''); showToast(ok ? Tm('Link copied') : Tm("Couldn't copy the link"), ok ? 'success' : 'error'); } });
    }
    if (context === 'playlist') {
      items.push({ label: 'Remove from playlist', danger: true, run: () => removeTrackFromCurrentPlaylist(track) });
    }
    if (track.title) {
      items.push({ label: Lib.isSongBlocked(getBlocks().songs, track) ? 'Unblock song' : 'Block song', run: () => toggleBlockSong(track) });
    }
    if (track.artist && !/^unknown artist$/i.test(track.artist)) {
      const artistName = String(track.artist).split(/\s*(?:,|&|\bfeat\.?|\bft\.?)\s*/i)[0].trim();
      if (artistName) items.push({ label: Lib.isArtistBlocked(getBlocks().artists, artistName) ? 'Unblock artist' : 'Block artist', run: () => toggleBlockArtist(artistName) });
    }

    showActionMenu(x, y, items);
  }

  // a menu of { label, run, danger } at x, y (a song's, a playlist's); the same look and closing rules for all
  function showActionMenu(/** @type {number} */ x, /** @type {number} */ y, /** @type {UrielMenuItem[]} */ items, aboveY = y) {
    closeTrackContextMenu();
    const menu = document.createElement('div');
    menu.className = 'track-context-menu';
    menu.setAttribute('role', 'menu');
    items.forEach((/** @type {UrielMenuItem} */ item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'track-context-item' + (item.danger ? ' danger' : '');
      b.setAttribute('role', 'menuitem');
      b.textContent = T(item.label);
      b.dataset.i18n = '';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTrackContextMenu();
        item.run();
      });
      menu.appendChild(b);
    });
    placeMenu(menu, x, y, aboveY);
    trackMenuEl = menu;
  }

  // Below the point when it fits, above it (aboveY) when not, and scrolling inside when neither: it used to be
  // pushed up over its button, or run off the bottom on a short window. Kept clear of the player bar. Phones get
  // a sheet along the bottom of the screen instead (mobile.css).
  function placeMenu(/** @type {HTMLElement} */ menu, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ aboveY) {
    document.body.appendChild(menu);
    if (isPhoneApp) { menu.classList.add('as-sheet'); return; }
    const bar = /** @type {HTMLElement} */ (document.querySelector('.playbar'));
    const barTop = bar && bar.offsetParent ? bar.getBoundingClientRect().top : window.innerHeight;
    const bottom = Math.min(window.innerHeight, barTop) - 8;
    if (menu.getBoundingClientRect().height > bottom - 8) {
      menu.style.maxHeight = `${Math.max(160, bottom - 8)}px`;
      menu.style.overflowY = 'auto';
    }
    const rect = menu.getBoundingClientRect();
    let top = y;
    if (top + rect.height > bottom) top = aboveY - rect.height >= 8 ? aboveY - rect.height : bottom - rect.height;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }

  document.addEventListener('click', closeTrackContextMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTrackContextMenu(); });
  window.addEventListener('blur', closeTrackContextMenu);
  window.addEventListener('resize', closeTrackContextMenu);
  document.addEventListener('scroll', closeTrackContextMenu, true);

  function renderTracks(/** @type {HTMLElement} */ container, /** @type {UrielTrack[]} */ tracks, context = 'search') {
    if (!container) return;
    
    // the queue scrolls its own box in the drawer, everything else scrolls the main column
    const scrollParent = container.closest('.drawer-queue-scroll') || document.querySelector('.main-content');
    if (container._vScrollHandler && scrollParent) {
      scrollParent.removeEventListener('scroll', container._vScrollHandler);
    }

    // the list keeps its height while it is drawn again: emptied for a moment, the page got shorter and the browser
    // pulled a list scrolled far down back up, so a redraw (Add to queue, shuffle) jumped to other songs
    container.style.minHeight = `${container.offsetHeight}px`;
    container.innerHTML = '';
    
    if (!tracks || tracks.length === 0) {
      container.style.paddingTop = '0px';
      container.style.paddingBottom = '0px';
      /** @type {Record<string, string>} */
      const emptyMessages = {
        search: 'No matching songs. Try a different search',
        favorites: 'No favourites yet. Use the heart on a song to save it',
        playlist: 'This playlist is empty',
        local: 'Your library is empty. Add some music to get started',
        queue: 'Queue is empty. Play a song to start.'
      };
      container.innerHTML = `<div class="empty-hint" data-i18n>${emptyMessages[context] || 'No songs to show'}</div>`;
      container.style.minHeight = '';
      return;
    }

    // the row height is measured, not assumed: phone rows are 60px, and with a fixed 64 the drawn slice drifted
    // 4px per row away from the screen, so a long playlist showed blank space while scrolling (#40)
    let itemHeight = container._rowHeight || 64;
    const overscan = 15;
    function measureRowHeight() {
      const rows = /** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll('.track-row'));
      if (rows.length < 2) return 0;
      const step = rows[1].offsetTop - rows[0].offsetTop;
      return step > 20 && step < 200 ? step : 0;
    }

    function renderChunk() {
      if (!scrollParent || container._isDraggingReorder) return;
      const parentRect = scrollParent.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = containerRect.top - parentRect.top + scrollParent.scrollTop;
      
      const visibleTop = Math.max(0, scrollParent.scrollTop - relativeTop);
      let startIndex = Math.floor(visibleTop / itemHeight) - overscan;
      let endIndex = Math.ceil((visibleTop + scrollParent.clientHeight) / itemHeight) + overscan;
      
      startIndex = Math.floor(startIndex / 5) * 5;
      endIndex = Math.ceil(endIndex / 5) * 5;
      
      startIndex = Math.max(0, startIndex);
      endIndex = Math.min(tracks.length, endIndex);
      
      if (container._lastStartIndex === startIndex && container._lastEndIndex === endIndex) return;
      container._lastStartIndex = startIndex;
      container._lastEndIndex = endIndex;
      
      // keep the rows still in view (their images, focus and listeners stay) and only add or remove the difference
      const currentCanonicalId = state.currentTrack ? getTrackCanonicalId(state.currentTrack) : '';
      const kept = new Map();
      /** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll(':scope > .track-row')).forEach((row) => {
        const idx = Number(row.dataset.trackIndex);
        if (idx >= startIndex && idx < endIndex && !kept.has(idx)) kept.set(idx, row);
        else row.remove();
      });
      const added = [];
      /** @type {Element | null} */
      let cursor = container.firstElementChild;
      for (let idx = startIndex; idx < endIndex; idx++) {
        let row = kept.get(idx);
        if (!row) {
          row = createTrackRow(tracks[idx], idx, currentCanonicalId, context, tracks, container);
          if (container._hasInitialRendered) row.style.animation = 'none';
          added.push(tracks[idx]);
        }
        if (row === cursor) cursor = /** @type {Element} */ (cursor).nextElementSibling;
        else container.insertBefore(row, cursor);
      }
      container.style.paddingTop = `${startIndex * itemHeight}px`;
      container.style.paddingBottom = `${(tracks.length - endIndex) * itemHeight}px`;
      container._hasInitialRendered = true;
      // reading a row's position makes the browser lay out the page right here, while scrolling: rows only change
      // height with the list's width (or when the list is drawn again), so once per width is enough
      const measured = container._rowMeasuredFor === parentRect.width ? 0 : measureRowHeight();
      if (measured) container._rowMeasuredFor = parentRect.width;
      if (measured && Math.abs(measured - itemHeight) > 0.5) {
        itemHeight = measured;
        container._rowHeight = measured;
        container._lastStartIndex = -1;
        container._lastEndIndex = -1;
        renderChunk();
        return;
      }
      highlightPlayingRow();
      checkOffline(added);
    }
    
    container._vScrollHandler = () => {
      if (!container._ticking) {
        window.requestAnimationFrame(() => {
          renderChunk();
          container._ticking = false;
        });
        container._ticking = true;
      }
    };
    
    if (scrollParent) {
       scrollParent.addEventListener('scroll', container._vScrollHandler, { passive: true });
    }
    
    container._hasInitialRendered = false;
    container._rowMeasuredFor = -1;
    container._lastStartIndex = -1;
    container._lastEndIndex = -1;
    renderChunk();
    container.style.minHeight = '';
  }

  function highlightPlayingRow() {
    const currentCanonicalId = state.currentTrack ? getTrackCanonicalId(state.currentTrack) : '';
    const rows = document.querySelectorAll('.track-row');

    if (!currentCanonicalId) {
      rows.forEach(r => r.classList.remove('playing'));
      return;
    }

    const containers = new Set();
    rows.forEach(r => {
      r.classList.remove('playing');
      if (r.parentElement) containers.add(r.parentElement);
    });

    containers.forEach(container => {
      const matches = Array.from(container.querySelectorAll('.track-row')).filter(r => r.dataset.canonicalId === currentCanonicalId);
      if (matches.length === 1) {
        matches[0].classList.add('playing');
      } else if (matches.length > 1) {
        const targetIdx = String(state.currentTrackIndexInContext);
        const exact = matches.find(r => r.dataset.trackIndex === targetIdx);
        if (exact) {
          exact.classList.add('playing');
        } else {
          matches[0].classList.add('playing');
        }
      }
    });
  }

  // ---- the artist page and following artists (app/artist.js) ----
  const artistPart = /** @type {UrielArtistPart} */ ({});
  function compactCount(/** @type {number} */ n) { return artistPart.compactCount(n); }
  function getFollowedArtists() { return artistPart.getFollowedArtists(); }
  function setFollowedArtists(/** @type {{ name: string, [field: string]: unknown }[]} */ list) { return artistPart.setFollowedArtists(list); }
  function openArtistProfile(/** @type {string} */ name, /** @type {{ id?: string, video?: string }} */ o = {}) { return artistPart.openArtistProfile(name, o); }
  function openTrackArtist(/** @type {UrielTrack} */ track) { return artistPart.openTrackArtist(track); }
  function renderAlbumCards(/** @type {HTMLElement} */ container, /** @type {UrielAlbum[]} */ albums, /** @type {(album: UrielAlbum) => string} */ subOf) { return artistPart.renderAlbumCards(container, albums, subOf); }
  function updateFollowButton() { return artistPart.updateFollowButton(); }
  function updateArtistBlockButton() { return artistPart.updateArtistBlockButton(); }
  window.UrielApp.artist({ I18N, Lib, capMap, closeModal, el, escapeHtml, getBlocks, getCoverDominantColors, isPhoneApp, openAlbum, openModal, playTrack, renderFollowedArtists, renderTracks, safeArray, showToast, state, switchView, toggleBlockArtist }, artistPart);

  function toggleFavoriteTrack(/** @type {UrielTrack} */ track) {
    if (!track) return;
    const exists = isFavoriteSong(track);
    
    if (exists) {
      state.favorites = state.favorites.filter((/** @type {UrielTrack} */ f) => !isSameSong(f, track));
    } else {
      state.favorites.unshift(stampAddedAt(track));
    }
    
    localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
    updateFavoritesBadge();
    updateFavoriteIcon();
    if (state.currentView === 'favorites') renderFavoritesView();
  }

  function updateFavoriteIcon() {
    const isFav = !!(state.currentTrack && isFavoriteSong(state.currentTrack));
    if (el.favIcon) el.favIcon.setAttribute('fill', isFav ? 'currentColor' : 'none');
    if (el.tvkFavIcon) el.tvkFavIcon.setAttribute('fill', isFav ? 'currentColor' : 'none');
    if (el.btnTvkFav) {
      el.btnTvkFav.classList.toggle('active', isFav);
      el.btnTvkFav.setAttribute('aria-pressed', String(isFav));
      el.btnTvkFav.disabled = !state.currentTrack;
    }
  }

  function updateFavoritesBadge() {
    if (el.favoritesCount) { el.favoritesCount.textContent = String(state.favorites.length); el.favoritesCount.hidden = !state.favorites.length; }
  }

  /** @type {Record<string, string>} */
  const TRACK_SORT_KEYS = { favorites: 'uriel_favorites_sort', playlist: 'uriel_playlist_sort' };

  function getTrackSortMode(/** @type {string} */ kind) {
    const stored = localStorage.getItem(TRACK_SORT_KEYS[kind]) || '';
    return TRACK_SORT_MODES.includes(stored) ? stored : 'manual';
  }

  function setTrackSortMode(/** @type {string} */ kind, /** @type {string} */ mode) {
    localStorage.setItem(TRACK_SORT_KEYS[kind], TRACK_SORT_MODES.includes(mode) ? mode : 'manual');
  }

  function sortTracksFor(/** @type {string} */ kind, /** @type {UrielTrack[]} */ tracks) {
    return sortTracks(tracks, getTrackSortMode(kind));
  }

  function stampAddedAt(/** @type {UrielTrack} */ track) {
    return { ...track, addedAt: Date.now() };
  }

  function renderFavoritesView() {
    const query = el.favoritesSearchInput ? normalizeSearch(el.favoritesSearchInput.value) : '';
    let filtered = state.favorites;
    if (query) {
      filtered = filtered.filter((/** @type {UrielTrack} */ t) => matchesTrackQuery(t, query));
    }
    filtered = sortTracksFor('favorites', filtered);
    if (el.favoritesSort) { el.favoritesSort.value = getTrackSortMode('favorites'); syncSortDropdown('favorites'); }
    if (el.favoritesSubtitle) el.favoritesSubtitle.textContent = query ? `${filtered.length} of ${state.favorites.length} songs` : `${state.favorites.length} songs saved`;
    if (el.favoritesTracksList) renderTracks(el.favoritesTracksList, filtered, 'favorites');
  }

  if (el.favoritesSearchInput) {
    el.favoritesSearchInput.addEventListener('input', () => renderFavoritesView());
  }

  // Sort menus of Favorites and playlists: a Material dropdown in front of the <select> (still the value), with
  // the select's options, so the list of orders stays in one place (track-sort.js does the sorting)
  // (var: a view can render before this line has run)
  /** @type {Record<string, { dropdown: HTMLElement, menu: HTMLElement, select: HTMLSelectElement, label: HTMLElement | null }>} */
  var sortDropdowns = {};
  function syncSortDropdown(/** @type {string} */ kind) {
    const d = sortDropdowns && sortDropdowns[kind];
    if (!d) return;
    /** @type {NodeListOf<HTMLElement>} */ (d.menu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      const on = opt.dataset.value === d.select.value;
      opt.classList.toggle('selected', on);
      opt.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && d.label) d.label.textContent = opt.textContent;
    });
  }
  function setupSortDropdown(/** @type {string} */ kind, /** @type {HTMLSelectElement} */ selectEl) {
    const dropdown = document.getElementById(`${kind}-sort-dropdown`);
    const trigger = document.getElementById(`${kind}-sort-trigger`);
    const menu = document.getElementById(`${kind}-sort-menu`);
    if (!dropdown || !trigger || !menu || !selectEl) return;
    sortDropdowns[kind] = { dropdown, menu, select: selectEl, label: document.getElementById(`${kind}-sort-label`) };
    menu.innerHTML = '';
    [...selectEl.options].forEach((o) => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'm3-dropdown-option';
      opt.setAttribute('role', 'option');
      opt.dataset.value = o.value;
      opt.textContent = o.textContent;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.remove('open');
        if (selectEl.value !== o.value) {
          selectEl.value = o.value;
          selectEl.dispatchEvent(new Event('change'));
        }
        syncSortDropdown(kind);
      });
      menu.appendChild(opt);
    });
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      Object.values(sortDropdowns).forEach((d) => { if (d.dropdown !== dropdown) d.dropdown.classList.remove('open'); });
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dropdown.classList.remove('open'); });
    syncSortDropdown(kind);
  }

  if (el.favoritesSort) {
    el.favoritesSort.addEventListener('change', () => {
      setTrackSortMode('favorites', el.favoritesSort.value);
      renderFavoritesView();
    });
    el.favoritesSort.value = getTrackSortMode('favorites');
    setupSortDropdown('favorites', el.favoritesSort);
  }

  // Sorting the Albums tab, the playlists list and the Artists tab (#19); track-sort.js does the sorting.
  // Kept per view in localStorage. (var and function declarations: the lists can render before this line runs)
  /** @type {Record<string, string>} */
  var LIBRARY_SORT_KEYS = { albums: 'uriel_albums_sort', playlists: 'uriel_playlists_sort', artists: 'uriel_artists_sort' };
  function getLibrarySort(/** @type {string} */ kind) {
    let v = null;
    try { v = localStorage.getItem((LIBRARY_SORT_KEYS || {})[kind] || ''); } catch (e) {}
    return librarySortMode(kind, v || '');
  }
  /** @template {{ name: string }} I @param {string} kind @param {I[]} items */
  function sortedLibrary(kind, items) {
    return sortLibrary(kind, items, getLibrarySort(kind), kind === 'artists' ? { plays: (a) => artistPlays(a.name) } : {});
  }
  ['albums', 'playlists', 'artists'].forEach((kind) => {
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById(`${kind}-sort`));
    if (!sel) return;
    sel.value = getLibrarySort(kind);
    sel.addEventListener('change', () => {
      try { localStorage.setItem(LIBRARY_SORT_KEYS[kind], librarySortMode(kind, sel.value)); } catch (e) {}
      syncSortDropdown(kind);
      if (kind === 'albums') renderSavedAlbums();
      else if (kind === 'artists') renderArtistsTab();
      else renderPlaylistsList();
    });
    setupSortDropdown(kind, sel);
  });

  function renderHistoryView() {
    if (el.historyTracksList) renderTracks(el.historyTracksList, state.history, 'history');
  }

  let queueRerender = 0;
  function updateQueueBadge() {
    window.dispatchEvent(new Event('uriel:queue'));
    if (el.queueCount) { el.queueCount.textContent = String(state.queue.length); el.queueCount.style.display = state.queue.length ? 'inline-block' : 'none'; }
    scheduleQueueSave();
    // an open queue list kept showing the old order after Play next / Add to queue
    if (!queueRerender && (state.currentView === 'queue' || (state.isRightPanelOpen && state.drawerTab === 'queue'))) {
      queueRerender = requestAnimationFrame(() => {
        queueRerender = 0;
        const list = /** @type {HTMLElement} */ (el.queueTracksList);
        // a plain skip keeps the same queue (the row highlight follows on its own); only redraw when it changed
        if (list && (list._renderedQueue !== state.queue || list._renderedLen !== state.queue.length)) renderQueueView();
        else if (list) /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll(':scope > .track-row')).forEach((r) => r.classList.toggle('queue-played', Number(r.dataset.trackIndex) < state.queueIndex));
      });
    }
  }

  function renderQueueView() {
    if (!el.queueTracksList) return;
    renderTracks(el.queueTracksList, state.queue, 'queue');
    el.queueTracksList._renderedQueue = state.queue;
    el.queueTracksList._renderedLen = state.queue.length;
  }

  function updateLocalBadge() {
    if (el.localCount) { const n = (state.localTracks && state.localTracks.length) || 0; el.localCount.textContent = String(n); el.localCount.hidden = !n; }
  }

  // The server looks up missing covers in the background; pick them up while the library is open.
  /** @type {ReturnType<typeof setTimeout> | null} */
  let localCoverRefreshTimer = null;
  let localCoverRefreshCount = 0;
  function scheduleLocalCoverRefresh() {
    if (localCoverRefreshTimer) clearTimeout(localCoverRefreshTimer);
    localCoverRefreshTimer = null;
    const missing = (state.localTracks || []).filter((/** @type {UrielTrack} */ t) => !t.thumbnail).length;
    if (!missing) { localCoverRefreshCount = 0; return; }
    if (localCoverRefreshCount >= 40) return;
    localCoverRefreshTimer = setTimeout(async () => {
      localCoverRefreshTimer = null;
      if (state.currentView !== 'local') return;
      localCoverRefreshCount++;
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/library`);
        const fresh = await res.json();
        const before = (state.localTracks || []).filter((/** @type {UrielTrack} */ t) => t.thumbnail).length;
        const after = fresh.filter((/** @type {UrielTrack} */ t) => t.thumbnail).length;
        if (after !== before) {
          state.localTracks = fresh;
          renderLocalView(false);
          return;
        }
      } catch (e) {}
      scheduleLocalCoverRefresh();
    }, 15000);
  }

  async function renderLocalView(forceFetch = true) {
    if (forceFetch || !state.localTracks) {
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/library`);
        state.localTracks = await res.json();
      } catch (e) {
        if (!Array.isArray(state.localTracks)) state.localTracks = [];
      }
    }
    updateLocalBadge();
    scheduleLocalCoverRefresh();
    const query = el.localSearchInput ? normalizeSearch(el.localSearchInput.value) : '';
    let filtered = state.localTracks || [];
    if (query) {
      filtered = filtered.filter((/** @type {UrielTrack} */ t) => matchesTrackQuery(t, query));
    }
    if (el.localSubtitle) {
      el.localSubtitle.textContent = query
        ? `${filtered.length} of ${state.localTracks.length} songs`
        : `${state.localTracks.length} songs in library`;
    }
    if (el.localTracksList) {
      if (!state.localTracks || state.localTracks.length === 0) {
        el.localTracksList.style.paddingTop = '0px';
        el.localTracksList.style.paddingBottom = '0px';
        el.localTracksList.innerHTML = `
          <div class="empty-hint" style="display:flex;flex-direction:column;align-items:center;gap:12px;">
            <span data-i18n>No local tracks in library yet.</span>
            <button class="btn-pill-primary" id="btn-add-local-files-empty" data-i18n>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add files
            </button>
          </div>`;
        const emptyBtn = el.localTracksList.querySelector('#btn-add-local-files-empty');
        if (emptyBtn) emptyBtn.addEventListener('click', () => importLocalFiles());
      } else {
        renderTracks(el.localTracksList, filtered, 'local');
      }
    }
  }

  if (el.localSearchInput) {
    el.localSearchInput.addEventListener('input', () => renderLocalView(false));
  }

  /** @param {{ folder?: boolean }} [opts] */

  async function importLocalFiles(opts) {
    if (!window.electronAPI || !window.electronAPI.importAudioFiles) return;
    try {
      const items = await window.electronAPI.importAudioFiles(opts && opts.folder ? { folder: true } : undefined);
      if (!items || items.length === 0) return;

      await fetch(`http://127.0.0.1:${state.serverPort}/api/library-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });

      if (state.currentView === 'local') renderLocalView(true);

      let idx = 0;
      async function worker() {
        while (idx < items.length) {
          const item = items[idx++];
          if (!item || !item.id) continue;
          await new Promise((/** @type {(value?: void) => void} */ resolve) => {
            const url = tokenUrl(`http://127.0.0.1:${state.serverPort}/api/library-file?id=${encodeURIComponent(item.id)}`);
            // set src after construction: new Audio(url) skips the phone bridge's src rewrite
            const a = new Audio();
            a.preload = 'metadata';
            a.src = url;
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              a.src = '';
              resolve();
            };
            a.onloadedmetadata = async () => {
              const dur = Math.round(a.duration || 0);
              if (dur > 0) {
                try {
                  await fetch(`http://127.0.0.1:${state.serverPort}/api/library-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: item.id, duration: dur })
                  });
                } catch (e) {}
              }
              finish();
            };
            a.onerror = () => finish();
            setTimeout(finish, 5000);
          });
        }
      }
      // one at a time on phones: each probe can pull a whole (lossless, so big) file into memory there
      await Promise.all(isPhoneApp ? [worker()] : [worker(), worker()]);

      await renderLocalView(true);
      showToast(Tm('Added {0} songs', items.length));
    } catch (e) {
      console.warn('Import audio files error:', e);
    }
  }

  // Small-list art: a 44px row doesn't need a 720p frame decoded into RAM (~1.1 MB each).
  // Falls back to the full URL via data-full if the small variant 404s.
  function listThumb(/** @type {string} */ url) {
    if (!url || !getAdv('light_thumbs', true)) return url;
    const yt = url.match(/^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{6,})\//);
    if (yt) return `https://i.ytimg.com/vi/${yt[1]}/mqdefault.jpg`;
    if (/(googleusercontent|ggpht)\.com/.test(url)) return url.replace(/=w\d+-h\d+[^&?]*$/, '=w120-h120-l90-rj').replace(/=s\d+[^&?]*$/, '=s120');
    if (/sndcdn\.com/.test(url)) return url.replace(/-(t500x500|original|crop)\./, '-t300x300.');
    return url;
  }

  // Cover art (#18). Many saved songs (synced, restored, imported, matched on play) carry no thumbnail or a
  // dead one, and the row just hid its picture. A YouTube song's cover can always be derived from its id, and a
  // failed picture walks down a list of candidates instead of giving up.
  const YT_THUMB = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//;
  function trackYoutubeId(/** @type {UrielTrack} */ track) {
    if (!track) return '';
    const p = String(track.platform || '').toLowerCase();
    if (p === 'local' || p === 'soundcloud' || p === 'sc') return '';
    const m = String(track.url || track.videoId || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return m[1];
    if (/^[\w-]{11}$/.test(String(track.videoId || ''))) return track.videoId;
    if ((p === 'youtube' || p === 'ytmusic' || p === 'yt' || (!p && !track.url)) && /^[\w-]{11}$/.test(String(track.id || ''))) return String(track.id);
    return '';
  }
  // YouTube's 4:3 frames (hqdefault, sddefault, default, 0-3) have black bars baked in above and below the 16:9
  // video, and a square cover showed them, around the video's own side panels (#31). The 16:9 frames have no
  // bars, and their middle square is the artwork of an album-art video: maxresdefault, else mqdefault (always there).
  const YT_BOXED = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/(?:hqdefault|sddefault|default|[0-3])\.(?:jpg|webp)(?:\?.*)?$/;
  function unboxedYt(/** @type {string | undefined} */ url) {
    const m = typeof url === 'string' ? url.match(YT_BOXED) : null;
    return m ? `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg` : url;
  }
  // a missing maxresdefault is YouTube's 120x90 grey stand-in, which loads fine (no error): use mqdefault
  document.addEventListener('load', (e) => {
    const img = /** @type {HTMLImageElement} */ (e.target);
    if (!img || img.tagName !== 'IMG' || img.naturalWidth > 120) return;
    const m = (img.getAttribute('src') || '').match(/^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/(?:maxresdefault|sddefault)\./);
    if (m) img.src = `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg`;
  }, true);
  // a widescreen music video has black bars inside its own 16:9 frame, which a square cover showed as bands above
  // and below the picture (#31). The bars are found on a small copy of the frame and cut off with object-view-box
  // (Chromium only: Android and computers; elsewhere the cover stays as it was).
  const ytBars = new Map();
  function findYtBars(/** @type {string} */ id) {
    if (ytBars.has(id)) return ytBars.get(id);
    const job = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const W = 64, H = 36;
          const c = document.createElement('canvas');
          c.width = W; c.height = H;
          const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
          ctx.drawImage(img, 0, 0, W, H);
          const px = ctx.getImageData(0, 0, W, H).data;
          const dark = (/** @type {number} */ y) => {
            let n = 0;
            for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (Math.max(px[i], px[i + 1], px[i + 2]) < 28) n++; }
            return n >= W * 0.75; // a dark scene can run into the bar, so a bar row is mostly black, not all
          };
          let top = 0, bottom = 0;
          while (top < H / 2 && dark(top)) top++;
          while (bottom < H / 2 && dark(H - 1 - bottom)) bottom++;
          // both edges dark and the bars a similar size: a letterbox, not just a dark sky or a dark floor
          const ok = top >= 2 && bottom >= 2 && Math.abs(top - bottom) <= 2 && top + bottom < H * 0.6;
          resolve(ok ? { top: (top / H) * 100, bottom: (bottom / H) * 100 } : null);
        } catch (e) { resolve(null); }
      };
      img.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    });
    ytBars.set(id, job);
    return job;
  }
  const YT_WIDE = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/(?:mqdefault|maxresdefault|hq720)\./;
  if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('object-view-box', 'inset(0%)')) {
    document.addEventListener('load', (e) => {
      const img = /** @type {HTMLImageElement} */ (e.target);
      if (!img || img.tagName !== 'IMG') return;
      const m = (img.getAttribute('src') || '').match(YT_WIDE);
      img.style.objectViewBox = '';
      if (!m) return;
      const src = img.getAttribute('src');
      findYtBars(m[1]).then((/** @type {{ top: number, bottom: number } | null} */ bars) => {
        if (bars && img.getAttribute('src') === src) img.style.objectViewBox = `inset(${bars.top}% 0% ${bars.bottom}% 0%)`;
      });
    }, true);
  }
  // other sizes of a cover we already have (YouTube frames, SoundCloud artwork)
  function artVariants(/** @type {string} */ url) {
    if (!url || typeof url !== 'string') return [];
    const yt = url.match(YT_THUMB);
    if (yt) return ['maxresdefault', 'mqdefault'].map((s) => `https://i.ytimg.com/vi/${yt[1]}/${s}.jpg`);
    if (/sndcdn\.com\/.*-(t500x500|original|large|crop|t300x300)\./.test(url)) return ['t500x500', 'large', 't300x300'].map((s) => url.replace(/-(t500x500|original|large|crop|t300x300)\./, `-${s}.`));
    return [];
  }
  function derivedTrackArt(/** @type {UrielTrack} */ track) {
    const id = trackYoutubeId(track);
    return id ? artVariants(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`) : [];
  }
  // every picture worth trying for a song, best first
  function trackArtCandidates(/** @type {UrielTrack | null} */ track) {
    if (!track) return [];
    /** @type {string[]} */
    const out = [];
    const add = (/** @type {string | undefined} */ raw) => { const u = unboxedYt(raw); if (u && typeof u === 'string' && !out.includes(u)) out.push(u); };
    [getTrackArt(track).cover, track.localThumbnail, track.thumbnail, track.cover, track.image, track.artworkUrl].forEach((u) => { add(u); artVariants(u).forEach(add); });
    derivedTrackArt(track).forEach(add);
    // last: the same picture through the in-app server (kept on disk, so a blocked or dead cover host costs one
    // try), which falls back to the song's iTunes cover by artist and title. Computers only.
    if (!isPhoneApp && state.serverPort && track.title) {
      const first = out.find((u) => /^https?:\/\//.test(u) && !u.startsWith('http://127.0.0.1')) || '';
      add(tokenUrl(`http://127.0.0.1:${state.serverPort}/api/image-proxy?url=${encodeURIComponent(first)}&artist=${encodeURIComponent(track.artist || '')}&title=${encodeURIComponent(track.title)}`));
    }
    return out;
  }

  // next cover to try in a player <img> whose current one failed ('' when none is left)
  function nextPlayerArt(/** @type {UrielTrack} */ track, /** @type {HTMLImageElement} */ img) {
    if (!img || !track) return '';
    if (img.__artTrack !== track) { img.__artTrack = track; img.__artTried = new Set(); }
    const tried = /** @type {Set<string>} */ (img.__artTried);
    const cur = img.getAttribute('src') || '';
    tried.add(cur);
    const next = trackArtCandidates(track).concat(artVariants(cur)).find((u) => !tried.has(u));
    if (!next) return '';
    tried.add(next);
    img.style.display = 'block';
    img.src = next;
    return next;
  }

  function getTrackThumbUrl(/** @type {UrielTrack | null} */ track) {
    if (!track) return '';
    const o = getTrackArt(track).cover;
    if (o) return o;
    if (track.localThumbnail) return track.localThumbnail;
    return unboxedYt(track.thumbnail || track.cover || track.image || track.artworkUrl || derivedTrackArt(track)[0] || '');
  }

  // A song's cover that loaded in place of its saved (missing or dead) one is saved with the song.
  // Saved in one go once the covers stop arriving: saving per cover wrote the whole library again for every row that
  // scrolled into view, and on a phone a long list ran the page out of memory within seconds. A cover not saved
  // before the app closes is just found again next time.
  const rememberedArt = new Map();
  let rememberedArtTimer = 0;
  /** @param {string | undefined} canonicalId @param {string} url */
  function rememberTrackArt(canonicalId, url) {
    if (!canonicalId || !/^https:\/\//.test(url || '')) return;
    if (state.currentTrack && getTrackCanonicalId(state.currentTrack) === canonicalId && !getTrackArt(state.currentTrack).cover) state.currentTrack.thumbnail = url;
    rememberedArt.set(canonicalId, url);
    clearTimeout(rememberedArtTimer);
    rememberedArtTimer = window.setTimeout(saveRememberedArt, 2000);
  }
  function saveRememberedArt() {
    const art = new Map(rememberedArt);
    rememberedArt.clear();
    const fix = (/** @type {UrielTrack[]} */ arr) => {
      let changed = false;
      (arr || []).forEach((/** @type {UrielTrack} */ t) => {
        const url = t && art.get(getTrackCanonicalId(t));
        if (url && t.thumbnail !== url && !getTrackArt(t).cover) { t.thumbnail = url; changed = true; }
      });
      return changed;
    };
    try {
      if (fix(state.favorites)) localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      if (fix(state.history)) localStorage.setItem('devsize_history', JSON.stringify(state.history));
      let pl = false;
      (state.playlists || []).forEach((/** @type {UrielPlaylist} */ p) => { if (p && fix(p.tracks)) pl = true; });
      if (pl) localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    } catch (e) {}
  }

  // onerror of a cover <img>: next candidate (data-full, then data-art, then other sizes), hidden when none is left
  // files named "Artist - Title" keep the artist in the title as well: the row shows it once, under the title
  function rowTitle(/** @type {UrielTrack} */ track) {
    let t = track.title || 'untitled';
    const a = (track.artist || '').trim().toLowerCase();
    if (!a) return t;
    // "Artist - Title", "Artist, Other - Title" or "Artist & Other - Title", sometimes twice over
    for (let i = t.indexOf(' - '); i > 0; i = t.indexOf(' - ')) {
      const head = t.slice(0, i).toLowerCase();
      if (head !== a && !head.startsWith(a + ',') && !head.startsWith(a + ' &')) break;
      t = t.slice(i + 3);
    }
    return t;
  }
  // a song row with no cover left shows a music note on the row's grey square instead of an empty gap
  const NO_COVER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#8a8a8a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(6 6) scale(.5)"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></g></svg>');
  function nextTrackArt(/** @type {HTMLImageElement} */ img) {
    if (!img) return false;
    const tried = /** @type {Set<string>} */ (img.__artTried || (img.__artTried = new Set()));
    const cur = img.getAttribute('src') || '';
    tried.add(cur);
    let list = [];
    try { list = JSON.parse(img.dataset.art || '[]'); } catch (e) {}
    if (img.dataset.full) list.unshift(img.dataset.full);
    list = list.concat(artVariants(cur));
    const next = list.find((/** @type {string} */ u) => u && !tried.has(u));
    if (!next) {
      if (img.classList.contains('track-row-thumb') && cur !== NO_COVER) img.src = NO_COVER;
      else img.style.visibility = 'hidden';
      return false;
    }
    tried.add(next);
    const row = img.closest && /** @type {HTMLElement | null} */ (img.closest('[data-canonical-id]'));
    if (row && !img.__artRemember) {
      img.__artRemember = true;
      img.addEventListener('load', () => {
        const ok = img.getAttribute('src');
        if (img.naturalWidth > 0 && ok && ok !== img.dataset.saved && ok !== NO_COVER) rememberTrackArt(row.dataset.canonicalId, ok);
      });
    }
    img.style.visibility = '';
    img.src = next;
    return true;
  }
  window.urielArtNext = nextTrackArt;
  // Pictures with no onerror of their own (artist photos, album and playlist covers, search results, home cards)
  // showed the browser's broken-image icon when their host failed: try the picture's other sizes, then hide it
  // so the cover's placeholder shows instead
  document.addEventListener('error', (e) => {
    const img = /** @type {HTMLImageElement} */ (e.target);
    if (!img || img.tagName !== 'IMG' || img.onerror || img.hasAttribute('onerror')) return;
    if (!nextTrackArt(img)) img.classList.add('img-failed');
  }, true);

  // Old saves: give YouTube songs without a cover the one derived from their id (no network), once, when idle.
  function backfillTrackArt() {
    const fill = (/** @type {UrielTrack[]} */ arr) => {
      let changed = false;
      (arr || []).forEach((/** @type {UrielTrack} */ t) => {
        if (t && !t.thumbnail && !t.localThumbnail) { const d = derivedTrackArt(t)[0]; if (d) { t.thumbnail = d; changed = true; } }
      });
      return changed;
    };
    try {
      if (fill(state.favorites)) localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      if (fill(state.history)) localStorage.setItem('devsize_history', JSON.stringify(state.history));
      let pl = false;
      (state.playlists || []).forEach((/** @type {UrielPlaylist} */ p) => { if (p && fill(p.tracks)) pl = true; });
      if (pl) localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    } catch (e) {}
  }
  (window.requestIdleCallback || ((f) => setTimeout(f, 3000)))(backfillTrackArt);

  function renderPlaylistCover(/** @type {HTMLElement} */ container, /** @type {UrielPlaylist} */ playlist, size = 64) {
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('playlist-cover-art');

    function renderFallback() {
      container.innerHTML = '';
      container.classList.remove('cover-single', 'cover-empty');
      const tracks = (playlist && playlist.tracks) ? playlist.tracks : [];
      let firstThumb = null;
      let firstTrack = null;
      for (const t of tracks) {
        const src = getTrackThumbUrl(t);
        if (src) {
          firstThumb = src;
          firstTrack = t;
          break;
        }
      }

      if (firstThumb) {
        container.classList.add('cover-single');
        const img = document.createElement('img');
        img.className = 'cover-single-img';
        img.src = firstThumb;
        img.alt = '';
        img.loading = 'lazy';
        img.style.objectFit = 'cover';
        img.dataset.art = JSON.stringify(trackArtCandidates(firstTrack));
        img.onerror = () => {
          if (nextTrackArt(img)) return;
          container.classList.remove('cover-single');
          container.classList.add('cover-empty');
          container.innerHTML = `<svg width="${Math.round(size * 0.45)}" height="${Math.round(size * 0.45)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
        };
        container.appendChild(img);
      } else {
        container.classList.add('cover-empty');
        container.innerHTML = `
          <svg width="${Math.round(size * 0.45)}" height="${Math.round(size * 0.45)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        `;
      }
    }

    if (playlist && playlist.cover && typeof playlist.cover === 'string' && playlist.cover.trim()) {
      container.classList.add('cover-single');
      const img = document.createElement('img');
      img.className = 'cover-single-img';
      img.src = playlist.cover.trim();
      img.alt = '';
      img.loading = 'lazy';
      img.style.objectFit = 'cover';
      img.onerror = () => {
        renderFallback();
      };
      container.appendChild(img);
      return;
    }

    renderFallback();
  }

  // Home: "Your playlists". They only lived in a side drawer, and many people never found them.
  function renderHomePlaylists() {
    const box = document.getElementById('section-home-playlists');
    if (!box) return;
    const lists = state.playlists || [];
    box.innerHTML = `<div class="onrepeat-head"><h3 class="section-title" data-i18n>Your playlists</h3></div><div class="home-pl-row"></div>`;
    const row = /** @type {HTMLElement} */ (box.querySelector('.home-pl-row'));
    const card = (/** @type {string} */ cls, /** @type {() => void} */ onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `home-pl-card ${cls}`;
      b.addEventListener('click', onClick);
      row.appendChild(b);
      return b;
    };
    const add = card('home-pl-new', () => { if (el.btnNewPlaylist) el.btnNewPlaylist.click(); });
    add.innerHTML = `<span class="home-pl-cover"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></span><b data-i18n>New playlist</b><span>${lists.length ? '&nbsp;' : 'Make your first one'}</span>`;
    lists.forEach((/** @type {UrielPlaylist} */ pl) => {
      const b = card('', () => openPlaylistDetail(pl.id));
      const cover = document.createElement('span');
      cover.className = 'home-pl-cover';
      renderPlaylistCover(cover, pl, 150);
      const n = (pl.tracks || []).length;
      b.append(cover);
      b.insertAdjacentHTML('beforeend', `<b>${escapeHtml(pl.name || 'Untitled')}</b><span data-i18n>${n} song${n === 1 ? '' : 's'}</span>`);
    });
  }

  function renderPlaylistsList() {
    renderHomePlaylists();
    if (!el.playlistsList) return;
    el.playlistsList.innerHTML = '';
    if (!state.playlists || state.playlists.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'playlists-empty-note';
      emptyMsg.style.cssText = 'padding: 24px 12px; text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: calc(13px * var(--font-scale, 1));';
      emptyMsg.textContent = 'No playlists yet';
      emptyMsg.dataset.i18n = '';
      el.playlistsList.appendChild(emptyMsg);
      return;
    }
    sortedLibrary('playlists', state.playlists).forEach(pl => {
      const item = document.createElement('div');
      item.className = 'playlist-item';
      item.dataset.playlistId = pl.id;
      if (state.currentView === 'playlist-detail' && state.currentPlaylistId === pl.id) {
        item.classList.add('active');
      }

      const thumbEl = document.createElement('div');
      thumbEl.className = 'playlist-item-thumb';
      renderPlaylistCover(thumbEl, pl, 44);

      const infoEl = document.createElement('div');
      infoEl.className = 'playlist-item-info';
      const trackCount = (pl.tracks || []).length;
      infoEl.innerHTML = `
        <span class="playlist-item-name">${escapeHtml(pl.name || 'untitled')}</span>
        <span class="playlist-item-count" data-i18n>${trackCount} track${trackCount === 1 ? '' : 's'}</span>
      `;

      item.appendChild(thumbEl);
      item.appendChild(infoEl);
      if (canReorder('playlists')) item.appendChild(dragGrip());

      item.addEventListener('click', () => {
        openPlaylistDetail(pl.id);
      });
      el.playlistsList.appendChild(item);
    });
  }

  // Phones move rows by a grip at their end. A held row worked only upwards: moving down, Android took the
  // gesture for a scroll and cancelled the drag (or scrolled the list under it). The grip has touch-action: none,
  // so a finger on it is never a scroll; the rest of the row still scrolls the list and opens the menu on a hold.
  function canReorder(/** @type {string} */ list) {
    if (!isPhoneApp) return false;
    if (list === 'queue') return true;
    if (list === 'playlists') return getLibrarySort('playlists') === 'custom';
    if (list === 'favorites') return !(el.favoritesSearchInput && el.favoritesSearchInput.value.trim()) && getTrackSortMode('favorites') === 'manual';
    if (list === 'playlist') return !(el.playlistSearchInput && el.playlistSearchInput.value.trim()) && getTrackSortMode('playlist') === 'manual';
    return false;
  }
  function dragGrip() {
    const g = document.createElement('span');
    g.className = 'drag-grip';
    g.setAttribute('aria-hidden', 'true');
    g.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"></circle><circle cx="15" cy="6" r="1.6"></circle><circle cx="9" cy="12" r="1.6"></circle><circle cx="15" cy="12" r="1.6"></circle><circle cx="9" cy="18" r="1.6"></circle><circle cx="15" cy="18" r="1.6"></circle></svg>';
    return g;
  }

  /** @param {{ container: HTMLElement, itemSelector: string, setOrder: (fromIdx: number, toIdx: number) => void, canDragItem?: (item: HTMLElement) => boolean, isFilterActive?: () => boolean }} opts */
  function initListReordering({ container, itemSelector, setOrder, canDragItem, isFilterActive }) {
    if (!container) return;

    /** @type {HTMLElement | null} */
    let draggedItem = null;
    let startX = 0;
    let startY = 0;
    /** @type {number | null} */
    let activePointerId = null;
    let isDragging = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    /** @type {ReturnType<typeof setTimeout> | null} */
    let pressTimer = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    /** @type {ReturnType<typeof setInterval> | null} */
    let autoScrollTimer = null;
    let suppressClick = false;
    let startIndex = -1;
    let targetIndex = -1;
    /** @type {{ el: HTMLElement, index: number, top: number, height: number }[]} */
    let itemMetrics = [];
    /** @type {HTMLElement[]} */
    let items = [];
    let draggedHeight = 0;
    let draggedStartTop = 0;
    let isTouch = false;
    // which drag a drop's delayed cleanup belongs to: a new drag can start inside its 160 ms
    let dragGen = 0;
    let lastClientY = 0;
    let startScroll = 0;

    // what really scrolls under the rows, found when a drag starts: the playlists list scrolls itself, inside a
    // drawer that doesn't, so holding a playlist at the list's edge used to scroll nothing
    /** @type {Element | null} */
    let scrollParent = null;
    const scrollerOf = () => {
      for (let n = /** @type {HTMLElement | null} */ (container); n && n !== document.body; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
      }
      return container.closest('.main-content, .rail-drawer') || container;
    };

    window.addEventListener('click', (e) => {
      if (suppressClick) {
        e.stopImmediatePropagation();
        e.preventDefault();
        suppressClick = false;
      }
    }, true);

    const startDrag = () => {
      if (!draggedItem || isDragging) return;
      dragGen++;
      isDragging = true;
      suppressClick = true;
      container._isDraggingReorder = true;
      try {
        if (activePointerId !== null && draggedItem.setPointerCapture) {
          draggedItem.setPointerCapture(activePointerId);
        }
      } catch (e) {}

      container.style.userSelect = 'none';
      draggedItem.classList.add('is-dragging');

      items = Array.from(/** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll(itemSelector))).filter(el => !canDragItem || canDragItem(el));
      startIndex = items.indexOf(draggedItem);
      targetIndex = startIndex;
      draggedHeight = draggedItem.offsetHeight;
      draggedStartTop = draggedItem.offsetTop;
      scrollParent = scrollerOf();
      startScroll = scrollParent.scrollTop;

      itemMetrics = items.map((el, i) => ({
        el,
        index: i,
        top: el.offsetTop,
        height: el.offsetHeight
      }));
    };

    const onPointerDown = (/** @type {PointerEvent} */ e) => {
      if (e.button !== 0) return;
      // a second finger must not hijack a row that is already being moved
      if (draggedItem && isDragging) return;
      if (pressTimer) clearTimeout(pressTimer);
      if (isFilterActive && isFilterActive()) return;

      const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest(itemSelector));
      if (!item || item.parentElement !== container) return;
      if (canDragItem && !canDragItem(item)) return;

      if (/** @type {HTMLElement} */ (e.target).closest('button, input, select, textarea, .btn-icon-pill, .track-fav, .track-download-btn, .btn-rename-p, .btn-delete-p')) return;

      isTouch = e.pointerType === 'touch';
      if (isTouch && !/** @type {HTMLElement} */ (e.target).closest('.drag-grip')) return;
      draggedItem = item;
      startX = e.clientX;
      startY = e.clientY;
      lastClientY = e.clientY;
      activePointerId = e.pointerId;
      isDragging = false;

      if (isTouch) startDrag();
      else pressTimer = setTimeout(startDrag, 250);

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (/** @type {PointerEvent} */ e) => {
      if (!draggedItem) return;

      if (e.pointerId !== activePointerId) return;
      if (!isDragging) {
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist > 7) {
          if (pressTimer) clearTimeout(pressTimer);
          startDrag();
        } else {
          return;
        }
      }

      lastClientY = e.clientY;
      if (scrollParent) {
        const scRect = scrollParent.getBoundingClientRect();
        if (autoScrollTimer) clearInterval(autoScrollTimer);
        // the list scrolls under a row held at its edge, and the row keeps up with it
        const by = e.clientY < scRect.top + 40 ? -8 : e.clientY > scRect.bottom - 40 ? 8 : 0;
        if (by) autoScrollTimer = setInterval(() => { if (scrollParent) scrollParent.scrollTop += by; placeDragged(); }, 16);
      }
      placeDragged();
    };

    const placeDragged = () => {
      if (!draggedItem || !isDragging) return;
      const dy = lastClientY - startY + (scrollParent ? scrollParent.scrollTop - startScroll : 0);
      draggedItem.style.transform = `translate3d(0, ${dy}px, 0) scale(1.02)`;

      if (itemMetrics.length <= 1) return;

      // its new place: after every other row whose middle it has passed. Taking the last row passed was right going
      // down but one place too high going up
      const currentCenter = draggedStartTop + (draggedHeight / 2) + dy;
      let newTarget = 0;
      for (const m of itemMetrics) {
        if (m.el !== draggedItem && currentCenter > m.top + m.height / 2) newTarget++;
      }

      if (newTarget !== targetIndex) {
        targetIndex = newTarget;
        const shiftDistance = (itemMetrics.length > 1 && Math.abs(itemMetrics[1].top - itemMetrics[0].top) > 0)
          ? Math.abs(itemMetrics[1].top - itemMetrics[0].top)
          : draggedHeight;

        itemMetrics.forEach(metric => {
          if (metric.el === draggedItem) return;
          if (startIndex < targetIndex) {
            if (metric.index > startIndex && metric.index <= targetIndex) {
              metric.el.style.transform = `translate3d(0, -${shiftDistance}px, 0)`;
              metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
            } else {
              metric.el.style.transform = '';
              metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
            }
          } else if (startIndex > targetIndex) {
            if (metric.index >= targetIndex && metric.index < startIndex) {
              metric.el.style.transform = `translate3d(0, ${shiftDistance}px, 0)`;
              metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
            } else {
              metric.el.style.transform = '';
              metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
            }
          } else {
            metric.el.style.transform = '';
            metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
          }
        });
      }
    };

    const onPointerUp = (/** @type {PointerEvent} */ e) => {
      if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
      // the browser took the gesture over (it began a scroll): put the row back where it was
      if (e && e.type === 'pointercancel') targetIndex = startIndex;
      // where the finger left the screen: phones may not send a last move before it does
      else if (e && e.type === 'pointerup' && isDragging && draggedItem) { lastClientY = e.clientY; placeDragged(); }
      if (pressTimer) clearTimeout(pressTimer);
      if (autoScrollTimer) clearInterval(autoScrollTimer);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (!draggedItem) return;

      const item = draggedItem;
      const currentActiveId = activePointerId;
      draggedItem = null;
      activePointerId = null;

      try {
        if (currentActiveId !== null && item.hasPointerCapture && item.hasPointerCapture(currentActiveId)) {
          item.releasePointerCapture(currentActiveId);
        }
      } catch (e) {}

      if (isDragging) {
        let targetSlotDy = 0;
        if (targetIndex >= 0 && targetIndex < itemMetrics.length && targetIndex !== startIndex) {
          targetSlotDy = itemMetrics[targetIndex].top - draggedStartTop;
        }

        item.style.transition = 'transform 160ms cubic-bezier(0.2, 0, 0, 1)';
        item.style.transform = `translate3d(0, ${targetSlotDy}px, 0) scale(1)`;

        // Long track lists are virtualised (renderTracks): `items` is only the rendered slice, so positions
        // in it are not positions in the list. Each row knows its real index; without this, a drag in a
        // scrolled list reordered two other songs and saved that.
        const absolute = (/** @type {number} */ i) => {
          const n = items[i] && items[i].dataset.trackIndex !== undefined ? Number(items[i].dataset.trackIndex) : NaN;
          return Number.isFinite(n) ? n : i;
        };
        const fromAbs = startIndex >= 0 ? absolute(startIndex) : -1;
        const toAbs = targetIndex >= 0 ? absolute(targetIndex) : -1;
        const sliceStart = (container._lastStartIndex || 0) > 0 ? (container._lastStartIndex || 0) : 0;
        // this drop's own values: a drag started within the 160 ms below replaces the shared ones
        const dropItems = items;
        const dropTarget = targetIndex;
        const dropStart = startIndex;
        const gen = dragGen;

        setTimeout(() => {
          if (dropTarget !== dropStart && dropTarget >= 0 && dropTarget < dropItems.length) {
            const targetItem = dropItems[dropTarget];
            if (dropTarget > dropStart) {
              targetItem.after(item);
            } else {
              targetItem.before(item);
            }
          }

          item.classList.remove('is-dragging');
          item.style.transform = '';
          item.style.transition = '';
          item.style.willChange = '';

          dropItems.forEach(el => {
            el.style.transform = '';
            el.style.transition = '';
          });

          container.style.userSelect = '';
          container.classList.add('no-enter-anim');

          /** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll('.track-row')).forEach((r, i) => {
            r.dataset.trackIndex = String(sliceStart + i);
            const num = r.querySelector('.track-row-index');
            if (num) num.textContent = String(sliceStart + i + 1);
          });

          if (fromAbs !== -1 && toAbs !== -1 && fromAbs !== toAbs) {
            setOrder(fromAbs, toAbs);
          }

          // the touchmove guard below reads this: left on, the list couldn't scroll until the next drag began.
          // Not when another drag has started since: that one is still moving
          if (gen === dragGen) {
            container._isDraggingReorder = false;
            isDragging = false;
          }
          setTimeout(() => { suppressClick = false; }, 80);
        }, 160);
      } else {
        suppressClick = false;
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    // once a held row is lifted the finger moves it, so the list must not scroll underneath
    container.addEventListener('touchmove', (e) => { if (isDragging) e.preventDefault(); }, { passive: false });
  }

  initListReordering({
    container: el.playlistsList,
    itemSelector: '.playlist-item',
    setOrder: (fromIdx, toIdx) => {
      const [moved] = state.playlists.splice(fromIdx, 1);
      state.playlists.splice(toIdx, 0, moved);
      localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    },
    // dragging moves playlists in the custom order: not while the list shows another order
    isFilterActive: () => getLibrarySort('playlists') !== 'custom'
  });

  initListReordering({
    container: el.presetsContainer,
    itemSelector: '.preset-chip',
    canDragItem: (chip) => chip.dataset.isCustom === 'true',
    setOrder: (fromIdx, toIdx) => {
      const [moved] = state.customPresets.splice(fromIdx, 1);
      state.customPresets.splice(toIdx, 0, moved);
      localStorage.setItem('devsize_custom_presets', JSON.stringify(state.customPresets));
    }
  });

  initListReordering({
    container: el.favoritesTracksList,
    itemSelector: '.track-row',
    isFilterActive: () => Boolean(el.favoritesSearchInput && el.favoritesSearchInput.value.trim()) || getTrackSortMode('favorites') !== 'manual',
    setOrder: (fromIdx, toIdx) => {
      const [moved] = state.favorites.splice(fromIdx, 1);
      state.favorites.splice(toIdx, 0, moved);
      localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      if (el.favoritesSubtitle) {
        el.favoritesSubtitle.textContent = `${state.favorites.length} songs saved`;
      }
    }
  });

  initListReordering({
    container: el.playlistTracksList,
    itemSelector: '.track-row',
    isFilterActive: () => Boolean(el.playlistSearchInput && el.playlistSearchInput.value.trim()) || getTrackSortMode('playlist') !== 'manual',
    setOrder: (fromIdx, toIdx) => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl || !pl.tracks) return;
      const [moved] = pl.tracks.splice(fromIdx, 1);
      pl.tracks.splice(toIdx, 0, moved);
      localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    }
  });

  // the queue too (Riff #248): the song playing keeps playing, wherever it is moved to
  initListReordering({
    container: el.queueTracksList,
    itemSelector: '.track-row',
    setOrder: (fromIdx, toIdx) => {
      const [moved] = state.queue.splice(fromIdx, 1);
      state.queue.splice(toIdx, 0, moved);
      const cur = state.queueIndex;
      if (fromIdx === cur) state.queueIndex = toIdx;
      else if (fromIdx < cur && toIdx >= cur) state.queueIndex--;
      else if (fromIdx > cur && toIdx <= cur) state.queueIndex++;
      // the rows carry their old positions: draw them again
      el.queueTracksList._renderedQueue = null;
      updateQueueBadge();
    }
  });

  function createPlaylist(/** @type {string} */ name, /** @type {UrielTrack[]} */ initialTracks = [], cover = '', { open = true } = {}) {
    if (!name || !name.trim()) return null;
    /** @type {UrielPlaylist} */
    const newPl = {
      id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: name.trim(),
      tracks: Array.isArray(initialTracks)
        ? initialTracks.map(t => (t && typeof t.addedAt === 'number') ? t : stampAddedAt(t))
        : []
    };
    if (cover && typeof cover === 'string' && cover.trim()) {
      newPl.cover = cover.trim();
    }
    state.playlists.push(newPl);
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    renderPlaylistsList();
    if (open) openPlaylistDetail(newPl.id);
    return newPl;
  }

  function openPlaylistDetail(/** @type {string} */ playlistId) {
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === playlistId);
    if (!pl) return;
    // the page shares its scroll with the view it was opened from: opened from "Your playlists" low on the
    // home screen, it showed up halfway down its song list with the header out of sight
    const opening = state.currentView !== 'playlist-detail' || state.currentPlaylistId !== playlistId;
    state.currentPlaylistId = playlistId;
    if (el.playlistDetailTitle) el.playlistDetailTitle.textContent = pl.name;
    const query = el.playlistSearchInput ? normalizeSearch(el.playlistSearchInput.value) : '';
    let filtered = pl.tracks;
    if (query) {
      filtered = pl.tracks.filter((/** @type {UrielTrack} */ t) => matchesTrackQuery(t, query));
    }
    filtered = sortTracksFor('playlist', filtered);
    if (el.playlistSort) { el.playlistSort.value = getTrackSortMode('playlist'); syncSortDropdown('playlist'); }
    renderPlaylistDescription(pl);
    renderPlaylistDuplicateButton(pl);
    const totalSec = (pl.tracks || []).reduce((/** @type {number} */ acc, /** @type {UrielTrack} */ t) => acc + (t.duration || 0), 0);
    const durStr = totalSec > 0 ? ` • ${formatDuration(totalSec)}` : '';
    if (el.playlistDetailCount) el.playlistDetailCount.textContent = (query ? `${filtered.length} of ${pl.tracks.length} songs` : `${pl.tracks.length} songs`) + durStr;
    const detailCover = document.getElementById('playlist-detail-cover');
    if (detailCover) renderPlaylistCover(detailCover, pl, 160);
    const coverSrc = (pl && pl.cover) ? pl.cover : ((pl.tracks && pl.tracks[0]) ? getTrackThumbUrl(pl.tracks[0]) : '');
    const plHeroFx = document.getElementById('playlist-hero-fx');
    if (plHeroFx) {
      plHeroFx.style.backgroundImage = coverSrc ? `url("${coverSrc}")` : '';
    }
    const headerEl = /** @type {HTMLElement} */ (document.querySelector('.playlist-detail-header'));
    if (headerEl) {
      if (coverSrc) {
        getCoverDominantColors(coverSrc).then(([domColor]) => {
          if (state.currentPlaylistId === playlistId) {
            headerEl.style.setProperty('--playlist-accent-color', domColor);
            document.documentElement.style.setProperty('--playlist-accent-color', domColor);
          }
        });
      } else {
        headerEl.style.removeProperty('--playlist-accent-color');
        document.documentElement.style.removeProperty('--playlist-accent-color');
      }
    }
    if (opening) { const main = document.querySelector('.main-content'); if (main) main.scrollTop = 0; }
    if (el.playlistTracksList) renderTracks(el.playlistTracksList, filtered, 'playlist');
    switchView('playlist-detail');
    renderPlaylistsList();
    refreshPlaylistDownloads(pl);
  }

  if (el.playlistSort) {
    el.playlistSort.addEventListener('change', () => {
      setTrackSortMode('playlist', el.playlistSort.value);
      if (state.currentPlaylistId) openPlaylistDetail(state.currentPlaylistId);
    });
    el.playlistSort.value = getTrackSortMode('playlist');
    setupSortDropdown('playlist', el.playlistSort);
  }

  // A playlist's description, written right on the page ("Add a description..."); it goes wherever the
  // playlist goes (sync, share links keep to name and songs)
  const playlistDescEl = document.getElementById('playlist-detail-desc');
  function renderPlaylistDescription(/** @type {UrielPlaylist} */ pl) {
    const desc = document.getElementById('playlist-detail-desc');
    if (!desc || document.activeElement === desc) return;
    desc.textContent = (pl && pl.description) || '';
  }
  if (playlistDescEl) {
    try { playlistDescEl.contentEditable = 'plaintext-only'; } catch (e) {}
    if (playlistDescEl.contentEditable !== 'plaintext-only') playlistDescEl.contentEditable = 'true';
    playlistDescEl.spellcheck = false;
    playlistDescEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); playlistDescEl.blur(); }
      if (e.key === 'Escape') {
        const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
        playlistDescEl.textContent = (pl && pl.description) || '';
        playlistDescEl.blur();
      }
      e.stopPropagation();
    });
    playlistDescEl.addEventListener('blur', () => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl) return;
      const next = playlistDescEl.textContent.replace(/\s+\n/g, '\n').trim().slice(0, 300);
      if ((pl.description || '') !== next) {
        if (next) pl.description = next;
        else delete pl.description;
        localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
      }
      playlistDescEl.textContent = pl.description || '';
    });
  }
  // Play goes through the playlist in the order shown; Shuffle turns shuffle on and starts on a random song
  function playOpenPlaylist(/** @type {boolean} */ shuffle) {
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    if (!pl || !pl.tracks || !pl.tracks.length) return;
    const list = sortTracksFor('playlist', pl.tracks);
    setShuffle(shuffle);
    const i = shuffle ? Math.floor(Math.random() * list.length) : 0;
    playTrack(list[i], list, i, 'playlist');
  }
  // Share: the playlist goes inside a link (share-link.js) that opens in the web player or in Uriel
  async function sharePlaylist(/** @type {{ name: string, tracks: UrielTrack[] } | undefined} */ pl) {
    const S = window.UrielShare;
    if (!pl || !S) return;
    let link, count;
    try { const r = await S.encode({ name: pl.name, tracks: pl.tracks || [] }); link = S.webLink(r.payload); count = r.count; } catch (e) { showToast(Tm("Couldn't make a link for this playlist"), 'error'); return; }
    if (!count) { showToast(Tm("Songs from your own files can't be shared, and this playlist has nothing else"), 'info'); return; }
    const skipped = (pl.tracks || []).length - count;
    const note = skipped > 0 ? ` (${skipped === 1 ? T('1 song from your own files left out') : Tf('{0} songs from your own files left out', skipped)})` : '';
    if (window.electronAPI && window.electronAPI.shareText) { // phones: the share sheet
      const r = await window.electronAPI.shareText(pl.name, `${pl.name} on Uriel 🎧 ${link}`);
      if (r === 'copied') showToast(Tm('Link copied{0}', note), 'success');
      else if (r === 'shared' && note) showToast(Tm('Shared{0}', note), 'info');
      else if (r === 'failed') showToast(Tm("Couldn't share the link"), 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast(Tm('Link copied. Anyone can open it in the browser or in Uriel{0}', note), 'success');
    } catch (e) { window.prompt(T('Copy this link'), link); }
  }
  // ---- the playlist's "More" menu: the things Spotify keeps behind its ⋯ ----
  function queuePlaylist(/** @type {UrielPlaylist} */ pl, /** @type {boolean} */ next) {
    const tracks = (pl.tracks || []).filter((/** @type {UrielTrack} */ t) => !isBlocked(t));
    if (!tracks.length) { showToast(Tm('This playlist is empty'), 'info'); return; }
    // nothing playing yet: the playlist simply starts
    if (!state.queue.length || state.queueIndex < 0) { playTrack(tracks[0], tracks.slice(), 0, 'playlist'); return; }
    if (next) state.queue.splice(state.queueIndex + 1, 0, ...tracks);
    else state.queue.push(...tracks);
    updateQueueBadge();
    window.dispatchEvent(new Event('uriel:queue'));
    showToast(next ? Tm('{0} songs play next', tracks.length) : Tm('{0} songs added to the queue', tracks.length), 'success');
  }
  function duplicatePlaylist(/** @type {UrielPlaylist} */ pl) {
    const taken = new Set(state.playlists.map((/** @type {UrielPlaylist} */ p) => p.name));
    let name = Tf('{0} (copy)', pl.name);
    for (let n = 2; taken.has(name); n++) name = Tf('{0} (copy {1})', pl.name, n);
    const copy = { ...pl, id: 'pl_' + Date.now(), name, tracks: (pl.tracks || []).map((/** @type {UrielTrack} */ t) => ({ ...t })) };
    state.playlists.push(copy);
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    window.dispatchEvent(new Event('uriel:library'));
    renderPlaylistsList();
    openPlaylistDetail(copy.id);
    showToast(Tm('Made "{0}"', name), 'success');
  }
  const btnPlaylistMore = document.getElementById('btn-playlist-more');
  if (btnPlaylistMore) btnPlaylistMore.addEventListener('click', (e) => {
    e.stopPropagation();
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    if (!pl) return;
    const click = (/** @type {string} */ id) => () => { const b = document.getElementById(id); if (b) b.click(); };
    const r = btnPlaylistMore.getBoundingClientRect();
    showActionMenu(r.left, r.bottom + 6, [
      { label: 'Play next', run: () => queuePlaylist(pl, true) },
      { label: 'Add to queue', run: () => queuePlaylist(pl, false) },
      ...(songRadioEnabled() && (pl.tracks || []).length ? [{ label: 'Start radio', run: () => startSongRadio((pl.tracks || []).slice(0, 5)) }] : []),
      { label: 'Edit details', run: click('btn-rename-playlist') },
      { label: 'Duplicate', run: () => duplicatePlaylist(pl) },
      { label: 'Share…', run: () => sharePlaylist(pl) },
      { label: 'Export as file', run: click('btn-export-playlist') },
      { label: 'Delete playlist', danger: true, run: click('btn-delete-playlist') },
    ], r.top - 6);
  });

  // ---- which of a playlist's songs are already on this device ----
  // Songs from your own files always are; the others count when they're in the Downloads folder (what "Download
  // all" skips). Shown under the title ("12 of 40 downloaded") and on the Download button ("Download 28 more").
  let playlistDownloadsFor = '';
  async function refreshPlaylistDownloads(/** @type {UrielPlaylist | undefined} */ pl) {
    const stateEl = document.getElementById('playlist-download-state');
    const label = document.getElementById('btn-download-playlist-label');
    if (!pl || !stateEl) return;
    const id = pl.id;
    playlistDownloadsFor = id;
    const all = pl.tracks || [];
    const online = all.filter((/** @type {UrielTrack} */ t) => t.platform !== 'local');
    let present;
    try { present = online.length ? await downloadedInFolder(online) : []; } catch (e) { present = null; }
    if (playlistDownloadsFor !== id || state.currentPlaylistId !== id) return;
    if (!present) { stateEl.hidden = true; if (label) label.textContent = T('Download all'); return; }
    const have = present.filter(Boolean).length + (all.length - online.length);
    // the arrows on the rows agree with the count
    online.forEach((/** @type {UrielTrack} */ t, /** @type {number} */ i) => { if (present[i]) offlineChanged(t, true); });
    stateEl.hidden = !all.length || !have;
    stateEl.textContent = have >= all.length ? T('All downloaded') : Tf('{0} of {1} downloaded', have, all.length);
    stateEl.classList.toggle('complete', have >= all.length);
    if (label) label.textContent = have >= all.length && all.length ? T('Downloaded') : (have ? Tf('Download {0} more', all.length - have) : T('Download all'));
  }

  const btnSharePlaylist = document.getElementById('btn-share-playlist');
  if (btnSharePlaylist) btnSharePlaylist.addEventListener('click', () => sharePlaylist(state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId)));

  // a playlist someone shared: from a uriel://playlist link, the search bar or the link importer
  let importingShare = '';
  async function importSharedPlaylist(/** @type {string} */ text) {
    const S = window.UrielShare;
    const payload = S ? S.payloadFrom(text) : '';
    if (!payload) return false;
    if (importingShare === payload) return true;
    importingShare = payload;
    try {
      const { name, tracks } = await S.decode(payload);
      if (!tracks.length) { showToast(Tm('That playlist link has no songs Uriel can play'), 'info'); return true; }
      // short links carry only YouTube ids: look up titles and artists first
      if (tracks.some((/** @type {UrielTrack} */ t) => t.needsInfo)) { showToast(Tm('Adding "{0}"…', name), 'info'); await S.fillInfo(tracks); }
      const key = (/** @type {UrielTrack[]} */ list) => list.map((/** @type {UrielTrack} */ t) => `${t.platform}:${t.id}`).join('|');
      const same = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.name === name && key(p.tracks || []) === key(tracks));
      if (same) { openPlaylistDetail(same.id); showToast(Tm('You already have "{0}"', name), 'info'); return true; }
      const taken = new Set(state.playlists.map((/** @type {UrielPlaylist} */ p) => p.name));
      let finalName = name;
      for (let i = 2; taken.has(finalName); i++) finalName = `${name} (${i})`;
      createPlaylist(finalName, tracks);
      showToast(tracks.length === 1 ? Tm('Added "{0}" (1 song)', finalName) : Tm('Added "{0}" ({1} songs)', finalName, tracks.length), 'success');
    } catch (e) {
      showToast(Tm("That playlist link didn't work. It may have been cut off, so ask for it again"), 'error');
    } finally {
      setTimeout(() => { if (importingShare === payload) importingShare = ''; }, 3000);
    }
    return true;
  }
  window.addEventListener('uriel:deeplink', (e) => { const d = /** @type {CustomEvent} */ (e).detail; if (/^(?:uriel|muriel):\/\/playlist/i.test(String(d || ''))) importSharedPlaylist(d); });

  if (el.btnPlayPlaylist) el.btnPlayPlaylist.addEventListener('click', () => playOpenPlaylist(false));
  const btnShufflePlaylist = document.getElementById('btn-shuffle-playlist');
  if (btnShufflePlaylist) btnShufflePlaylist.addEventListener('click', () => playOpenPlaylist(true));

  (function setupFavAllPlaylist() {
    const btn = document.getElementById('btn-fav-all-playlist');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl || !pl.tracks) return;
      let added = 0;
      for (let i = pl.tracks.length - 1; i >= 0; i--) {
        const track = pl.tracks[i];
        if (!isFavoriteSong(track)) {
          state.favorites.unshift(stampAddedAt(track));
          added++;
        }
      }
      localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      updateFavoritesBadge();
      updateFavoriteIcon();
      btn.title = Tf('{0} added to favorites', added);
      const old = btn.style.color;
      btn.style.color = '#ff6b8a';
      setTimeout(() => { btn.style.color = old; btn.title = T('Add all to favorites'); }, 2500);
    });
  })();

  (function setupPlaylistRename() {
    const btn = document.getElementById('btn-rename-playlist');
    const titleEl = document.getElementById('playlist-detail-title');
    if (!btn || !titleEl) return;
    btn.addEventListener('click', () => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl || titleEl.querySelector('input')) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = pl.name || '';
      input.style.cssText = 'font:inherit;color:inherit;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.4);border-radius:12px;padding:2px 12px;width:100%;max-width:600px;outline:none;';
      titleEl.textContent = '';
      titleEl.appendChild(input);
      input.focus();
      input.select();
      let done = false;
      const finish = (/** @type {boolean} */ save) => {
        if (done) return;
        done = true;
        const newName = input.value.trim();
        if (save && newName) {
          pl.name = newName;
          localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
        }
        titleEl.textContent = pl.name;
        renderPlaylistsList();
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    });
  })();

  (function setupMultiSelectControls() {
    const on = (/** @type {string} */ id, /** @type {() => void} */ fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    on('btn-select-playlist', () => startMultiSelect('playlist'));
    on('btn-select-favorites', () => startMultiSelect('favorites'));
    on('multi-select-done', () => exitMultiSelect());
    on('multi-select-all', () => {
      const all = multiSelectSourceTracks();
      const allSelected = all.length > 0 && all.every((/** @type {UrielTrack} */ t) => multiSel.tracks.has(getTrackCanonicalId(t)));
      multiSel.tracks.clear();
      if (!allSelected) all.forEach((/** @type {UrielTrack} */ t) => multiSel.tracks.set(getTrackCanonicalId(t), t));
      updateMultiSelectBar();
      rerenderMultiSelectView();
    });
    on('multi-select-fav', () => {
      let added = 0;
      multiSel.tracks.forEach(t => {
        if (!isFavoriteSong(t)) { state.favorites.unshift(stampAddedAt(t)); added++; }
      });
      localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      updateFavoritesBadge();
      updateFavoriteIcon();
      showToast(!added ? Tm('Already in favorites') : added === 1 ? Tm('Added 1 song to favorites') : Tm('Added {0} songs to favorites', added), added ? 'success' : 'info');
    });
    on('multi-select-radio', () => {
      const picked = Array.from(multiSel.tracks.values());
      if (!picked.length) return;
      if (picked.length > 5) showToast(Tm('Radio uses the first 5 selected songs'), 'info');
      exitMultiSelect();
      startSongRadio(picked);
    });
    on('multi-select-add', () => {
      const picked = Array.from(multiSel.tracks.values());
      if (picked.length) openAddToPlaylistModal(null, picked);
    });
    on('multi-select-remove', () => {
      const n = multiSel.tracks.size;
      if (!n || !window.confirm(n === 1 ? T('Remove 1 song?') : Tf('Remove {0} songs?', n))) return;
      if (multiSel.context === 'favorites') {
        state.favorites = state.favorites.filter((/** @type {UrielTrack} */ f) => !multiSel.tracks.has(getTrackCanonicalId(f)));
        localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
        updateFavoritesBadge();
        updateFavoriteIcon();
      } else {
        const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
        if (pl) {
          pl.tracks = pl.tracks.filter((/** @type {UrielTrack} */ t) => !multiSel.tracks.has(getTrackCanonicalId(t)));
          localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
          renderPlaylistsList();
        }
      }
      multiSel.tracks.clear();
      updateMultiSelectBar();
      rerenderMultiSelectView();
    });
  })();

  // takes the row's song object: a playlist can hold the same song twice, and removing one copy took all of them
  function removeTrackFromCurrentPlaylist(/** @type {UrielTrack} */ track) {
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    if (!pl) return;
    const at = pl.tracks.indexOf(track);
    if (at >= 0) pl.tracks.splice(at, 1);
    else pl.tracks = pl.tracks.filter((/** @type {UrielTrack} */ t) => !isSameTrack(t, track));
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    if (state.currentPlaylistId) openPlaylistDetail(state.currentPlaylistId);
  }

  function deleteCurrentPlaylist() {
    if (!state.currentPlaylistId) return;
    state.playlists = state.playlists.filter((/** @type {UrielPlaylist} */ p) => p.id !== state.currentPlaylistId);
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    state.currentPlaylistId = null;
    renderPlaylistsList();
    switchView('discover');
  }

  /** @type {UrielTrack | null} */
  let trackToAddToPlaylist = null;
  /** @type {UrielTrack[] | null} */
  let manyToAddToPlaylist = null;
  // tracks waiting for the playlist that "New playlist" in the add dialog is about to create
  /** @type {UrielTrack[] | null} */
  let tracksForNewPlaylist = null;
  function openAddToPlaylistModal(/** @type {UrielTrack | null} */ track, /** @type {UrielTrack[] | null} */ many = null) {
    trackToAddToPlaylist = track;
    manyToAddToPlaylist = many;
    if (!el.playlistPickList) return;

    const trackPreviewEl = document.getElementById('add-playlist-track-preview');
    if (trackPreviewEl) {
      if (track) {
        const thumb = getTrackThumbUrl(track) || '';
        trackPreviewEl.innerHTML = '';
        if (thumb) {
          const previewImg = document.createElement('img');
          previewImg.className = 'add-playlist-track-preview-thumb';
          previewImg.src = thumb;
          previewImg.alt = '';
          previewImg.style.width = '40px';
          previewImg.style.height = '40px';
          previewImg.style.flex = '0 0 40px';
          previewImg.onerror = () => { previewImg.style.visibility = 'hidden'; };
          trackPreviewEl.appendChild(previewImg);
        } else {
          const previewPlaceholder = document.createElement('div');
          previewPlaceholder.className = 'add-playlist-track-preview-thumb';
          previewPlaceholder.style.width = '40px';
          previewPlaceholder.style.height = '40px';
          previewPlaceholder.style.flex = '0 0 40px';
          previewPlaceholder.style.display = 'flex';
          previewPlaceholder.style.alignItems = 'center';
          previewPlaceholder.style.justifyContent = 'center';
          previewPlaceholder.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
          trackPreviewEl.appendChild(previewPlaceholder);
        }

        const previewInfo = document.createElement('div');
        previewInfo.className = 'add-playlist-track-preview-info';

        const previewTitle = document.createElement('span');
        previewTitle.className = 'add-playlist-track-preview-title';
        previewTitle.textContent = track.title || 'untitled';

        const previewArtist = document.createElement('span');
        previewArtist.className = 'add-playlist-track-preview-artist';
        previewArtist.textContent = track.artist || 'unknown artist';

        previewInfo.appendChild(previewTitle);
        previewInfo.appendChild(previewArtist);
        trackPreviewEl.appendChild(previewInfo);
        trackPreviewEl.style.display = 'flex';
      } else {
        trackPreviewEl.style.display = 'none';
        trackPreviewEl.innerHTML = '';
      }
    }

    el.playlistPickList.innerHTML = '';
    if (state.playlists.length === 0) {
      el.playlistPickList.innerHTML = '<div class="empty-hint" data-i18n style="padding: 24px 0; text-align: center; color: var(--md-sys-color-outline);">No playlists yet. Create one first.</div>';
    } else {
      state.playlists.forEach((/** @type {UrielPlaylist} */ pl, /** @type {number} */ idx) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'playlist-pick-item';
        item.style.animationDelay = `${idx * 25}ms`;

        const isAlreadyAdded = many
          ? many.length > 0 && many.every((/** @type {UrielTrack} */ m) => (pl.tracks || []).some((/** @type {UrielTrack} */ t) => t.id === m.id))
          : track && (pl.tracks || []).some((/** @type {UrielTrack} */ t) => t.id === track.id);
        if (isAlreadyAdded) item.classList.add('already-added');

        const thumbEl = document.createElement('div');
        thumbEl.className = 'playlist-pick-thumb';
        thumbEl.style.width = '44px';
        thumbEl.style.height = '44px';
        thumbEl.style.flex = '0 0 44px';
        renderPlaylistCover(thumbEl, pl, 44);
        const coverImg = thumbEl.querySelector('img');
        if (coverImg) {
          coverImg.style.width = '44px';
          coverImg.style.height = '44px';
          coverImg.style.objectFit = 'cover';
        }

        const infoEl = document.createElement('div');
        infoEl.className = 'playlist-pick-info';
        const trackCount = (pl.tracks || []).length;

        const nameEl = document.createElement('span');
        nameEl.className = 'playlist-pick-name';
        nameEl.textContent = pl.name || 'untitled';

        const countEl = document.createElement('span');
        countEl.className = 'playlist-pick-count';
        countEl.textContent = `${trackCount} song${trackCount === 1 ? '' : 's'}`;
        countEl.dataset.i18n = '';

        infoEl.appendChild(nameEl);
        infoEl.appendChild(countEl);

        const actionEl = document.createElement('div');
        if (isAlreadyAdded) {
          actionEl.className = 'playlist-pick-badge in-playlist';
          actionEl.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Added
          `;
        } else {
          actionEl.className = 'playlist-pick-action-btn';
          actionEl.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          `;
        }

        item.appendChild(thumbEl);
        item.appendChild(infoEl);
        item.appendChild(actionEl);

        item.addEventListener('click', () => {
          if (many) {
            const fresh = many.filter((/** @type {UrielTrack} */ m) => !pl.tracks.some((/** @type {UrielTrack} */ t) => t.id === m.id));
            fresh.forEach((/** @type {UrielTrack} */ m) => pl.tracks.push(stampAddedAt(m)));
            if (fresh.length) {
              localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
              renderPlaylistsList();
            }
            showToast(!fresh.length ? Tm('Already in "{0}"', pl.name) : fresh.length === 1 ? Tm('Added 1 song to "{0}"', pl.name) : Tm('Added {0} songs to "{1}"', fresh.length, pl.name), fresh.length ? 'success' : 'info');
          } else if (track) {
            if (!pl.tracks.some((/** @type {UrielTrack} */ t) => t.id === track.id)) {
              pl.tracks.push(stampAddedAt(track));
              localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
              renderPlaylistsList();
              showToast(Tm('Added to "{0}"', pl.name), 'success');
            } else {
              showToast(Tm('Already in "{0}"', pl.name), 'info');
            }
          }
          if (el.addToPlaylistModal) closeModal(el.addToPlaylistModal);
        });

        el.playlistPickList.appendChild(item);
      });
    }
    if (el.addToPlaylistModal) openModal(el.addToPlaylistModal);
  }

  function switchView(/** @type {string} */ viewName) {
    // the queue lives in the drawer now, not in its own page
    if (viewName === 'queue') { openPanelDrawer('queue'); return; }
    state.currentView = viewName;
    if (multiSel.active) {
      const keep = (viewName === 'playlist-detail' && multiSel.context === 'playlist') || (viewName === 'favorites' && multiSel.context === 'favorites');
      if (!keep) exitMultiSelect(false);
    }

    requestAnimationFrame(() => {
      document.querySelectorAll('.no-enter-anim').forEach(c => c.classList.remove('no-enter-anim'));
      [el.viewDiscover, el.viewFavorites, el.viewAlbums, document.getElementById('view-artists'), el.viewLocal, el.viewHistory, el.viewQueue, el.viewPlaylistDetail, el.viewAlbum, el.viewArtist, el.viewSettings].forEach(v => {
        if (v) v.classList.remove('active');
      });

        [el.navDiscover, el.navFavorites, el.navAlbums, document.getElementById('nav-artists'), el.navLocal, el.navHistory, el.navQueue, el.navSettings].forEach(n => {
          if (n) n.classList.remove('active');
        });

          if (viewName === 'discover') {
            if (el.viewDiscover) el.viewDiscover.classList.add('active');
            if (el.navDiscover) el.navDiscover.classList.add('active');
            loadForYou();
            if (isSpotifyHome()) renderSpotifyHome();
          } else if (viewName === 'favorites') {
            if (el.viewFavorites) el.viewFavorites.classList.add('active');
            if (el.navFavorites) el.navFavorites.classList.add('active');
            renderFavoritesView();
          } else if (viewName === 'albums') {
            if (el.viewAlbums) el.viewAlbums.classList.add('active');
            if (el.navAlbums) el.navAlbums.classList.add('active');
            renderSavedAlbums();
          } else if (viewName === 'artists') {
            const v = document.getElementById('view-artists');
            const n = document.getElementById('nav-artists');
            if (v) v.classList.add('active');
            if (n) n.classList.add('active');
            renderArtistsTab();
          } else if (viewName === 'local') {
            if (el.viewLocal) el.viewLocal.classList.add('active');
            if (el.navLocal) el.navLocal.classList.add('active');
            renderLocalView();
          } else if (viewName === 'history') {
            if (el.viewHistory) el.viewHistory.classList.add('active');
            if (el.navHistory) el.navHistory.classList.add('active');
            renderHistoryView();
          } else if (viewName === 'queue') {
            if (el.viewQueue) el.viewQueue.classList.add('active');
            if (el.navQueue) el.navQueue.classList.add('active');
            renderQueueView();
          } else if (viewName === 'playlist-detail') {
            if (el.viewPlaylistDetail) el.viewPlaylistDetail.classList.add('active');
          } else if (viewName === 'album') {
            if (el.viewAlbum) el.viewAlbum.classList.add('active');
          } else if (viewName === 'artist') {
            if (el.viewArtist) el.viewArtist.classList.add('active');
          } else if (viewName === 'settings') {
            if (el.viewSettings) el.viewSettings.classList.add('active');
            if (el.navSettings) el.navSettings.classList.add('active');
            enterSettings();
            renderBlockedSettings(); // a linked device may have changed it
            updateOfflineStorageUI();
            updateDeviceMusicUI();
            if (typeof refreshYtSignin === 'function') refreshYtSignin(); // signed in or out from the import window
            updateMusicFolderUI();
  updateDownloadFolderUI();
  updateDownloadCaptionPath();
            checkToolsStatus(false);
          }

          // next frame: the new view gets laid out once, then the indicator reads where the item is
          requestAnimationFrame(() => updateNavIndicator(true));

          highlightPlayingRow();
          if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();
          updateFxVisibility();
    });
  }

  function applyStackedRadius(/** @type {Element | Element[] | null} */ container, /** @type {string | null} */ itemSelector, /** @type {boolean} */ horizontal) {
    if (!container) return;
    const raw = Array.isArray(container) ? container : [...container.querySelectorAll(itemSelector || '*')];
    const items = raw.filter((n) => n.getBoundingClientRect().height > 1 && getComputedStyle(n).display !== 'none');
    const stackClasses = ['stack-only', 'stack-first', 'stack-mid', 'stack-last'];
    items.forEach((n, i) => {
      const target = items.length === 1 ? 'stack-only' : i === 0 ? 'stack-first' : i === items.length - 1 ? 'stack-last' : 'stack-mid';
      const needH = !!horizontal;
      if (n.classList.contains('stack-h') !== needH) n.classList.toggle('stack-h', needH);
      stackClasses.forEach((cls) => {
        if (cls === target) {
          if (!n.classList.contains(cls)) n.classList.add(cls);
        } else {
          if (n.classList.contains(cls)) n.classList.remove(cls);
        }
      });
    });
  }
  let stackRetry = false;
  function refreshStacks() {
    const sNav = document.querySelector('.sidebar-nav');
    if (sNav) {
      const all = [...sNav.querySelectorAll('.nav-item')];
      const visible = all.filter((n) => n.getBoundingClientRect().height > 1 && getComputedStyle(n).display !== 'none');
      if (all.length > 0 && visible.length === 0) {
        if (!stackRetry) {
          stackRetry = true;
          requestAnimationFrame(() => { stackRetry = false; refreshStacks(); });
        }
        return;
      }
      const div = sNav.querySelector('.rail-divider');
      if (div) {
        const divIdx = [...sNav.children].indexOf(div);
        applyStackedRadius(all.filter((n) => [...sNav.children].indexOf(n) < divIdx), null, false);
        applyStackedRadius(all.filter((n) => [...sNav.children].indexOf(n) > divIdx), null, false);
      } else {
        applyStackedRadius(all, null, false);
      }
    }
    applyStackedRadius(/** @type {HTMLElement} */ (document.querySelector('.settings-nav')), '.settings-nav-btn', false);
    applyStackedRadius(/** @type {HTMLElement} */ (document.getElementById('audio-tabs')), '.audio-tab', false);
  }

  let stackRaf = 0;
  const stackObserver = new MutationObserver(() => { if (stackRaf) return; stackRaf = requestAnimationFrame(() => { stackRaf = 0; refreshStacks(); }); });
  ['.sidebar-nav', '.settings-nav', '#audio-tabs'].forEach((s) => { const n = document.querySelector(s); if (n) stackObserver.observe(n, { attributes: true, attributeFilter: ['class', 'style'], childList: true, subtree: true }); });

  let navIndicatorTimer = 0;
  let navIndicatorReady = false;
  function navIndicatorRadius(/** @type {HTMLElement} */ active) {
    const r = getComputedStyle(active).borderRadius;
    if (r && parseFloat(r) > 0) return r;
    return getComputedStyle(document.documentElement).getPropertyValue('--stack-mid').trim() || '14px';
  }
  // (the nav's stacked corners are refreshStacks' job, run by stackObserver when the nav changes: calling it here
  // measured every nav item right after a view switch, forcing an extra layout of the page)
  function updateNavIndicator(/** @type {boolean} */ animate) {
    const ind = el.navActiveIndicator;
    if (!ind) return;
    const active = /** @type {HTMLElement} */ (document.querySelector('.sidebar-nav .nav-item.active'));
    if (!active || !active.offsetParent) { ind.classList.add('is-hidden'); return; }
    const nav = /** @type {HTMLElement} */ (active.closest('.sidebar-nav'));
    const nr = nav.getBoundingClientRect();
    const r = active.getBoundingClientRect();
    if (!r.height) return;
    const top = Math.round(r.top - nr.top + (r.height - 48) / 2);
    ind.classList.remove('is-hidden');
    clearTimeout(navIndicatorTimer);
    if (!animate || !navIndicatorReady) {
      ind.style.transition = 'opacity 0.2s ease';
      ind.style.height = '48px';
      ind.style.transform = `translateY(${top}px)`;
      ind.style.borderRadius = navIndicatorRadius(active);
      navIndicatorReady = true;
      return;
    }
    const curTop = new DOMMatrix(getComputedStyle(ind).transform).m42;
    const curH = ind.getBoundingClientRect().height || 48;
    const curBottom = curTop + curH;
    const newTop = Math.min(curTop, top);
    const newBottom = Math.max(curBottom, top + 48);
    ind.style.transition = 'transform 0.26s cubic-bezier(0.3, 0, 0.8, 0.15), height 0.26s cubic-bezier(0.3, 0, 0.8, 0.15), opacity 0.2s ease';
    ind.style.transform = `translateY(${newTop}px)`;
    ind.style.height = `${newBottom - newTop}px`;
    ind.style.borderRadius = '24px';
    navIndicatorTimer = window.setTimeout(() => {
      ind.style.transition = 'transform 0.34s cubic-bezier(0.2, 0, 0, 1), height 0.34s cubic-bezier(0.2, 0, 0, 1), border-radius 0.34s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease';
      ind.style.transform = `translateY(${top}px)`;
      ind.style.height = '48px';
      ind.style.borderRadius = navIndicatorRadius(active);
    }, 260);
  }

  window.addEventListener('resize', () => updateNavIndicator(false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => updateNavIndicator(false));
  const sidebarNavElem = document.querySelector('.sidebar-nav');
  if (sidebarNavElem) {
    refreshStacks();
    new ResizeObserver(() => updateNavIndicator(false)).observe(sidebarNavElem);
  }

  function setPlayPauseState(/** @type {boolean} */ playing, animate = true) {
    const btn = el.btnPlayPause;
    const tvkBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-tvk-play'));

    const tvkPlay = document.getElementById('tvk-play-icon');
    const tvkPause = document.getElementById('tvk-pause-icon');
    if (tvkPlay && tvkPlay.getAnimations) {
      try { tvkPlay.getAnimations().forEach(a => a.cancel()); } catch (e) {}
    }
    if (tvkPause && tvkPause.getAnimations) {
      try { tvkPause.getAnimations().forEach(a => a.cancel()); } catch (e) {}
    }
    if (el.playIcon && el.playIcon.getAnimations) {
      try { el.playIcon.getAnimations().forEach((/** @type {Animation} */ a) => a.cancel()); } catch (e) {}
    }
    if (el.pauseIcon && el.pauseIcon.getAnimations) {
      try { el.pauseIcon.getAnimations().forEach((/** @type {Animation} */ a) => a.cancel()); } catch (e) {}
    }

    if (tvkBtn) {
      const isTvkPlaying = tvkBtn.classList.contains('playing');
      if (tvkBtn._morphAnim) {
        try { tvkBtn._morphAnim.cancel(); } catch (e) {}
        tvkBtn._morphAnim = null;
      }
      const H = 56;
      const pausedW = H;
      const pausedR = H / 2;
      const playingW = Math.round(H * 1.39);
      const playingR = 20;

      tvkBtn.classList.toggle('playing', !!playing);

      if (animate && isTvkPlaying !== !!playing) {
        const cs = window.getComputedStyle(tvkBtn);
        const curW = parseFloat(cs.width) || (isTvkPlaying ? playingW : pausedW);
        const curR = parseFloat(cs.borderRadius) || (isTvkPlaying ? playingR : pausedR);

        const targetW = playing ? playingW : pausedW;
        const targetR = playing ? playingR : pausedR;
        const mid1W = playing ? targetW * 1.10 : targetW * 0.90;
        const mid2W = playing ? targetW * 0.97 : targetW * 1.03;

        const keyframes = [
          { width: `${curW}px`, borderRadius: `${curR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
          { width: `${mid1W}px`, borderRadius: `${targetR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', offset: 0.45 },
          { width: `${mid2W}px`, borderRadius: `${targetR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', offset: 0.72 },
          { width: `${targetW}px`, borderRadius: `${targetR}px`, offset: 1 }
        ];

        tvkBtn._morphAnim = tvkBtn.animate(keyframes, { duration: 340, easing: 'linear' });
      }
    }

    if (!btn) return;
    const isCurrentlyPlaying = btn.classList.contains('playing');
    if (btn._morphAnim) {
      try { btn._morphAnim.cancel(); } catch (e) {}
      btn._morphAnim = null;
    }

    const H = 48;
    const pausedW = H;
    const pausedR = H / 2;
    const playingW = Math.round(H * 1.45);
    const playingR = Math.round(H * 0.38);

    btn.classList.toggle('playing', !!playing);

    if (animate && isCurrentlyPlaying !== !!playing) {
      const cs = window.getComputedStyle(btn);
      const curW = parseFloat(cs.width) || (isCurrentlyPlaying ? playingW : pausedW);
      const curR = parseFloat(cs.borderRadius) || (isCurrentlyPlaying ? playingR : pausedR);

      const targetW = playing ? playingW : pausedW;
      const targetR = playing ? playingR : pausedR;
      const mid1W = playing ? targetW * 1.10 : targetW * 0.90;
      const mid2W = playing ? targetW * 0.97 : targetW * 1.03;

      const keyframes = [
        { width: `${curW}px`, borderRadius: `${curR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
        { width: `${mid1W}px`, borderRadius: `${targetR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', offset: 0.45 },
        { width: `${mid2W}px`, borderRadius: `${targetR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', offset: 0.72 },
        { width: `${targetW}px`, borderRadius: `${targetR}px`, offset: 1 }
      ];

      btn._morphAnim = btn.animate(keyframes, { duration: 340, easing: 'linear' });
    }
  }

  function updatePlayPauseButton(/** @type {boolean} */ isPlaying, isBuffering = false) {
    const actuallyPlaying = !!(isPlaying || (el.nativeAudio && !el.nativeAudio.paused && !el.nativeAudio.ended));
    const tvkBtn = document.getElementById('btn-tvk-play');
    const tvkPlayIcon = document.getElementById('tvk-play-icon');
    const tvkPauseIcon = document.getElementById('tvk-pause-icon');
    const tvkPlaySpinner = document.getElementById('tvk-play-spinner');
    if (tvkBtn) {
      if (isBuffering) {
        tvkBtn.classList.add('buffering');
        if (tvkPlaySpinner) tvkPlaySpinner.classList.remove('hidden');
        if (tvkPlayIcon) tvkPlayIcon.classList.add('hidden');
        if (tvkPauseIcon) tvkPauseIcon.classList.add('hidden');
      } else {
        tvkBtn.classList.remove('buffering');
        if (tvkPlaySpinner) tvkPlaySpinner.classList.add('hidden');
        if (tvkPlayIcon) tvkPlayIcon.classList.remove('hidden');
        if (tvkPauseIcon) tvkPauseIcon.classList.remove('hidden');
      }
    }
    if (isBuffering) {
      if (el.btnPlayPause) el.btnPlayPause.classList.add('buffering');
      if (el.playbarSpinner) el.playbarSpinner.classList.remove('hidden');
      if (el.playIcon) el.playIcon.classList.add('hidden');
      if (el.pauseIcon) el.pauseIcon.classList.add('hidden');
      setPlayPauseState(true, true);
    } else {
      if (el.btnPlayPause) el.btnPlayPause.classList.remove('buffering');
      if (el.playbarSpinner) el.playbarSpinner.classList.add('hidden');
      if (el.playIcon) el.playIcon.classList.remove('hidden');
      if (el.pauseIcon) el.pauseIcon.classList.remove('hidden');
      setPlayPauseState(actuallyPlaying, true);
    }
  }

  setPlayPauseState(false, false);

  function formatDuration(/** @type {number | undefined} */ sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  if (el.btnResetVfx) {
    el.btnResetVfx.addEventListener('click', () => {
      state.vfx = { ...defaultVfx };
      localStorage.setItem('devsize_vfx', JSON.stringify(state.vfx));
      applyVisualEffects();
    });
  }

  if (window.electronAPI) {
    if (el.btnMinimize) el.btnMinimize.addEventListener('click', () => window.electronAPI.minimizeWindow());
    if (el.btnMaximize) el.btnMaximize.addEventListener('click', () => window.electronAPI.maximizeWindow());
    if (el.btnClose) el.btnClose.addEventListener('click', () => window.electronAPI.closeWindow());
  }

  if (el.navDiscover) el.navDiscover.addEventListener('click', () => switchView('discover'));
  if (el.navFavorites) el.navFavorites.addEventListener('click', () => switchView('favorites'));
  if (el.navAlbums) el.navAlbums.addEventListener('click', () => switchView('albums'));
  const navArtistsBtn = document.getElementById('nav-artists');
  if (navArtistsBtn) navArtistsBtn.addEventListener('click', () => switchView('artists'));
  if (el.navLocal) el.navLocal.addEventListener('click', () => switchView('local'));
  if (el.navHistory) el.navHistory.addEventListener('click', () => switchView('history'));
  if (el.navQueue) el.navQueue.addEventListener('click', () => switchView('queue'));
  if (el.navSettings) el.navSettings.addEventListener('click', () => switchView('settings'));

  if (el.btnAddLocalFiles) el.btnAddLocalFiles.addEventListener('click', () => importLocalFiles());
  // a whole folder (and its subfolders) at once: computers and Android, iPhones pick files
  const btnAddLocalFolder = document.getElementById('btn-add-local-folder');
  const canAddFolder = !isPhoneApp || (window.Capacitor && window.Capacitor.getPlatform() === 'android');
  if (btnAddLocalFolder && canAddFolder && window.electronAPI) {
    btnAddLocalFolder.hidden = false;
    btnAddLocalFolder.addEventListener('click', () => importLocalFiles({ folder: true }));
  }
  if (el.btnAddLocalFilesEmpty) el.btnAddLocalFilesEmpty.addEventListener('click', () => importLocalFiles());


  if (el.btnSavePresetDialog) {
    el.btnSavePresetDialog.addEventListener('click', () => {
      if (el.newPresetName) el.newPresetName.value = '';
      if (el.savePresetModal) openModal(el.savePresetModal);
      if (el.newPresetName) el.newPresetName.focus();
    });
  }

  if (el.btnCancelPreset) {
    el.btnCancelPreset.addEventListener('click', () => {
      if (el.savePresetModal) closeModal(el.savePresetModal);
    });
  }

  if (el.btnConfirmSavePreset) {
    el.btnConfirmSavePreset.addEventListener('click', () => {
      const name = el.newPresetName ? el.newPresetName.value : '';
      if (name.trim()) {
        saveCustomPreset(name);
        if (el.savePresetModal) closeModal(el.savePresetModal);
      }
    });
  }

  if (el.newPresetName) {
    el.newPresetName.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter' && el.btnConfirmSavePreset) el.btnConfirmSavePreset.click();
      if (e.key === 'Escape' && el.btnCancelPreset) el.btnCancelPreset.click();
    });
  }

  if (el.btnCancelRenamePreset) {
    el.btnCancelRenamePreset.addEventListener('click', () => {
      if (el.renamePresetModal) closeModal(el.renamePresetModal);
    });
  }

  if (el.btnConfirmRenamePreset) {
    el.btnConfirmRenamePreset.addEventListener('click', () => {
      const name = el.renamePresetName ? el.renamePresetName.value : '';
      if (name.trim() && state.presetToRenameId) {
        renameCustomPreset(state.presetToRenameId, name);
        if (el.renamePresetModal) closeModal(el.renamePresetModal);
      }
    });
  }

  if (el.renamePresetName) {
    el.renamePresetName.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter' && el.btnConfirmRenamePreset) el.btnConfirmRenamePreset.click();
      if (e.key === 'Escape' && el.btnCancelRenamePreset) el.btnCancelRenamePreset.click();
    });
  }

  const deletePresetModal = document.getElementById('delete-preset-modal');
  const btnCancelDeletePreset = document.getElementById('btn-cancel-delete-preset');
  const btnConfirmDeletePreset = document.getElementById('btn-confirm-delete-preset');

  if (btnCancelDeletePreset) {
    btnCancelDeletePreset.addEventListener('click', () => {
      if (deletePresetModal) closeModal(deletePresetModal);
    });
  }

  if (btnConfirmDeletePreset) {
    btnConfirmDeletePreset.addEventListener('click', () => {
      if (state.presetToDeleteId) {
        deleteCustomPreset(state.presetToDeleteId);
        state.presetToDeleteId = null;
      }
      if (deletePresetModal) closeModal(deletePresetModal);
    });
  }

  // Slide-over drawer: "Now playing" (cover + lyrics) and "Queue" tabs, closed by default.
  const btnToggleQueue = document.getElementById('btn-toggle-queue');
  const drawerTabs = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.drawer-tab'));
  function syncDrawerUI() {
    const open = state.isRightPanelOpen;
    if (open && !viz.animationFrameId) { viz.hasDrawnPausedFrame = false; startVisualizers(); }
    if (el.rightPanel) el.rightPanel.classList.toggle('hidden', !open);
    drawerTabs.forEach((t) => {
      const on = t.dataset.drawerTab === state.drawerTab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-pressed', String(on));
    });
    const now = document.getElementById('drawer-now');
    const queue = document.getElementById('drawer-queue');
    if (now) now.classList.toggle('hidden', state.drawerTab !== 'now');
    if (queue) queue.classList.toggle('hidden', state.drawerTab !== 'queue');
    if (el.btnToggleLyricsPanel) el.btnToggleLyricsPanel.classList.toggle('active', open && state.drawerTab === 'now');
    if (btnToggleQueue) btnToggleQueue.classList.toggle('active', open && state.drawerTab === 'queue');
  }
  function openPanelDrawer(/** @type {string} */ tab) {
    state.drawerTab = tab || state.drawerTab;
    state.isRightPanelOpen = true;
    syncDrawerUI();
    // drawn once the pane shows: while hidden it has no height, and the list drew only its first rows
    if (state.drawerTab === 'queue') { renderQueueView(); showPlayingInQueue(); }
    setTimeout(resizeCanvases, 150);
  }
  // the queue opens on the song playing (the one before it just above), not on songs that played long ago
  function showPlayingInQueue() {
    const pane = document.getElementById('drawer-queue-scroll');
    const list = /** @type {HTMLElement} */ (el.queueTracksList);
    if (!pane || !list || state.queueIndex < 0) return;
    const listTop = list.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    pane.scrollTop = listTop + Math.max(0, state.queueIndex - 1) * (list._rowHeight || 64);
  }
  function closePanelDrawer() {
    state.isRightPanelOpen = false;
    syncDrawerUI();
  }
  function togglePanelDrawer(/** @type {string} */ tab) {
    if (state.isRightPanelOpen && state.drawerTab === tab) closePanelDrawer(); else openPanelDrawer(tab);
  }
  if (el.btnToggleLyricsPanel) el.btnToggleLyricsPanel.addEventListener('click', () => togglePanelDrawer('now'));
  if (btnToggleQueue) btnToggleQueue.addEventListener('click', () => togglePanelDrawer('queue'));
  if (el.btnCloseRightPanel) el.btnCloseRightPanel.addEventListener('click', closePanelDrawer);
  drawerTabs.forEach((t) => t.addEventListener('click', () => openPanelDrawer(t.dataset.drawerTab || '')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isRightPanelOpen && !document.querySelector('.modal-backdrop:not(.hidden)')) closePanelDrawer();
  });
  syncDrawerUI();

  (function initPanelResize() {
    const edge = document.getElementById('panel-resize-edge');
    const panel = el.rightPanel || document.getElementById('right-panel');
    if (!edge || !panel) return;

    const savedWidth = localStorage.getItem('uriel_right_panel_width');
    if (savedWidth) {
      const w = parseInt(savedWidth, 10);
      if (w >= 260 && w <= 720) {
        panel.style.width = `${w}px`;
        panel.style.setProperty('--right-panel-width', `${w}px`);
      }
    }

    let startX = 0;
    let startW = 0;
    let pendingW = 0;
    let raf = 0;

    const limits = () => ({ min: 260, max: Math.min(720, window.innerWidth - 300) });

    edge.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      edge.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startW = panel.getBoundingClientRect().width;
      pendingW = Math.round(startW);
      edge.classList.add('dragging');
      document.body.classList.add('is-resizing-panel');
      e.preventDefault();
    });

    edge.addEventListener('pointermove', (e) => {
      if (!edge.hasPointerCapture(e.pointerId)) return;
      const { min, max } = limits();
      pendingW = Math.max(min, Math.min(max, Math.round(startW + (startX - e.clientX))));
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          panel.style.width = `${pendingW}px`;
          panel.style.setProperty('--right-panel-width', `${pendingW}px`);
        });
      }
    });

    const stopDrag = (/** @type {PointerEvent} */ e) => {
      if (!edge.hasPointerCapture(e.pointerId)) return;
      try { edge.releasePointerCapture(e.pointerId); } catch (_) {}
      edge.classList.remove('dragging');
      document.body.classList.remove('is-resizing-panel');
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (pendingW >= 260 && pendingW <= 720) {
        localStorage.setItem('uriel_right_panel_width', pendingW.toString());
      }
      if (typeof resizeCanvases === 'function') resizeCanvases();
    };

    edge.addEventListener('pointerup', stopDrag);
    edge.addEventListener('pointercancel', stopDrag);

    edge.addEventListener('dblclick', () => {
      panel.style.width = '340px';
      panel.style.setProperty('--right-panel-width', '340px');
      localStorage.setItem('uriel_right_panel_width', '340px');
      if (typeof resizeCanvases === 'function') resizeCanvases();
    });
  })();

  if (el.searchInput) {
    el.searchInput.addEventListener('input', (/** @type {Event} */ e) => {
      const val = /** @type {HTMLInputElement} */ (e.target).value;
      if (window.UrielShare && window.UrielShare.payloadFrom(val)) { performSearch(val); return; }
      if (val && el.searchClearBtn) {
        el.searchClearBtn.classList.remove('hidden');
      } else if (el.searchClearBtn) {
        el.searchClearBtn.classList.add('hidden');
      }
      if (!val.trim()) {
        if (el.discoverEmpty) el.discoverEmpty.classList.remove('hidden');
        if (el.searchResultsContainer) el.searchResultsContainer.classList.add('hidden');
        const artistCardContainer = document.getElementById('search-artist-card-container');
        if (artistCardContainer) artistCardContainer.innerHTML = '';
        if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();
      }
    });

    el.searchInput.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter') {
        const val = el.searchInput.value.trim();
        if (val) performSearch(val);
      } else if (e.key === 'Escape') {
        el.searchInput.value = '';
        if (el.searchClearBtn) el.searchClearBtn.classList.add('hidden');
        if (el.discoverEmpty) el.discoverEmpty.classList.remove('hidden');
        if (el.searchResultsContainer) el.searchResultsContainer.classList.add('hidden');
        const artistCardContainer = document.getElementById('search-artist-card-container');
        if (artistCardContainer) artistCardContainer.innerHTML = '';
        if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();
      }
    });
  }

  if (el.searchIconBtn) {
    el.searchIconBtn.addEventListener('click', () => {
      const val = el.searchInput ? el.searchInput.value.trim() : '';
      if (val) performSearch(val);
    });
  }

  if (el.searchClearBtn) {
    el.searchClearBtn.addEventListener('click', () => {
      if (el.searchInput) el.searchInput.value = '';
      el.searchClearBtn.classList.add('hidden');
      if (el.discoverEmpty) el.discoverEmpty.classList.remove('hidden');
      if (el.searchResultsContainer) el.searchResultsContainer.classList.add('hidden');
      const artistCardContainer = document.getElementById('search-artist-card-container');
      if (artistCardContainer) artistCardContainer.innerHTML = '';
      if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();
    });
  }


  function setPlatform(/** @type {string} */ platform, triggerSearch = true) {
    if (!['youtube', 'ytmusic', 'soundcloud'].includes(platform)) platform = 'youtube';
    state.platform = platform;
    localStorage.setItem('uriel_platform', platform);

    if (el.platformYt) el.platformYt.classList.toggle('active', platform === 'youtube');
    if (el.platformYtm) el.platformYtm.classList.toggle('active', platform === 'ytmusic');
    if (el.platformSc) el.platformSc.classList.toggle('active', platform === 'soundcloud');

    const select = /** @type {HTMLSelectElement} */ (document.getElementById('select-engine-api'));
    if (select) select.value = platform;
    const label = document.getElementById('engine-api-label');
    /** @type {Record<string, string>} */
    const nameMap = { youtube: 'YouTube', ytmusic: 'YouTube Music', soundcloud: 'SoundCloud' };
    if (label) label.textContent = nameMap[platform] || 'YouTube';
    const menu = document.getElementById('engine-api-menu');
    if (menu) {
      /** @type {NodeListOf<HTMLElement>} */ (menu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
        opt.classList.toggle('selected', opt.dataset.value === platform);
      });
    }

    if (triggerSearch && el.searchInput && el.searchInput.value.trim()) {
      performSearch(el.searchInput.value);
    }
  }

  const savedPlatform = localStorage.getItem('uriel_platform') || 'youtube';
  setPlatform(savedPlatform, false);

  if (el.platformYt) el.platformYt.addEventListener('click', () => setPlatform('youtube'));
  if (el.platformYtm) el.platformYtm.addEventListener('click', () => setPlatform('ytmusic'));
  if (el.platformSc) el.platformSc.addEventListener('click', () => setPlatform('soundcloud'));

  const engineApiDropdown = document.getElementById('engine-api-dropdown');
  const engineApiTrigger = document.getElementById('engine-api-trigger');
  const engineApiMenu = document.getElementById('engine-api-menu');
  if (engineApiDropdown && engineApiTrigger && engineApiMenu) {
    engineApiTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      engineApiDropdown.classList.toggle('open');
    });

    /** @type {NodeListOf<HTMLElement>} */ (engineApiMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        setPlatform(val || '');
        engineApiDropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', () => {
      engineApiDropdown.classList.remove('open');
    });
  }

  function updateEngineWidthVar() {
    const container = /** @type {HTMLElement} */ (document.querySelector('.platform-switch-container'));
    if (!container) return;
    const isHidden = document.body.classList.contains('hide-engine-btns');
    if (isHidden) {
      document.documentElement.style.setProperty('--engine-w', '0px');
      document.documentElement.style.setProperty('--engine-gap', '0px');
    } else {
      const isCompact = document.body.classList.contains('compact-engine-btns');
      const w = isCompact ? 124 : (container.offsetWidth || 435);
      if (w > 0) {
        document.documentElement.style.setProperty('--engine-w', `${w}px`);
        document.documentElement.style.setProperty('--engine-gap', '16px');
      }
    }
  }

  const btnCompactEngineBtns = document.getElementById('btn-compact-engine-btns');
  const isCompactEngine = localStorage.getItem('uriel_compact_engine_btns') === '1';
  document.body.classList.toggle('compact-engine-btns', isCompactEngine);
  if (btnCompactEngineBtns) {
    btnCompactEngineBtns.classList.toggle('active', isCompactEngine);
    btnCompactEngineBtns.addEventListener('click', () => {
      const next = !btnCompactEngineBtns.classList.contains('active');
      btnCompactEngineBtns.classList.toggle('active', next);
      document.body.classList.toggle('compact-engine-btns', next);
      localStorage.setItem('uriel_compact_engine_btns', next ? '1' : '0');
      updateEngineWidthVar();
      setTimeout(updateEngineWidthVar, 350);
    });
  }

  const btnHideEngineBtns = document.getElementById('btn-hide-engine-btns');
  const isHideEngine = localStorage.getItem('uriel_hide_engine_btns') === '1';
  document.body.classList.toggle('hide-engine-btns', isHideEngine);
  if (btnHideEngineBtns) {
    btnHideEngineBtns.classList.toggle('active', isHideEngine);
    btnHideEngineBtns.addEventListener('click', () => {
      const next = !btnHideEngineBtns.classList.contains('active');
      btnHideEngineBtns.classList.toggle('active', next);
      document.body.classList.toggle('hide-engine-btns', next);
      localStorage.setItem('uriel_hide_engine_btns', next ? '1' : '0');
      updateEngineWidthVar();
      setTimeout(updateEngineWidthVar, 350);
    });
  }

  const btnPersistSound = document.getElementById('btn-persist-sound-settings');
  if (btnPersistSound) {
    btnPersistSound.classList.toggle('active', soundPersistenceEnabled);
    btnPersistSound.addEventListener('click', () => {
      const next = !btnPersistSound.classList.contains('active');
      btnPersistSound.classList.toggle('active', next);
      soundPersistenceEnabled = next;
      localStorage.setItem('uriel_persist_sound_settings', next ? '1' : '0');
      if (next) persistSoundSettings();
    });
  }

  if (el.btnPlayPause) el.btnPlayPause.addEventListener('click', togglePlayPause);
  if (el.btnNext) el.btnNext.addEventListener('click', playNext);
  if (el.btnPrev) el.btnPrev.addEventListener('click', playPrev);

  function setShuffle(/** @type {boolean} */ on) {
    state.isShuffle = !!on;
    localStorage.setItem('uriel_shuffle', state.isShuffle ? '1' : '0');
    if (state.isShuffle) shuffleQueue();
    else unshuffleQueue();
    // same array, new order: the queue list has to be drawn again
    if (el.queueTracksList) el.queueTracksList._renderedQueue = null;
    updateQueueBadge();
    // drawn now rather than on the next frame, so the list is in its new order before it scrolls to the song
    if (state.isRightPanelOpen && state.drawerTab === 'queue') { renderQueueView(); showPlayingInQueue(); }
    if (el.btnShuffle) el.btnShuffle.classList.toggle('active', state.isShuffle);
    if (el.btnTvkShuffle) {
      el.btnTvkShuffle.classList.toggle('active', state.isShuffle);
      el.btnTvkShuffle.setAttribute('aria-pressed', String(state.isShuffle));
    }
    window.dispatchEvent(new Event('uriel:modes')); // the phone's lock-screen / Dynamic Island buttons follow
  }
  if (el.btnShuffle) {
    el.btnShuffle.classList.toggle('active', state.isShuffle);
    el.btnShuffle.addEventListener('click', () => setShuffle(!state.isShuffle));
  }
  if (el.btnTvkShuffle) {
    el.btnTvkShuffle.classList.toggle('active', state.isShuffle);
    el.btnTvkShuffle.setAttribute('aria-pressed', String(state.isShuffle));
    el.btnTvkShuffle.addEventListener('click', () => setShuffle(!state.isShuffle));
  }

  // one tap repeats the playlist, the next one the song (the icon gets a 1), the third turns repeat off
  /** @type {Record<string, string>} */
  const REPEAT_TITLES = { off: 'Repeat', all: 'Repeat: playlist', one: 'Repeat: this song' };
  function setRepeatMode(/** @type {string} */ mode) {
    state.repeatMode = REPEAT_TITLES[mode] ? mode : 'off';
    state.isRepeat = state.repeatMode === 'one';
    localStorage.setItem('uriel_repeat', /** @type {Record<string, string>} */ ({ off: '0', all: 'all', one: '1' })[state.repeatMode]);
    if (el.btnRepeat) {
      el.btnRepeat.classList.toggle('active', state.repeatMode !== 'off');
      el.btnRepeat.classList.toggle('repeat-one', state.isRepeat);
      el.btnRepeat.title = T(REPEAT_TITLES[state.repeatMode]);
      el.btnRepeat.setAttribute('aria-label', T(REPEAT_TITLES[state.repeatMode]));
    }
    if (el.btnTvkRepeat) {
      el.btnTvkRepeat.classList.toggle('active', state.repeatMode !== 'off');
      el.btnTvkRepeat.classList.toggle('repeat-one', state.isRepeat);
      el.btnTvkRepeat.title = T(REPEAT_TITLES[state.repeatMode]);
      el.btnTvkRepeat.setAttribute('aria-label', T(REPEAT_TITLES[state.repeatMode]));
      el.btnTvkRepeat.setAttribute('aria-pressed', String(state.repeatMode !== 'off'));
    }
    window.dispatchEvent(new Event('uriel:modes'));
  }
  setRepeatMode(state.repeatMode);
  if (el.btnRepeat) {
    el.btnRepeat.addEventListener('click', () => setRepeatMode(/** @type {Record<string, string>} */ ({ off: 'all', all: 'one', one: 'off' })[state.repeatMode]));
  }
  if (el.btnTvkRepeat) {
    el.btnTvkRepeat.addEventListener('click', () => setRepeatMode(/** @type {Record<string, string>} */ ({ off: 'all', all: 'one', one: 'off' })[state.repeatMode]));
  }

  window.toggleShuffle = () => el.btnShuffle && el.btnShuffle.click();
  window.toggleRepeat = () => el.btnRepeat && el.btnRepeat.click();

  function persistVolumeState() {
    try {
      localStorage.setItem('uriel_volume', String(state.volume));
      localStorage.setItem('uriel_muted', state.isMuted ? '1' : '0');
    } catch (e) {}
  }

  function syncVolumeControls() {
    if (el.volumeSlider) el.volumeSlider.value = String(state.volume);
    if (el.tvkVolumeSlider) el.tvkVolumeSlider.value = String(state.volume);
    if (el.volumeIcon) el.volumeIcon.classList.toggle('hidden', state.isMuted);
    if (el.volumeMutedIcon) el.volumeMutedIcon.classList.toggle('hidden', !state.isMuted);
  }

  function setVolumeFromSlider(/** @type {HTMLInputElement | null} */ slider) {
    const value = Number(slider && slider.value);
    if (!Number.isFinite(value)) return;
    state.volume = Math.max(0, Math.min(1, value));
    state.isMuted = false;
    syncVolumeControls();
    persistVolumeState();
    applyAudioSettings();
  }

  syncVolumeControls();
  if (el.volumeSlider) {
    el.volumeSlider.addEventListener('input', (/** @type {Event} */ e) => setVolumeFromSlider(/** @type {HTMLInputElement} */ (e.currentTarget)));
  }
  if (el.tvkVolumeSlider) {
    el.tvkVolumeSlider.addEventListener('input', (/** @type {Event} */ e) => setVolumeFromSlider(/** @type {HTMLInputElement} */ (e.currentTarget)));
  }

  if (el.btnVolumeMute) {
    el.btnVolumeMute.addEventListener('click', () => {
      state.isMuted = !state.isMuted;
      syncVolumeControls();
      persistVolumeState();
      applyAudioSettings();
    });
  }

  if (el.btnToggleFav) {
    el.btnToggleFav.addEventListener('click', () => {
      if (state.currentTrack) toggleFavoriteTrack(state.currentTrack);
    });
  }

  if (el.btnClearHistory) {
    el.btnClearHistory.addEventListener('click', () => {
      state.history = [];
      localStorage.setItem('devsize_history', '[]');
      renderHistoryView();
    });
  }

  if (el.btnClearQueue) {
    el.btnClearQueue.addEventListener('click', () => {
      state.queue = [];
      state.queueIndex = -1;
      state.queueHistory = [];
      state.unshuffledQueue = null;
      updateQueueBadge();
      renderQueueView();
    });
  }

  if (el.playlistSearchInput) {
    el.playlistSearchInput.addEventListener('input', () => {
      if (state.currentPlaylistId) openPlaylistDetail(state.currentPlaylistId);
    });
  }
  if (el.btnBackPlaylists) el.btnBackPlaylists.addEventListener('click', () => switchView('discover'));

  const deletePlaylistModal = document.getElementById('delete-playlist-modal');
  const deletePlaylistMsg = document.getElementById('delete-playlist-msg');
  const btnCancelDeletePlaylist = document.getElementById('btn-cancel-delete-playlist');
  const btnConfirmDeletePlaylist = document.getElementById('btn-confirm-delete-playlist');

  if (el.btnDeletePlaylist) {
    el.btnDeletePlaylist.addEventListener('click', () => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl) return;
      if (deletePlaylistMsg) I18N.text(deletePlaylistMsg, 'Delete playlist "{0}"? This action cannot be undone.', pl.name);
      if (deletePlaylistModal) openModal(deletePlaylistModal);
    });
  }

  if (btnCancelDeletePlaylist && deletePlaylistModal) {
    btnCancelDeletePlaylist.addEventListener('click', () => {
      closeModal(deletePlaylistModal);
    });
  }

  if (btnConfirmDeletePlaylist && deletePlaylistModal) {
    btnConfirmDeletePlaylist.addEventListener('click', () => {
      deleteCurrentPlaylist();
      closeModal(deletePlaylistModal);
      showToast(Tm('Playlist deleted'));
    });
  }



  // "Or import one" (the service buttons under Create) only when making an empty playlist
  const showCreateImportBar = (/** @type {boolean} */ on) => { const bar = el.createPlaylistModal && el.createPlaylistModal.querySelector('.cpm-import-bar'); if (bar) bar.classList.toggle('hidden', !on); };

  if (el.btnNewPlaylist) {
    el.btnNewPlaylist.addEventListener('click', () => {
      tracksForNewPlaylist = null;
      if (el.newPlaylistInput) el.newPlaylistInput.value = '';
      showCreateImportBar(true);
      if (el.createPlaylistModal) openModal(el.createPlaylistModal);
      if (el.newPlaylistInput) el.newPlaylistInput.focus();
    });
  }

  if (el.btnCancelNewPlaylist) {
    el.btnCancelNewPlaylist.addEventListener('click', () => {
      tracksForNewPlaylist = null;
      if (el.createPlaylistModal) closeModal(el.createPlaylistModal);
    });
  }

  if (el.btnConfirmNewPlaylist) {
    el.btnConfirmNewPlaylist.addEventListener('click', () => {
      const name = el.newPlaylistInput ? el.newPlaylistInput.value : '';
      if (!name.trim()) return;
      const pending = tracksForNewPlaylist;
      tracksForNewPlaylist = null;
      if (pending && pending.length) {
        // made from the add dialog: put the song(s) in and stay where the user was
        const seen = new Set();
        const pl = createPlaylist(name, pending.filter((/** @type {UrielTrack} */ t) => t && t.id && !seen.has(t.id) && seen.add(t.id)), '', { open: false });
        if (pl) showToast(pl.tracks.length === 1 ? Tm('Added to "{0}"', pl.name) : Tm('Added {0} songs to "{1}"', pl.tracks.length, pl.name), 'success');
      } else {
        createPlaylist(name);
      }
      if (el.createPlaylistModal) closeModal(el.createPlaylistModal);
    });
  }

  if (el.newPlaylistInput) {
    el.newPlaylistInput.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter' && el.btnConfirmNewPlaylist) el.btnConfirmNewPlaylist.click();
      if (e.key === 'Escape' && el.btnCancelNewPlaylist) el.btnCancelNewPlaylist.click();
    });
  }

  if (el.btnCancelAddPlaylist) {
    el.btnCancelAddPlaylist.addEventListener('click', () => {
      if (el.addToPlaylistModal) closeModal(el.addToPlaylistModal);
    });
  }

  const btnCloseAddPlaylist = document.getElementById('btn-close-add-playlist-modal');
  if (btnCloseAddPlaylist) {
    btnCloseAddPlaylist.addEventListener('click', () => {
      if (el.addToPlaylistModal) closeModal(el.addToPlaylistModal);
    });
  }

  const btnCreatePlFromAdd = document.getElementById('btn-create-pl-from-add-modal');
  if (btnCreatePlFromAdd) {
    btnCreatePlFromAdd.addEventListener('click', () => {
      tracksForNewPlaylist = manyToAddToPlaylist ? manyToAddToPlaylist.slice() : (trackToAddToPlaylist ? [trackToAddToPlaylist] : null);
      if (el.addToPlaylistModal) closeModal(el.addToPlaylistModal);
      if (el.createPlaylistModal) {
        if (el.newPlaylistInput) el.newPlaylistInput.value = '';
        showCreateImportBar(false);
        openModal(el.createPlaylistModal);
        if (el.newPlaylistInput) el.newPlaylistInput.focus();
      }
    });
  }

  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.audio-tab')).forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.audio-tab').forEach((t) => t.classList.toggle('active', t === tab));
      /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.audio-panel')).forEach((p) => p.classList.toggle('active', p.dataset.audioPanel === tab.dataset.audioTab));
    });
  });

  if (el.btnOpenSettings) {
    el.btnOpenSettings.addEventListener('click', () => {
      const tempoTab = /** @type {HTMLElement} */ (document.querySelector('.audio-tab[data-audio-tab="tempo"]') || document.querySelector('.audio-tab'));
      if (tempoTab) tempoTab.click();
      if (el.audioSettingsModal) openModal(el.audioSettingsModal);
      refreshStacks();
    });
  }

  if (el.btnCloseSettings) {
    el.btnCloseSettings.addEventListener('click', () => {
      if (el.audioSettingsModal) closeModal(el.audioSettingsModal);
    });
  }

  if (el.audioSettingsModal) {
    el.audioSettingsModal.addEventListener('click', (/** @type {MouseEvent} */ e) => {
      if (e.target === el.audioSettingsModal) closeModal(el.audioSettingsModal);
    });
  }

  if (el.btnOpenVisualSettings) {
    el.btnOpenVisualSettings.addEventListener('click', () => {
      if (el.visualSettingsModal) openModal(el.visualSettingsModal);
    });
  }

  if (el.btnCloseVisualSettings) {
    el.btnCloseVisualSettings.addEventListener('click', () => {
      if (el.visualSettingsModal) closeModal(el.visualSettingsModal);
    });
  }

  if (el.visualSettingsModal) {
    el.visualSettingsModal.addEventListener('click', (/** @type {MouseEvent} */ e) => {
      if (e.target === el.visualSettingsModal) closeModal(el.visualSettingsModal);
    });
  }

  if (el.btnToggleHqAudio) {
    el.btnToggleHqAudio.addEventListener('click', () => {
      state.hqEnabled = !state.hqEnabled;
      el.btnToggleHqAudio.classList.toggle('active', state.hqEnabled);
      
      if (el.hqPanelWrapper) {
        el.hqPanelWrapper.classList.toggle('expanded', state.hqEnabled);
        if (el.hqEnhancerCard) el.hqEnhancerCard.classList.toggle('is-expanded', state.hqEnabled);
      }
      initAudioContext();
      updateHqRouting();
      persistSoundSettings();
    });
  }

  if (el.hqPresetChips) {
    el.hqPresetChips.forEach((/** @type {HTMLElement} */ chip) => {
      chip.addEventListener('click', () => {
        el.hqPresetChips.forEach((/** @type {HTMLElement} */ c) => c.classList.remove('active'));
        chip.classList.add('active');
        state.hqSettings.preset = chip.dataset.preset;

        let v = 0, a = 0, b = 0;
        if (state.hqSettings.preset === 'studio') { v = 0; a = 0; b = 0; }
        else if (state.hqSettings.preset === 'vinyl') { v = 15; a = -15; b = 25; }
        else if (state.hqSettings.preset === 'concert') { v = -10; a = 30; b = 15; }

        if (el.sliderHqVocal) { el.sliderHqVocal.value = String(v); el.valHqVocal.textContent = (v > 0 ? '+' : '') + v + '%'; state.hqSettings.vocal = v; }
        if (el.sliderHqAir) { el.sliderHqAir.value = String(a); el.valHqAir.textContent = (a > 0 ? '+' : '') + a + '%'; state.hqSettings.air = a; }
        if (el.sliderHqBass) { el.sliderHqBass.value = String(b); el.valHqBass.textContent = (b > 0 ? '+' : '') + b + '%'; state.hqSettings.bass = b; }

        applyHqSettings();
      });
    });
  }

  /** @type {const} */ (['Vocal', 'Air', 'Bass']).forEach(type => {
    const slider = el[/** @type {const} */ (`sliderHq${type}`)];
    const valDisplay = el[/** @type {const} */ (`valHq${type}`)];
    if (slider) {
      slider.addEventListener('input', (/** @type {Event} */ e) => {
        const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
        if (valDisplay) valDisplay.textContent = (val > 0 ? '+' : '') + val + '%';
        state.hqSettings[type.toLowerCase()] = val;
        if (el.hqPresetChips) el.hqPresetChips.forEach((/** @type {HTMLElement} */ c) => c.classList.remove('active'));
        applyHqSettings();
      });
    }
  });

  if (el.hqEngineSelect) {
    el.hqEngineSelect.addEventListener('change', (/** @type {Event} */ e) => {
      state.hqSettings.engine = /** @type {HTMLInputElement} */ (e.target).value;
      applyHqSettings();
    });
  }

  const hqDropdown = document.getElementById('hq-engine-dropdown');
  const hqTrigger = document.getElementById('hq-engine-trigger');
  const hqLabel = document.getElementById('hq-engine-label');
  const hqMenu = document.getElementById('hq-engine-menu');

  if (hqTrigger && hqDropdown && hqMenu) {
    hqTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      hqDropdown.classList.toggle('open');
    });

    /** @type {NodeListOf<HTMLElement>} */ (hqMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value || '';
        if (hqLabel) hqLabel.textContent = opt.textContent;
        hqMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        if (el.hqEngineSelect) {
          el.hqEngineSelect.value = val;
          el.hqEngineSelect.dispatchEvent(new Event('change'));
        }
        hqDropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', () => {
      hqDropdown.classList.remove('open');
    });
  }

  if (el.sliderSpeed) {
    el.sliderSpeed.addEventListener('input', (/** @type {Event} */ e) => {
      const val = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
      setTempoValues({ speed: val, speedPitch: 1.0 });
      if (el.sliderSpeedPitch) el.sliderSpeedPitch.value = '1';
      if (el.valSpeedPitch) el.valSpeedPitch.textContent = '1.00x';
      if (el.valSpeed) el.valSpeed.textContent = `${val.toFixed(2)}x`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderSpeedPitch) {
    el.sliderSpeedPitch.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
      setTempoValues({ speedPitch: val, speed: 1.0 });
      if (el.sliderSpeed) el.sliderSpeed.value = '1';
      if (el.valSpeed) el.valSpeed.textContent = '1.00x';
      if (el.valSpeedPitch) el.valSpeedPitch.textContent = `${val.toFixed(2)}x`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderPitch) {
    el.sliderPitch.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      setTempoValues({ pitch: val });
      if (el.valPitch) el.valPitch.textContent = `${val > 0 ? '+' : ''}${val} st`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderReverb) {
    el.sliderReverb.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.audioSettings.reverb = val;
      if (el.valReverb) el.valReverb.textContent = `${val}%`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderDistortion) {
    el.sliderDistortion.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.audioSettings.distortion = val;
      if (el.valDistortion) el.valDistortion.textContent = `${val}%`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderGain) {
    el.sliderGain.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      setTempoValues({ volume: val / 100 });
      if (el.valGain) el.valGain.textContent = `${val}%`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderEcho) {
    el.sliderEcho.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.audioSettings.echo = val;
      if (el.valEcho) el.valEcho.textContent = `${val}%`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  /** @type {const} */ ([['low', 'Low'], ['mid', 'Mid'], ['high', 'High']]).forEach(([band, cap]) => {
    const slider = el[/** @type {const} */ (`sliderEq${cap}`)];
    const valEl = el[/** @type {const} */ (`valEq${cap}`)];
    if (slider) {
      slider.addEventListener('input', (/** @type {Event} */ e) => {
        initAudioContext();
        const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
        if (!state.audioSettings.eq) state.audioSettings.eq = { low: 0, mid: 0, high: 0 };
        state.audioSettings.eq[band] = val;
        if (valEl) valEl.textContent = `${val > 0 ? '+' : ''}${val} dB`;
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });
      slider.addEventListener('dblclick', () => {
        initAudioContext();
        slider.value = '0';
        if (!state.audioSettings.eq) state.audioSettings.eq = { low: 0, mid: 0, high: 0 };
        state.audioSettings.eq[band] = 0;
        if (valEl) valEl.textContent = '0 dB';
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });
    }
  });

  function init10BandEqUI() {
    if (!el.eqBands) return;

    el.eqBands.innerHTML = '';
    const currentBands = state.audioSettings.eqBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    EQ_BAND_LABELS.forEach((freqLabel, i) => {
      const col = document.createElement('div');
      col.className = 'eq-band';

      const valSpan = document.createElement('span');
      valSpan.className = 'eq-band-val';
      const initialVal = currentBands[i] !== undefined ? currentBands[i] : 0;
      valSpan.textContent = `${initialVal > 0 ? '+' : ''}${initialVal} dB`;

      const sliderBox = document.createElement('div');
      sliderBox.className = 'eq-slider-box';

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'eq-band-range';
      input.min = '-12';
      input.max = '12';
      input.step = '1';
      input.value = String(initialVal);
      sliderBox.appendChild(input);

      const freqSpan = document.createElement('span');
      freqSpan.className = 'eq-band-freq';
      freqSpan.textContent = freqLabel;

      input.addEventListener('input', (e) => {
        initAudioContext();
        const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
        if (!Array.isArray(state.audioSettings.eqBands)) {
          state.audioSettings.eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        }
        state.audioSettings.eqBands[i] = val;
        valSpan.textContent = `${val > 0 ? '+' : ''}${val} dB`;
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });

      input.addEventListener('dblclick', () => {
        initAudioContext();
        input.value = '0';
        if (!Array.isArray(state.audioSettings.eqBands)) {
          state.audioSettings.eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        }
        state.audioSettings.eqBands[i] = 0;
        valSpan.textContent = '0 dB';
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });

      col.appendChild(valSpan);
      col.appendChild(sliderBox);
      col.appendChild(freqSpan);
      el.eqBands.appendChild(col);
    });

    if (el.btnResetEqBands) {
      el.btnResetEqBands.addEventListener('click', () => {
        initAudioContext();
        state.audioSettings.eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const inputs = /** @type {NodeListOf<HTMLInputElement>} */ (el.eqBands.querySelectorAll('.eq-band-range'));
        const valLabels = el.eqBands.querySelectorAll('.eq-band-val');
        inputs.forEach((input, i) => {
          input.value = '0';
          if (valLabels[i]) valLabels[i].textContent = '0 dB';
        });
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });
    }
  }

  init10BandEqUI();

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
    SITE_THEMES.forEach((t) => {
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
  function syncSiteThemeCards() {
    const site = activeSiteTheme();
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.site-theme-card')).forEach((c) => {
      const on = c.dataset.siteTheme === 'system' ? state.siteTheme === 'system' : !!site && c.dataset.siteTheme === site.id;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
  }
  // id '' goes back to the accent-only palette; `apply` false when the caller repaints the theme itself
  function setSiteTheme(/** @type {string} */ id, apply = true) {
    if (id === 'system') {
      state.siteTheme = 'system';
      try { localStorage.setItem('uriel_site_theme', 'system'); } catch (e) {}
      if (apply) applySystemColors();
      return;
    }
    const t = SITE_THEMES.find((x) => x.id === id);
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
          const targetMode = currentEffectiveMode || 'dark';
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
        const targetMode = currentEffectiveMode || 'dark';
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
        const targetMode = currentEffectiveMode || 'dark';
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

  const btnChooseBannerMedia = document.getElementById('btn-choose-banner-media');
  const btnResetBannerMedia = document.getElementById('btn-reset-banner-media');

  if (btnChooseBannerMedia) {
    btnChooseBannerMedia.addEventListener('click', async () => {
      if (window.electronAPI && window.electronAPI.pickMedia) {
        const url = await window.electronAPI.pickMedia();
        if (url) {
          localStorage.setItem('uriel_banner_media', url);
          const thumb = getTrackThumbUrl(state.currentTrack);
          updateRightPanelBanner(thumb);
          updatePlaylistDetailBanner(thumb);
        }
      }
    });
  }

  if (btnResetBannerMedia) {
    btnResetBannerMedia.addEventListener('click', () => {
      localStorage.removeItem('uriel_banner_media');
      const thumb = getTrackThumbUrl(state.currentTrack);
      updateRightPanelBanner(thumb);
      updatePlaylistDetailBanner(thumb);
    });
  }

  const sliderBannerBlur = /** @type {HTMLInputElement} */ (document.getElementById('slider-banner-blur'));
  const valBannerBlur = document.getElementById('val-banner-blur');
  if (sliderBannerBlur) {
    sliderBannerBlur.value = String(savedBannerBlur);
    if (valBannerBlur) valBannerBlur.textContent = `${savedBannerBlur}px`;
    sliderBannerBlur.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      document.documentElement.style.setProperty('--banner-blur', `${v}px`);
      if (valBannerBlur) valBannerBlur.textContent = `${v}px`;
      localStorage.setItem('uriel_banner_blur', v.toString());
    });
  }

  const sliderBannerOpacity = /** @type {HTMLInputElement} */ (document.getElementById('slider-banner-opacity'));
  const valBannerOpacity = document.getElementById('val-banner-opacity');
  if (sliderBannerOpacity) {
    sliderBannerOpacity.value = String(savedBannerOpacity);
    if (valBannerOpacity) valBannerOpacity.textContent = `${savedBannerOpacity}%`;
    sliderBannerOpacity.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      document.documentElement.style.setProperty('--banner-opacity', `${v / 100}`);
      if (valBannerOpacity) valBannerOpacity.textContent = `${v}%`;
      localStorage.setItem('uriel_banner_opacity', v.toString());
    });
  }

  const sliderBannerFade = /** @type {HTMLInputElement} */ (document.getElementById('slider-banner-fade'));
  const valBannerFade = document.getElementById('val-banner-fade');
  if (sliderBannerFade) {
    sliderBannerFade.value = String(savedBannerFade);
    if (valBannerFade) valBannerFade.textContent = `${savedBannerFade}%`;
    sliderBannerFade.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      document.documentElement.style.setProperty('--banner-fade-base', `${v}%`);
      document.documentElement.style.setProperty('--banner-fade-end', `${v}%`);
      const rightBanner = document.getElementById('right-panel-banner');
      if (rightBanner) {
        rightBanner.style.setProperty('--banner-fade-base', `${v}%`);
        rightBanner.style.setProperty('--banner-fade-end', `${v}%`);
      }
      if (valBannerFade) valBannerFade.textContent = `${v}%`;
      localStorage.setItem('uriel_banner_fade', v.toString());
    });
  }

  function applyBannerFit(/** @type {string} */ fit) {
    const root = document.documentElement;
    const val = fit || 'zoom';
    if (val === 'fit') {
      root.style.setProperty('--banner-fit', 'contain');
      root.style.setProperty('--banner-object-fit', 'contain');
      root.style.setProperty('--banner-scale', 'none');
    } else if (val === 'stretch') {
      root.style.setProperty('--banner-fit', '100% 100%');
      root.style.setProperty('--banner-object-fit', 'fill');
      root.style.setProperty('--banner-scale', 'none');
    } else {
      root.style.setProperty('--banner-fit', 'cover');
      root.style.setProperty('--banner-object-fit', 'cover');
      root.style.setProperty('--banner-scale', 'scale(1.06)');
    }
  }

  const selectBannerFit = /** @type {HTMLSelectElement} */ (document.getElementById('select-banner-fit'));
  const bannerFitDropdown = document.getElementById('banner-fit-dropdown');
  const bannerFitTrigger = document.getElementById('banner-fit-trigger');
  const bannerFitLabel = document.getElementById('banner-fit-label');
  const bannerFitMenu = document.getElementById('banner-fit-menu');

  if (selectBannerFit) {
    selectBannerFit.value = savedBannerFit;
  }

  if (bannerFitDropdown && bannerFitTrigger && bannerFitMenu) {
    const curFit = savedBannerFit || 'zoom';
    if (bannerFitLabel) {
      bannerFitLabel.textContent = curFit.charAt(0).toUpperCase() + curFit.slice(1);
    }
    /** @type {NodeListOf<HTMLElement>} */ (bannerFitMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.classList.toggle('selected', opt.dataset.value === curFit);
    });

    bannerFitTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      bannerFitDropdown.classList.toggle('open');
    });

    /** @type {NodeListOf<HTMLElement>} */ (bannerFitMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        localStorage.setItem('uriel_banner_fit', String(val));
        applyBannerFit(val || '');
        if (bannerFitLabel) bannerFitLabel.textContent = opt.textContent;
        bannerFitMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        if (selectBannerFit) selectBannerFit.value = String(val);
        bannerFitDropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', () => {
      bannerFitDropdown.classList.remove('open');
    });
  }

  function syncBgVideoPlayback() {
    const v = /** @type {HTMLVideoElement} */ (document.querySelector('#custom-bg video'));
    if (!v) return;
    const hidden = document.hidden || document.body.classList.contains('perf');
    if (hidden) v.pause(); else v.play().catch(() => {});
  }
  document.addEventListener('visibilitychange', syncBgVideoPlayback);
  if (window.electronAPI && window.electronAPI.onWindowVisibility) window.electronAPI.onWindowVisibility(() => syncBgVideoPlayback());

  function currentUiAlpha() { return Number(/** @type {HTMLInputElement} */ (document.getElementById('slider-ui-alpha')).value); }
  function setUiAlphaViaSlider(/** @type {number} */ v) { const s = /** @type {HTMLInputElement} */ (document.getElementById('slider-ui-alpha')); if (!s) return; s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }

  // ---- Settings → Background: your own picture or video, the cover background and the mesh (app/background.js) ----
  const backgroundPart = /** @type {UrielBackgroundPart} */ ({});
  function updateCustomBg() { return backgroundPart.updateCustomBg(); }
  function onBackgroundChanged(/** @type {string} */ kind, /** @type {boolean} */ enabled) { return backgroundPart.onBackgroundChanged(kind, enabled); }
  window.UrielApp.background({ applyFxClip, closeModal, currentUiAlpha, getAdv, getTrackThumbUrl, LiquidMotion, meshLayer: () => activeMeshLayer, PALETTE_STYLES, registerFx, setCoverBg, setUiAlphaViaSlider, showToast, state, syncBgVideoPlayback, Tm, updateThemeFromState }, backgroundPart);

  document.body.classList.toggle('no-blur', !getAdv('blur_fx', true));

  const sliderGlassBlur = /** @type {HTMLInputElement} */ (document.getElementById('slider-glass-blur'));
  const valGlassBlur = document.getElementById('val-glass-blur');
  function applyGlass() {
    const on = getAdv('glass_blur', false);
    const px = Math.max(4, Math.min(40, parseInt(localStorage.getItem('uriel_glass_blur') || '16', 10) || 16));
    document.body.classList.toggle('glass', on);
    document.documentElement.style.setProperty('--glass-blur', `${px}px`);
    if (sliderGlassBlur) sliderGlassBlur.value = String(px);
    if (valGlassBlur) valGlassBlur.textContent = `${px}px`;
    const strengthRow = document.getElementById('setting-glass-strength');
    if (strengthRow) strengthRow.classList.toggle('is-disabled', !on);
    updateCustomBg();
  }
  if (sliderGlassBlur) sliderGlassBlur.addEventListener('input', () => {
    localStorage.setItem('uriel_glass_blur', sliderGlassBlur.value);
    applyGlass();
  });
  applyGlass();

  const fpsBtns = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-fps-cap]'));
  const syncFpsBtns = () => {
    const cur = localStorage.getItem('uriel_fps_cap') || '60';
    fpsBtns.forEach((/** @type {HTMLElement} */ b) => b.classList.toggle('active', b.dataset.fpsCap === cur));
  };
  fpsBtns.forEach((b) => b.addEventListener('click', () => { localStorage.setItem('uriel_fps_cap', String(b.dataset.fpsCap)); viz.userFpsCap = parseInt(String(b.dataset.fpsCap), 10) || 0; syncFpsBtns(); }));
  syncFpsBtns();

  const btnHwAccel = document.getElementById('btn-hw-accel');
  if (btnHwAccel && window.electronAPI && window.electronAPI.getHwAccel) {
    window.electronAPI.getHwAccel().then((/** @type {boolean} */ on) => btnHwAccel.classList.toggle('active', on !== false));
    btnHwAccel.addEventListener('click', () => {
      const next = !btnHwAccel.classList.contains('active');
      btnHwAccel.classList.toggle('active', next);
      window.electronAPI.setHwAccel(next);
      showToast(Tm('Restart Uriel to apply'), 'info');
    });
  }

  const advButtons = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.effect-switch-btn[data-adv]'));
  advButtons.forEach((btn) => {
    const key = btn.dataset.adv || '';
    const defaultVal = key === 'reduce_motion' ? systemPrefersReducedMotion() : (key === 'mesh_gradient' || key === 'glass_blur' || key === 'mesh_cover_color' || key === 'clip_fx') ? false : true;
    const currentVal = getAdv(key, defaultVal);
    btn.classList.toggle('active', currentVal);

    btn.addEventListener('click', () => {
      const newVal = !btn.classList.contains('active');
      document.querySelectorAll(`.effect-switch-btn[data-adv="${key}"]`).forEach(b => b.classList.toggle('active', newVal));
      setAdv(key, newVal);

      if (key === 'reduce_motion') {
        applyReducedMotionSetting();
      } else if (key === 'glass_blur') {
        applyGlass();
        // glass over a fully opaque UI does nothing, so make it see-through the first time
        if (newVal && parseInt(localStorage.getItem('uriel_ui_alpha') || DEFAULT_UI_ALPHA, 10) >= 100) {
          localStorage.setItem('uriel_ui_alpha', '60');
          applyUiOpacity();
          showToast(Tm('Interface opacity set to 60% so the glass shows'), 'info');
        }
      } else if (key === 'blur_fx') {
        document.body.classList.toggle('no-blur', !newVal);
      } else if (key === 'light_thumbs') {
        /** @type {NodeListOf<HTMLImageElement>} */ (document.querySelectorAll('.track-row-thumb[data-full], .quick-play-pill-img[data-full]')).forEach((img) => { img.src = listThumb(img.dataset.full || '') || img.dataset.full || ''; });
      } else if (key === 'mesh_gradient') {
        updateThemeFromState();
      } else if (key === 'mesh_follow_intensity') {
        lastMeshKey = '';
        if (lastMeshArgs) updateMeshGradient(...lastMeshArgs);
      } else if (key === 'mesh_cover_color') {
        refreshMeshCover();
        lastMeshKey = '';
        if (lastMeshArgs) updateMeshGradient(...lastMeshArgs);
      } else if (key === 'cover_bg') {
        const thumb = state.currentTrack ? getTrackThumbUrl(state.currentTrack) : '';
        setCoverBg(thumb);
        if (typeof onBackgroundChanged === 'function') onBackgroundChanged('cover', newVal);
      } else if (key === 'clip_fx') {
        document.body.classList.toggle('no-clip-fx', !newVal);
        applyFxClip();
      } else if (key === 'albums') {
        if (!newVal && state.currentView === 'album') {
          const target = (state.previousView && state.previousView !== 'album') ? state.previousView : 'discover';
          switchView(target);
        }
      } else if (key === 'my_wave' || key === 'jump_back') {
        initHomeHero();
        if (newVal) loadHomePage();
      } else if (key === 'my_wave_ambient') {
        const homeAmb = document.getElementById('home-ambient');
        if (homeAmb) homeAmb.style.display = newVal ? '' : 'none';
        const ambientEl = document.getElementById('my-wave-ambient-light');
        if (ambientEl) ambientEl.style.display = newVal ? '' : 'none';
        const jumpAmbient = document.getElementById('jump-ambient-light');
        if (jumpAmbient) jumpAmbient.style.display = newVal ? '' : 'none';
      } else if (key === 'banners' || key === 'track_banners') {
        const bannerR = document.getElementById('right-panel-banner');
        const bannerP = document.getElementById('playlist-header-banner');
        const showR = getAdv('banners', true) && getAdv('track_banners', true);
        const showP = getAdv('banners', true);
        if (bannerR) {
          bannerR.style.display = showR ? '' : 'none';
          if (!showR) {
            bannerR.style.opacity = '0';
            const vid = bannerR.querySelector('video.banner-video');
            if (vid) vid.remove();
          }
        }
        if (bannerP) {
          bannerP.style.display = showP ? '' : 'none';
          if (!showP) {
            bannerP.style.opacity = '0';
          }
        }
        if (showR && state.currentTrack) {
          updateRightPanelBanner(getTrackThumbUrl(state.currentTrack));
        }
        if (state.isTvKaraokeOpen) syncTvBanner();
      } else if (key === 'karaoke_words') {
        renderLyricsView();
      }
    });
  });

  const btnSearchArtists = document.getElementById('btn-search-artists');
  if (btnSearchArtists) {
    btnSearchArtists.classList.toggle('active', localStorage.getItem('uriel_search_artists') !== '0');
    btnSearchArtists.addEventListener('click', () => {
      const v = !btnSearchArtists.classList.contains('active');
      btnSearchArtists.classList.toggle('active', v);
      localStorage.setItem('uriel_search_artists', v ? '1' : '0');
    });
  }

  const btnSmooth = document.getElementById('btn-smooth-presets');
  if (btnSmooth) {
    btnSmooth.classList.toggle('active', localStorage.getItem('uriel_smooth_presets') !== 'false');
    btnSmooth.addEventListener('click', () => {
      const v = !btnSmooth.classList.contains('active');
      btnSmooth.classList.toggle('active', v);
      localStorage.setItem('uriel_smooth_presets', String(v));
    });
  }
  if (sidebarEl) {
    sidebarEl.classList.add('no-nav-anim');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sidebarEl.classList.remove('no-nav-anim');
      });
    });
  }

  const btnShowLocal = document.getElementById('btn-show-local');
  function updateShowLocalUI(animate = false) {
    const show = localStorage.getItem('uriel_show_local') !== 'false';
    if (el.navLocal) el.navLocal.classList.toggle('nav-collapsed', !show);
    if (btnShowLocal) btnShowLocal.classList.toggle('active', show);
    if (!show && state.currentView === 'local') {
      switchView('discover');
    }
    if (animate) {
      const t0 = performance.now();
      (function f() {
        refreshStacks();
        updateNavIndicator(false);
        if (performance.now() - t0 < 350) requestAnimationFrame(f);
      })();
    } else {
      refreshStacks();
      updateNavIndicator(false);
    }
  }
  if (btnShowLocal) {
    btnShowLocal.addEventListener('click', () => {
      const show = localStorage.getItem('uriel_show_local') !== 'false';
      localStorage.setItem('uriel_show_local', (!show) ? 'true' : 'false');
      updateShowLocalUI(true);
      refreshStacks();
    });
  }
  updateShowLocalUI(false);
  applyShowAlbums();
  updateAlbumsCount();

  // Settings > Tracks > Show explicit tag [E] on songs (on unless turned off)
  const toggleExplicitTag = document.getElementById('toggle-explicit-tag');
  function applyExplicitTag() {
    const on = localStorage.getItem('uriel_show_explicit') !== '0';
    document.body.classList.toggle('hide-explicit-badges', !on);
    if (toggleExplicitTag) toggleExplicitTag.classList.toggle('active', on);
  }
  if (toggleExplicitTag) {
    toggleExplicitTag.addEventListener('click', () => {
      localStorage.setItem('uriel_show_explicit', localStorage.getItem('uriel_show_explicit') === '0' ? '1' : '0');
      applyExplicitTag();
    });
  }
  applyExplicitTag();

  function applyNoHandCursor(/** @type {boolean} */ on) {
    document.body.classList.toggle('no-hand-cursor', !!on);
  }
  const btnNoHandCursor = document.getElementById('btn-no-hand-cursor');
  const noHand = localStorage.getItem('uriel_no_hand_cursor') !== '0';
  applyNoHandCursor(noHand);
  if (btnNoHandCursor) {
    btnNoHandCursor.classList.toggle('active', noHand);
    btnNoHandCursor.addEventListener('click', () => {
      const next = !btnNoHandCursor.classList.contains('active');
      btnNoHandCursor.classList.toggle('active', next);
      localStorage.setItem('uriel_no_hand_cursor', next ? '1' : '0');
      applyNoHandCursor(next);
    });
  }

  function applyHighlightButtons(/** @type {boolean} */ on) {
    document.body.classList.toggle('highlight-buttons', !!on);
  }
  const btnHighlightButtons = document.getElementById('btn-highlight-buttons');
  const initialHighlightButtons = localStorage.getItem('uriel_highlight_buttons') !== '0';
  applyHighlightButtons(initialHighlightButtons);
  if (btnHighlightButtons) {
    btnHighlightButtons.classList.toggle('active', initialHighlightButtons);
    btnHighlightButtons.addEventListener('click', () => {
      const next = !btnHighlightButtons.classList.contains('active');
      btnHighlightButtons.classList.toggle('active', next);
      localStorage.setItem('uriel_highlight_buttons', next ? '1' : '0');
      applyHighlightButtons(next);
    });
  }

  function watchSliderValue(/** @type {HTMLInputElement} */ input, /** @type {() => void} */ onChange) {
    const desc = /** @type {{ get: () => string, set: (v: string) => void }} */ (Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'));
    Object.defineProperty(input, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); onChange(); } });
    input.addEventListener('input', onChange);
  }
  /** @param {ParentNode} [root] */
  function enhanceSliders(root) {
    /** @type {NodeListOf<HTMLInputElement>} */ ((root || document).querySelectorAll('input[type="range"]:not(.sl-done):not(#slider-theme-hue)')).forEach((/** @type {HTMLInputElement} */ input) => {
      if (input.closest('.eq-slider-box') || input.closest('.eq-slider-wrap') || input.closest('.hue-seg') || input.classList.contains('eq-band-range')) return;
      input.classList.add('sl-done');
      const wrap = document.createElement('div');
      wrap.className = 'sl';
      wrap.innerHTML = '<div class="sl-active"></div><div class="sl-inactive"></div>';
      input.before(wrap);
      wrap.appendChild(input);
      const sync = () => {
        const min = input.min === '' ? 0 : parseFloat(input.min);
        const max = input.max === '' ? 100 : parseFloat(input.max);
        wrap.style.setProperty('--v', String(max > min ? (parseFloat(input.value) - min) / (max - min) : 0));
      };
      watchSliderValue(input, sync);
      sync();
    });
  }
  enhanceSliders();
  let sliderRaf = 0;
  // text-only changes (the playbar clock, counters) can't add a slider or a switch: skip the document scan for them
  const addsElements = (/** @type {MutationRecord[]} */ muts) => muts.some((/** @type {MutationRecord} */ m) => Array.prototype.some.call(m.addedNodes, (n) => n.nodeType === 1));
  new MutationObserver((muts) => { if (sliderRaf || !addsElements(muts)) return; sliderRaf = requestAnimationFrame(() => { sliderRaf = 0; enhanceSliders(); }); }).observe(document.body, { childList: true, subtree: true });

  (function initHueSegments() {
    const input = /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-hue'));
    const track = document.querySelector('.hue-seg-track');
    const host = document.getElementById('hue-seg');
    if (!input || !track || !host) return;
    for (let i = 0; i < 12; i++) {
      const seg = document.createElement('i');
      seg.style.background = `linear-gradient(90deg, hsl(${i * 30} 75% 55%), hsl(${(i + 1) * 30} 75% 55%))`;
      track.appendChild(seg);
    }
    const sync = () => {
      const min = input.min === '' ? 0 : parseFloat(input.min);
      const max = input.max === '' ? 360 : parseFloat(input.max);
      host.style.setProperty('--v', String(max > min ? (parseFloat(input.value) - min) / (max - min) : 0));
    };
    watchSliderValue(input, sync);
    sync();
  })();

  // Settings: Show on Discord (desktop only, where the presence bridge exists)
  const btnDiscordPresence = document.getElementById('btn-discord-presence');
  if (btnDiscordPresence && window.electronAPI && typeof window.electronAPI.discordPresenceUpdate === 'function') {
    /** @type {HTMLElement} */ (document.getElementById('setting-discord-row')).style.display = '';
    btnDiscordPresence.classList.toggle('active', discordPresenceOn());
    btnDiscordPresence.addEventListener('click', () => {
      const on = !discordPresenceOn();
      localStorage.setItem('uriel_discord_presence', on ? 'true' : 'false');
      btnDiscordPresence.classList.toggle('active', on);
      if (on) updateDiscordPresence();
      else if (window.electronAPI.discordPresenceClear) window.electronAPI.discordPresenceClear();
    });
  }

  const btnWavyProgress = document.getElementById('btn-wavy-progress');
  function updateWavyProgressUI() {
    const isWavy = localStorage.getItem('uriel_wavy_progress') !== 'false';
    const isPerf = document.body.classList.contains('perf');
    document.body.classList.toggle('no-wavy', isPerf ? true : !isWavy);
    if (btnWavyProgress) {
      btnWavyProgress.classList.toggle('active', isWavy);
    }
  }

  const btnProgressKnob = document.getElementById('btn-progress-knob');
  function updateProgressKnobUI() {
    const isHidden = localStorage.getItem('uriel_progress_knob') === 'false';
    document.body.classList.toggle('no-knob', isHidden);
    if (btnProgressKnob) {
      btnProgressKnob.classList.toggle('active', !isHidden);
    }
  }

  const btnProgressBg = document.getElementById('btn-progress-bg');
  function updateProgressBgUI() {
    const isHidden = localStorage.getItem('uriel_progress_bg') === 'false';
    document.body.classList.toggle('no-progress-bg', isHidden);
    if (btnProgressBg) {
      btnProgressBg.classList.toggle('active', !isHidden);
    }
  }

  // ---- the animated cover beside the player bar (app/m3Cover.js) ----
  const m3CoverPart = /** @type {UrielM3CoverPart} */ ({});
  function m3cEnabled() { return m3CoverPart.m3cEnabled(); }
  function m3cInit() { return m3CoverPart.m3cInit(); }
  function m3cSetImage(/** @type {string} */ url) { return m3CoverPart.m3cSetImage(url); }
  function m3cDraw(/** @type {number} */ now) { return m3CoverPart.m3cDraw(now); }
  function m3cStart() { return m3CoverPart.m3cStart(); }
  function applyM3Cover() { return m3CoverPart.applyM3Cover(); }
  window.UrielApp.m3Cover({ el, getTrackThumbUrl, isPhoneApp, primaryColor, state, viz }, m3CoverPart);

  // auto battery saver: perf mode while a laptop runs on battery (the stored setting is left alone)
  let batterySaver = false;
  function storedPerfMode() { const v = localStorage.getItem('uriel_perf_mode'); return v === '1' || v === 'true'; }
  function applyPerfMode(/** @type {boolean} */ on) {
    on = !!on || batterySaver;
    document.body.classList.toggle('perf', on);
    const isWavy = localStorage.getItem('uriel_wavy_progress') !== 'false';
    document.body.classList.toggle('no-wavy', on ? true : !isWavy);
    syncBgVideoPlayback();
    applyM3Cover();
  }
  const btnBarWave = document.getElementById('btn-bar-wave');
  const barWaveOn = localStorage.getItem('uriel_bar_wave') !== '0';
  function applyBarWave(/** @type {boolean} */ on) {
    document.body.classList.toggle('bar-wave-off', !on);
    const vc = document.getElementById('visualizer-container');
    if (vc) {
      vc.style.display = on ? '' : 'none';
      vc.style.pointerEvents = on ? '' : 'none';
    }
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('visualizer-canvas'));
    if (canvas) {
      canvas.style.pointerEvents = on ? '' : 'none';
      if (!on) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    const needBassPulse = !!(state.vfx && state.vfx.bassPulse);
    if (!on) {
      if (audioEngine && audioEngine.setAnalyserEnabled && !needBassPulse) {
        audioEngine.setAnalyserEnabled(false);
      }
    } else {
      if (audioEngine && audioEngine.setAnalyserEnabled && state.isPlaying) {
        audioEngine.setAnalyserEnabled(true);
      }
      if (state.isPlaying) {
        startVisualizers();
      }
    }
  }
  applyBarWave(barWaveOn);
  if (btnBarWave) {
    btnBarWave.classList.toggle('active', barWaveOn);
    btnBarWave.addEventListener('click', () => {
      const next = !btnBarWave.classList.contains('active');
      btnBarWave.classList.toggle('active', next);
      localStorage.setItem('uriel_bar_wave', next ? '1' : '0');
      applyBarWave(next);
    });
  }

  const toggleM3Cover = document.getElementById('toggle-m3-cover');
  if (toggleM3Cover) {
    const saved = localStorage.getItem('uriel_m3_cover');
    const isM3On = saved !== '0';
    toggleM3Cover.classList.toggle('active', isM3On);
    toggleM3Cover.addEventListener('click', () => {
      const next = !toggleM3Cover.classList.contains('active');
      toggleM3Cover.classList.toggle('active', next);
      localStorage.setItem('uriel_m3_cover', next ? '1' : '0');
      applyM3Cover();
    });
  }

  updateTvkVisualizerSetting(localStorage.getItem('uriel_tvk_visualizer') !== 'false');
  updateTvkVisualizerLyricsSetting(localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true');
  updateTvkVisualizerOpacity(parseInt(localStorage.getItem('uriel_tvk_visualizer_opacity') || '85', 10));

  const btnPerfMode = document.getElementById('btn-perf-mode');
  const initialPerfMode = localStorage.getItem('uriel_perf_mode') === '1' || localStorage.getItem('uriel_perf_mode') === 'true';
  applyPerfMode(initialPerfMode);
  // the battery saver had no switch: on battery it forced performance mode with no way back
  const btnBatterySaver = document.getElementById('btn-battery-saver');
  const batterySaverWanted = () => localStorage.getItem('uriel_battery_saver') !== '0';
  /** @type {{ level: number, charging: boolean } | null} */
  let batteryRef = null;
  const syncBatterySaver = () => {
    const next = !!(batteryRef && batteryRef.charging === false && batterySaverWanted());
    if (next === batterySaver) return;
    batterySaver = next;
    applyPerfMode(storedPerfMode());
  };
  if (btnBatterySaver) {
    btnBatterySaver.classList.toggle('active', batterySaverWanted());
    btnBatterySaver.addEventListener('click', () => {
      const next = !btnBatterySaver.classList.contains('active');
      btnBatterySaver.classList.toggle('active', next);
      localStorage.setItem('uriel_battery_saver', next ? '1' : '0');
      syncBatterySaver();
    });
  }
  if (!isPhoneApp && typeof navigator.getBattery === 'function') {
    navigator.getBattery().then((b) => {
      batteryRef = b;
      syncBatterySaver();
      b.addEventListener('chargingchange', syncBatterySaver);
    }).catch(() => {});
  } else {
    const row = document.getElementById('setting-battery-saver');
    if (row) row.style.display = 'none';
  }
  if (btnPerfMode) {
    btnPerfMode.classList.toggle('active', initialPerfMode);
    btnPerfMode.addEventListener('click', () => {
      const next = !btnPerfMode.classList.contains('active');
      btnPerfMode.classList.toggle('active', next);
      localStorage.setItem('uriel_perf_mode', next ? '1' : '0');
      applyPerfMode(next);
    });
  }

  if (btnWavyProgress) {
    btnWavyProgress.addEventListener('click', () => {
      const isWavy = localStorage.getItem('uriel_wavy_progress') !== 'false';
      const next = !isWavy;
      localStorage.setItem('uriel_wavy_progress', next ? 'true' : 'false');
      updateWavyProgressUI();
      viz.hasDrawnPausedFrame = false;
    });
  }

  if (btnProgressKnob) {
    btnProgressKnob.addEventListener('click', () => {
      const isKnob = localStorage.getItem('uriel_progress_knob') !== 'false';
      const next = !isKnob;
      localStorage.setItem('uriel_progress_knob', next ? 'true' : 'false');
      updateProgressKnobUI();
      viz.hasDrawnPausedFrame = false;
      if (!viz.animationFrameId && typeof startVisualizers === 'function') startVisualizers();
    });
  }

  if (btnProgressBg) {
    btnProgressBg.addEventListener('click', () => {
      const isBg = localStorage.getItem('uriel_progress_bg') !== 'false';
      const next = !isBg;
      localStorage.setItem('uriel_progress_bg', next ? 'true' : 'false');
      updateProgressBgUI();
      viz.hasDrawnPausedFrame = false;
      if (!viz.animationFrameId && typeof startVisualizers === 'function') startVisualizers();
    });
  }

  updateWavyProgressUI();
  updateProgressKnobUI();
  updateProgressBgUI();

  const btnTrayOnClose = document.getElementById('btn-tray-on-close');
  const storedTrayOnClose = localStorage.getItem('uriel_tray_on_close');
  const savedTrayOnClose = storedTrayOnClose !== null
    ? storedTrayOnClose === 'true'
    : /Windows|Mac/.test(navigator.userAgent);
  if (btnTrayOnClose) {
    btnTrayOnClose.classList.toggle('active', savedTrayOnClose);
    btnTrayOnClose.addEventListener('click', () => {
      const next = !btnTrayOnClose.classList.contains('active');
      btnTrayOnClose.classList.toggle('active', next);
      localStorage.setItem('uriel_tray_on_close', next ? 'true' : 'false');
      if (window.electronAPI && window.electronAPI.setTrayOnClose) {
        window.electronAPI.setTrayOnClose(next);
      }
    });
  }
  if (window.electronAPI && window.electronAPI.setTrayOnClose) {
    window.electronAPI.setTrayOnClose(savedTrayOnClose);
  }

  // ---- Settings: the categories, back on phones, and search (app/settings.js) ----
  const settingsPart = /** @type {UrielSettingsPart} */ ({});
  function enterSettings() { return settingsPart.enterSettings(); }
  window.UrielApp.settings({ el, refreshStacks, reloadPluginsList, renderThemeCards }, settingsPart);

  // ---- custom themes and the custom CSS on the page (app/themes.js) ----
  const themesPart = /** @type {UrielThemesPart} */ ({});
  function applyCustomStyles() { return themesPart.applyCustomStyles(); }
  function loadCustomThemes() { return themesPart.loadCustomThemes(); }
  function renderThemeCards() { return themesPart.renderThemeCards(); }
  window.UrielApp.themes({ Tm, showToast, refreshCachedThemeColors, clearCssEditor, stopAllPlugins, renderPluginCards }, themesPart);

  // ---- plugins and the custom CSS editor (app/plugins.js) ----
  const pluginsPart = /** @type {UrielPluginsPart} */ ({});
  function emitPluginEvent(/** @type {string} */ event, /** @type {unknown} */ data = undefined) { return pluginsPart.emitPluginEvent(event, data); }
  function reloadPluginsList() { return pluginsPart.reloadPluginsList(); }
  function clearCssEditor() { return pluginsPart.clearCssEditor(); }
  function stopAllPlugins() { return pluginsPart.stopAllPlugins(); }
  function renderPluginCards() { return pluginsPart.renderPluginCards(); }
  function loadPlugins() { return pluginsPart.loadPlugins(); }
  window.UrielApp.plugins({ showToast, Tm, state, el, T, applyCustomStyles }, pluginsPart);

  function addSliderTicks(/** @type {HTMLInputElement} */ input) {
    const item = input.closest('.setting-item') || input.parentElement;
    const hints = item ? item.querySelector('.setting-hints') : null;
    const spans = hints ? [...hints.querySelectorAll('span')].map(s => s.textContent) : [];
    const min = +input.min, max = +input.max, step = +input.step || 1;
    const def = Number(input.getAttribute('value'));
    /** @type {Record<number, string | null>} */
    const labels = {};
    if (spans.length === 3) { labels[min] = spans[0]; labels[def] = spans[1]; labels[max] = spans[2]; }
    else if (spans.length === 2) { labels[min] = spans[0]; labels[max] = spans[1]; }
    const wrap = document.createElement('div'); wrap.className = 'slider-ticks';
    for (let v = min; v <= max; v += step) {
      const t = document.createElement('i'); t.style.setProperty('--p', String((v - min) / (max - min)));
      if (labels[v] != null) { t.className = 'major'; const s = document.createElement('span'); s.textContent = labels[v]; s.dataset.i18n = ''; t.appendChild(s); }
      wrap.appendChild(t);
    }
    const host = input.closest('.sl') || input;
    host.insertAdjacentElement('afterend', wrap);
    if (hints) hints.remove();
  }

  const scaleInput = /** @type {HTMLInputElement | null} */ (document.getElementById('settings-slider-scale'));
  if (scaleInput) addSliderTicks(scaleInput);
  /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#view-settings .pill-range')).forEach((input) => {
    if (input === scaleInput) return;
    const item = input.closest('.setting-item') || input.parentElement;
    const hints = item ? item.querySelector('.setting-hints') : null;
    if (!hints) return;
    const min = +input.min, max = +input.max, step = +input.step || 1;
    if ((max - min) / step <= 20) {
      addSliderTicks(input);
    }
  });

  function decorateSwitches() {
    document.querySelectorAll('.effect-switch-btn .thumb:not(.has-icon)').forEach((t) => {
      t.classList.add('has-icon');
      t.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sw-icon"/></svg>';
    });
  }
  let swRaf = 0;
  new MutationObserver((muts) => { if (swRaf || !addsElements(muts)) return; swRaf = requestAnimationFrame(() => { swRaf = 0; decorateSwitches(); }); }).observe(document.body, { childList: true, subtree: true });
  decorateSwitches();

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
    if (d.theme && preset && SITE_THEMES.some((t) => t.id === preset)) {
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

  const sliderCrossfade = /** @type {HTMLInputElement} */ (document.getElementById('slider-crossfade'));
  const valCrossfade = document.getElementById('val-crossfade');
  if (sliderCrossfade) {
    const cf = parseInt(localStorage.getItem('uriel_crossfade') || '0', 10);
    sliderCrossfade.value = String(cf);
    if (valCrossfade) valCrossfade.textContent = cf > 0 ? `${cf}s` : 'Off';
    sliderCrossfade.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (valCrossfade) valCrossfade.textContent = v > 0 ? `${v}s` : 'Off';
      localStorage.setItem('uriel_crossfade', String(v));
    });
  }

  if (el.btnTrEnabled) {
    el.btnTrEnabled.addEventListener('click', () => {
      state.trEnabled = !state.trEnabled;
      localStorage.setItem('uriel_tr_enabled', String(state.trEnabled));
      updateLyricsTranslationUI();
      if (!state.trEnabled) {
        state.trActive = false;
        state.currentTranslations = null;
        renderLyricsView();
        if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      } else if (state.trAuto) {
        state.trActive = true;
        updateLyricsTranslationUI();
        fetchAndApplyTranslation();
      }
    });
  }

  const trLangDropdown = document.getElementById('tr-lang-dropdown');
  const trLangTrigger = document.getElementById('tr-lang-trigger');
  const trLangLabel = document.getElementById('tr-lang-label');
  const trLangMenu = document.getElementById('tr-lang-menu');
  const trLangList = document.getElementById('tr-lang-list');
  const trLangSearch = /** @type {HTMLInputElement} */ (document.getElementById('tr-lang-search'));

  if (trLangDropdown && trLangTrigger && trLangMenu) {
    const curLang = state.trLang || 'en';
    if (trLangList) {
      trLangList.innerHTML = '';
      const frag = document.createDocumentFragment();
      TRANSLATION_LANGUAGES.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'm3-dropdown-option';
        btn.dataset.value = item.code;
        const text = `${item.flag} ${item.name} (${item.code})`;
        btn.textContent = text;
        if (item.code === curLang) {
          btn.classList.add('selected');
          if (trLangLabel) trLangLabel.textContent = text;
        }
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.trLang = item.code;
          localStorage.setItem('uriel_tr_lang', state.trLang);
          if (trLangLabel) trLangLabel.textContent = text;
          /** @type {NodeListOf<HTMLElement>} */ (trLangMenu.querySelectorAll('.m3-dropdown-option')).forEach((o) => o.classList.remove('selected'));
          btn.classList.add('selected');
          if (el.selectTrLang) el.selectTrLang.value = item.code;
          trLangDropdown.classList.remove('open');
          if (state.trActive) {
            fetchAndApplyTranslation();
          }
        });
        frag.appendChild(btn);
      });
      trLangList.appendChild(frag);

      if (el.selectTrLang) {
        el.selectTrLang.innerHTML = '';
        TRANSLATION_LANGUAGES.forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.code;
          opt.textContent = `${item.flag} ${item.name} (${item.code})`;
          el.selectTrLang.appendChild(opt);
        });
        el.selectTrLang.value = curLang;
      }
    }

    if (trLangSearch) {
      trLangSearch.addEventListener('click', (e) => e.stopPropagation());
      trLangSearch.addEventListener('input', (e) => {
        const q = /** @type {HTMLInputElement} */ (e.target).value.toLowerCase().trim();
        if (!trLangList) return;
        /** @type {NodeListOf<HTMLElement>} */ (trLangList.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
          const text = (opt.textContent || '').toLowerCase();
          const code = (opt.dataset.value || '').toLowerCase();
          opt.style.display = (!q || text.includes(q) || code.includes(q)) ? '' : 'none';
        });
      });
      trLangSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          trLangDropdown.classList.remove('open');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const firstVisible = /** @type {HTMLElement} */ (trLangList ? trLangList.querySelector('.m3-dropdown-option:not([style*="display: none"])') : null);
          if (firstVisible) firstVisible.click();
        }
      });
    }

    trLangTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = trLangDropdown.classList.toggle('open');
      if (isOpen && trLangSearch) {
        trLangSearch.value = '';
        if (trLangList) {
          /** @type {NodeListOf<HTMLElement>} */ (trLangList.querySelectorAll('.m3-dropdown-option')).forEach((opt) => opt.style.display = '');
        }
        setTimeout(() => trLangSearch.focus(), 50);
      }
    });

    document.addEventListener('click', () => {
      trLangDropdown.classList.remove('open');
    });
  }

  // ---- Settings → Interface → Language, the picker (app/language.js) ----
  window.UrielApp.language({ I18N, TRANSLATION_LANGUAGES, Tm, showToast });

  // ---- Settings → Lyrics: auto-translate and how synced lyrics move and look (app/lyricsSettings.js) ----
  window.UrielApp.lyricsSettings({ applyLyricsEase, applyLyricsGradientTightness, el, fetchAndApplyTranslation, getLyricsEase, getLyricsGradientTightness, getLyricsSpeed, getLyricsWordStyle, renderLyricsView, state, updateActiveGradient, updateLyricsTranslationUI, updateSyncedLyricsHighlight });

  if (el.btnResetAudio) {
    el.btnResetAudio.addEventListener('click', () => {
      state.activePresetId = 'p_default';
      state.audioSettings = { speed: 1.0, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
      state.hqSettings = { engine: 'hqmusic-3', preset: 'studio', vocal: 0, air: 0, bass: 0 };
      state.hqEnabled = false;
      syncSettingsSlidersToState();
      applyAudioSettings();
      applyHqSettings();
      renderPresets();
      showToast(Tm('Audio settings reset'), 'info');
    });
  }

  const toggleNormalize = document.getElementById('toggle-normalize');
  if (toggleNormalize) {
    const isNorm = localStorage.getItem('uriel_audio_normalize') === '1';
    toggleNormalize.classList.toggle('active', isNorm);
    toggleNormalize.addEventListener('click', () => {
      const active = !toggleNormalize.classList.contains('active');
      toggleNormalize.classList.toggle('active', active);
      localStorage.setItem('uriel_audio_normalize', active ? '1' : '0');
      if (!active) resetLevelWatcher();
    });
  }

  if (window.electronAPI && window.electronAPI.getAppVersion) {
    window.electronAPI.getAppVersion().then((/** @type {string} */ v) => {
      const a = document.getElementById('about-version'); if (a) a.textContent = 'Version ' + v;
      const t = document.querySelector('.settings-version-tag'); if (t) t.textContent = 'v' + v;
    }).catch(() => {});
  }

  function isTextInput(/** @type {EventTarget | null} */ target) {
    if (!target) return false;
    const node = /** @type {HTMLElement} */ (target);
    const tag = (node.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!node.isContentEditable;
  }

  function adjustVolume(/** @type {number} */ delta) {
    state.volume = Math.max(0, Math.min(1, Math.round((state.volume + delta) * 100) / 100));
    state.isMuted = false;
    syncVolumeControls();
    persistVolumeState();
    applyAudioSettings();
  }

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && !isTextInput(e.target)) {
      e.preventDefault();
    }
  }, true);

  window.addEventListener('keydown', (e) => {
    // Encore (full-screen) handles its own keys; shortcuts here acted on the app hidden behind it
    if (document.querySelector('.encore')) return;
    const inInput = isTextInput(e.target);

    if (e.code === 'Escape' || e.key === 'Escape') {
      const openModals = Array.from(/** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.modal-backdrop:not(.hidden)')));
      if (openModals.length > 0) {
        e.preventDefault();
        closeModal(openModals[openModals.length - 1]);
        return;
      }
      const tvkPanel = document.getElementById('tvk-panel');
      if (state.isTvKaraokeOpen && tvkPanel && tvkPanel.classList.contains('open')) {
        e.preventDefault();
        tvkPanel.classList.remove('open');
        const btnSettings = document.getElementById('btn-tvk-settings');
        if (btnSettings) btnSettings.classList.remove('open');
        resetTvIdleTimer();
        return;
      }
      if (state.isTvKaraokeOpen && typeof closeTvKaraoke === 'function') {
        e.preventDefault();
        closeTvKaraoke();
        return;
      }
      if (inInput) {
        e.preventDefault();
        /** @type {HTMLElement} */ (e.target).blur();
        return;
      }
      if (state.currentView === 'album') {
        e.preventDefault();
        const target = (state.previousView && state.previousView !== 'album') ? state.previousView : 'discover';
        switchView(target);
        return;
      }
      if (state.currentView === 'artist') {
        e.preventDefault();
        const target = (state.previousView && state.previousView !== 'artist') ? state.previousView : 'discover';
        switchView(target);
        return;
      }
      return;
    }

    if (inInput) {
      if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        return;
      }
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (syncState && syncState.active && syncState.currentIndex < syncState.lines.length) {
        handleSyncLineClick(syncState.currentIndex);
      } else {
        togglePlayPause();
      }
      return;
    }

    if ((e.code === 'KeyK' && (e.ctrlKey || e.metaKey)) || (!inInput && (e.code === 'Slash' || e.key === '/'))) {
      e.preventDefault();
      if (el.searchInput) {
        el.searchInput.focus();
        el.searchInput.select();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
        e.preventDefault();
        playNext();
        return;
      }
      if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
        e.preventDefault();
        playPrev();
        return;
      }
      if (e.code === 'ArrowUp' || e.key === 'ArrowUp') {
        e.preventDefault();
        adjustVolume(0.05);
        return;
      }
      if (e.code === 'ArrowDown' || e.key === 'ArrowDown') {
        e.preventDefault();
        adjustVolume(-0.05);
        return;
      }
    }

    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (el.nativeAudio) el.nativeAudio.currentTime = Math.min(el.nativeAudio.duration || 0, el.nativeAudio.currentTime + 5);
        return;
      }
      if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (el.nativeAudio) el.nativeAudio.currentTime = Math.max(0, el.nativeAudio.currentTime - 5);
        return;
      }
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (e.code === 'KeyM') {
        e.preventDefault();
        if (el.btnVolumeMute) el.btnVolumeMute.click();
        return;
      }
      if (e.code === 'KeyH') {
        e.preventDefault();
        if (typeof window.toggleShuffle === 'function') window.toggleShuffle();
        return;
      }
      if (e.code === 'KeyR') {
        e.preventDefault();
        if (typeof window.toggleRepeat === 'function') window.toggleRepeat();
        return;
      }
      if (e.code === 'KeyL') {
        e.preventDefault();
        if (el.btnToggleLyricsPanel) el.btnToggleLyricsPanel.click();
        return;
      }
      if (e.code === 'KeyF') {
        e.preventDefault();
        if (typeof openTvKaraoke === 'function') openTvKaraoke();
        return;
      }
      if (e.code === 'KeyP') {
        e.preventDefault();
        if (typeof toggleMiniWindow === 'function') toggleMiniWindow();
        return;
      }
    }
  }, true);

  function createWavyProgress(/** @type {HTMLElement} */ container) {
    const W = 240, H = 12, WL = 16; let d = `M0 ${H/2}`;
    for (let x = 0; x < W; x += WL) d += ` q ${WL/4} ${-H/2} ${WL/2} 0 t ${WL/2} 0`;
    container.innerHTML = `<svg class="wavy" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="wavy-track" pathLength="100" d="${d}"/><path class="wavy-fill" pathLength="100" d="${d}"/></svg>`;
    // the fill is cut to the progress, not drawn as a dash: with a stroke that doesn't stretch, Chrome measures dashes
    // in screen pixels, so a dash "the path's length" long was shorter than the bar. 0% showed a piece filled at the
    // right end that emptied as it went, and 100% filled only half
    const fill = /** @type {HTMLElement} */ (container.querySelector('.wavy-fill'));
    const set = (/** @type {number} */ p) => { fill.style.clipPath = `inset(0 ${100 - Math.max(0, Math.min(100, p))}% 0 0)`; };
    set(0);
    return { set };
  }
  window.createWavyProgress = createWavyProgress;

  /** @template T, R */
  async function pool(/** @type {T[]} */ items, /** @type {number} */ n, /** @type {(item: T, index: number) => Promise<R>} */ fn) {
    const results = new Array(items.length);
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const cur = idx++;
        results[cur] = await fn(items[cur], cur);
      }
    }
    const workers = Array.from({ length: Math.min(n, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  // tidying names for matching and reading lengths: shared with the importers (import-core.js)
  function normalizeImportText(/** @type {string | undefined} */ str) { return window.UrielImportCore.normalizeImportText(str); }
  function toSeconds(/** @type {unknown} */ dur) { return window.UrielImportCore.toSeconds(dur); }

  // ---- importing from Spotify, Apple Music, YouTube Music and links (app/imports.js) ----
  const importsPart = /** @type {UrielImportsPart} */ ({});
  function refreshYtSignin() { return importsPart.refreshYtSignin(); }
  function matchSpotifyTracks(/** @type {Partial<UrielImportSong>[]} */ list, /** @type {((done: number, total: number) => void) | undefined} */ onProgress) { return importsPart.matchSpotifyTracks(list, onProgress); }
  window.UrielApp.imports({ normalizeImportText, state, pool, escapeHtml, T, openModal, closeModal, getTrackCanonicalId, stampAddedAt, createWavyProgress, updateFavoritesBadge, updateFavoriteIcon, renderFavoritesView, createPlaylist, showToast, renderPlaylistsList, I18N, Tm, isSameTrack, openPlaylistDetail, isFavoriteSong, importSharedPlaylist, setPlatform, el }, importsPart);

  // ---- downloads: one song, a whole playlist or album, and the queue (app/downloads.js) ----
  const downloadsPart = /** @type {UrielDownloadsPart} */ ({});
  function openDownloadModal(/** @type {UrielTrack} */ track) { return downloadsPart.openDownloadModal(track); }
  function openDownloadAllModal(/** @type {UrielDownloadJob | UrielPlaylist | undefined} */ playlist) { return downloadsPart.openDownloadAllModal(playlist); }
  function updateDownloadCaptionPath() { return downloadsPart.updateDownloadCaptionPath(); }
  function downloadedInFolder(/** @type {UrielTrack[]} */ tracks) { return downloadsPart.downloadedInFolder(tracks); }
  // the song the download dialog is open for (the dialog's Trim pane works on it)
  function getTrackToDownload() { return downloadsPart.getTrackToDownload(); }
  window.UrielApp.downloads({ I18N, T, Tf, Tm, audioEngine, closeModal, el, formatDuration, isPhoneApp, isSameTrack, multiSel, offlineChanged, openModal, prepareTrimPane, refreshPlaylistDownloads, showDownloadPane, showToast, sortTracksFor, state, toolsReady }, downloadsPart);

  updateFavoritesBadge();
  fetch(`http://127.0.0.1:${state.serverPort}/api/library`).then(r => r.json()).then(data => {
    state.localTracks = data;
    updateLocalBadge();
  }).catch(() => {});
  renderPlaylistsList();
  renderPresets();
  syncSettingsSlidersToState();
  applyVisualEffects();

  const analysisCache = new Map();
  /** @type {UrielTrack[]} */
  let myWaveCurrentTracks = [];
  /** @type {UrielTrack[]} */
  let jumpBackCurrentTracks = [];
  let homeMode = localStorage.getItem('uriel_home_pane') === 'recent' ? 'recent' : 'wave';
  let isExtendingMyWave = false;

  function getCachedTrackAnalysis(/** @type {string | undefined} */ trackId) {
    if (!trackId) return null;
    const cleanId = String(trackId).replace(/[^a-zA-Z0-9_-]/g, '_');
    if (analysisCache.has(cleanId)) return analysisCache.get(cleanId);
    try {
      const stored = localStorage.getItem(`uriel_audio_analysis_${cleanId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        analysisCache.set(cleanId, parsed);
        capMap(analysisCache, 300);
        return parsed;
      }
    } catch (e) {}
    return null;
  }

  function setCachedTrackAnalysis(/** @type {string | undefined} */ trackId, /** @type {Record<string, unknown> | null} */ analysis) {
    if (!trackId || !analysis) return;
    const cleanId = String(trackId).replace(/[^a-zA-Z0-9_-]/g, '_');
    analysisCache.set(cleanId, analysis);
    capMap(analysisCache, 300);
    try {
      localStorage.setItem(`uriel_audio_analysis_${cleanId}`, JSON.stringify(analysis));
      fetch(`http://127.0.0.1:${state.serverPort}/api/track-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cleanId, analysis })
      }).catch(() => {});
    } catch (e) {}
  }

  function getTrackNormalizedKey(/** @type {string | undefined} */ artist, /** @type {string | undefined} */ title) {
    let a = String(artist || '').toLowerCase();
    let t = String(title || '').toLowerCase();
    t = t.replace(/\s*\([^)]*official[^)]*\)/gi, '')
         .replace(/\s*\[[^\]]*\]/gi, '')
         .replace(/\s*\([^)]*(video|audio|remaster(ed)?|lyrics?|visualizer)[^)]*\)/gi, '');
    t = t.replace(/\s*(feat\.?|ft\.?)\s+[^(\[-]+/gi, '')
         .replace(/\s*\((feat\.?|ft\.?)[^)]*\)/gi, '');
    a = a.replace(/\s*(feat\.?|ft\.?)\s+.*$/gi, '');
    a = a.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    return `${a}::${t}`;
  }

  const WAVE_SKIPS_KEY = 'uriel_wave_skips';

  function normalizeArtistName(/** @type {string} */ name) {
    return String(name || '')
      .replace(/\b(official|vevo|records|topic)\b/gi, '')
      .replace(/[^\w\s&-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function getWaveSkips() {
    try {
      const raw = localStorage.getItem(WAVE_SKIPS_KEY);
      return Array.isArray(JSON.parse(raw || 'null')) ? JSON.parse(raw || 'null') : [];
    } catch (e) {
      return [];
    }
  }

  function recordWaveSkip(/** @type {UrielTrack} */ track) {
    if (!track) return;
    const key = (typeof getTrackNormalizedKey === 'function') ? getTrackNormalizedKey(track.artist, track.title) : '';
    const artist = (track.artist || '').trim();
    if (!key && !artist) return;
    const skips = getWaveSkips();
    skips.push({ key, artist, t: Date.now() });
    if (skips.length > 200) {
      skips.splice(0, skips.length - 200);
    }
    try {
      localStorage.setItem(WAVE_SKIPS_KEY, JSON.stringify(skips));
    } catch (e) {}
  }

  function getWaveAvoid() {
    const skips = getWaveSkips();
    const keys = [];
    /** @type {Record<string, number>} */
    const artistCounts = {};
    /** @type {Record<string, string>} */
    const artistDisplay = {};

    for (const s of skips) {
      if (s && s.key) {
        keys.push(s.key);
      }
      if (s && s.artist) {
        const a = s.artist.trim();
        const normA = normalizeArtistName(a);
        if (normA) {
          artistCounts[normA] = (artistCounts[normA] || 0) + 1;
          if (!artistDisplay[normA]) {
            artistDisplay[normA] = a;
          }
        }
      }
    }

    const artists = Object.entries(artistCounts)
      .filter(([_, count]) => count >= 3)
      .map(([normA]) => artistDisplay[normA]);

    // what a thumbs down on a Daily Mix keeps out (library-pages.js)
    const disliked = Lib.feedbackAvoid(getMixFeedback());
    keys.push(...disliked.keys);
    disliked.artists.forEach((/** @type {string} */ a) => { if (!artists.includes(a)) artists.push(a); });
    // and blocked artists and songs
    const blocks = getBlocks();
    blocks.artists.forEach((/** @type {string} */ a) => { if (!artists.includes(a)) artists.push(a); });
    blocks.songs.forEach((/** @type {UrielTrack} */ t) => keys.push(getTrackNormalizedKey(t.artist, t.title)));

    return {
      keys: Array.from(new Set(keys)),
      artists
    };
  }

  async function computeTasteProfile(maxSeeds = 8) {
    const favs = Array.isArray(state.favorites) ? state.favorites : [];
    const hist = Array.isArray(state.history) ? state.history : [];

    let cyrillicCount = 0;
    /** @type {number[]} */
    const durations = [];
    const allTracks = [...favs, ...hist];

    allTracks.forEach(track => {
      if (!track) return;
      if (track.title && /[\u0400-\u04FF]/.test(track.title)) {
        cyrillicCount++;
      }
      if ((track.duration || 0) > 0) {
        durations.push(track.duration || 0);
      }
    });

    const seenHistCanIds = new Set();
    const canIdRepeatBonus = new Map();
    const canIdRecency = new Map();

    hist.forEach((track, index) => {
      if (!track) return;
      const rawCanId = String(track.id || track.url || track.key || (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(track) : '') || '').trim();
      const normKey = (track.artist && track.title && typeof getTrackNormalizedKey === 'function') ? getTrackNormalizedKey(track.artist, track.title) : '';
      const effectiveCanId = rawCanId || normKey;
      if (!effectiveCanId) return;

      if (!seenHistCanIds.has(effectiveCanId)) {
        seenHistCanIds.add(effectiveCanId);
        let recency;
        const ts = Number(track.playedAt || track.timestamp || track.date || track.time);
        if (ts && !isNaN(ts) && ts > 0) {
          const ageDays = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24));
          recency = Math.pow(0.5, ageDays / 21);
        } else {
          recency = Math.pow(0.97, index);
        }
        canIdRecency.set(effectiveCanId, recency);
      } else {
        const curBonus = canIdRepeatBonus.get(effectiveCanId) || 0;
        if (curBonus < 2.0) {
          canIdRepeatBonus.set(effectiveCanId, Math.min(2.0, curBonus + 0.5));
        }
      }
    });

    const mergedMap = new Map();

    function getOrCreateEntry(/** @type {UrielTrack} */ track) {
      if (!track || !track.artist || !track.title) return null;
      const artist = String(track.artist).trim();
      const title = String(track.title).trim();
      if (!artist || !title) return null;
      const normKey = (typeof getTrackNormalizedKey === 'function') ? getTrackNormalizedKey(artist, title) : '';
      if (!normKey || normKey === '::') return null;

      if (!mergedMap.has(normKey)) {
        mergedMap.set(normKey, {
          artist,
          title,
          id: track.id || '',
          platform: track.platform || state.platform || 'youtube',
          weight: 0,
          seenHistCanIds: new Set(),
          favAdded: false
        });
      }
      const entry = mergedMap.get(normKey);
      if (!entry.id && track.id) {
        entry.id = track.id;
        entry.platform = track.platform || state.platform || 'youtube';
      }
      return { entry, normKey };
    }

    favs.forEach(track => {
      const res = getOrCreateEntry(track);
      if (!res) return;
      const { entry } = res;
      if (!entry.favAdded) {
        entry.weight += 3;
        entry.favAdded = true;
      }
    });

    hist.forEach(track => {
      const res = getOrCreateEntry(track);
      if (!res) return;
      const { entry, normKey } = res;
      const rawCanId = String(track.id || track.url || track.key || (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(track) : '') || '').trim();
      const effectiveCanId = rawCanId || normKey;

      if (!entry.seenHistCanIds.has(effectiveCanId)) {
        entry.seenHistCanIds.add(effectiveCanId);
        const recency = canIdRecency.get(effectiveCanId) || 0;
        const repeatBonus = canIdRepeatBonus.get(effectiveCanId) || 0;
        entry.weight += (recency + repeatBonus);
      }
    });

    // songs from Daily Mixes you gave a thumbs up count like favourites, their artists a bit more
    const mixFeedback = getMixFeedback();
    // a rated song is kept as { id, title, artist, key }: enough to count it like a played one
    mixFeedback.likedTracks.forEach((track) => {
      const res = getOrCreateEntry(/** @type {UrielTrack} */ (track));
      if (res) res.entry.weight += 3;
    });

    /** @type {Record<string, number>} */
    const artistWeights = {};
    /** @type {Record<string, string>} */
    const artistDisplayNames = {};
    mergedMap.forEach(item => {
      if (item.artist) {
        const a = item.artist.trim();
        const normArtist = normalizeArtistName(a);
        if (normArtist) {
          artistWeights[normArtist] = (artistWeights[normArtist] || 0) + item.weight;
          if (!artistDisplayNames[normArtist]) {
            artistDisplayNames[normArtist] = a;
          }
        }
      }
    });
    mixFeedback.likedArtists.forEach((/** @type {string} */ a) => {
      const normArtist = normalizeArtistName(a);
      if (!normArtist) return;
      artistWeights[normArtist] = (artistWeights[normArtist] || 0) + 4;
      if (!artistDisplayNames[normArtist]) artistDisplayNames[normArtist] = a.trim();
    });

    const sortedArtists = Object.entries(artistWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([normArtist]) => artistDisplayNames[normArtist]);

    const seeds = Array.from(mergedMap.values())
      .filter(s => s.artist && s.title && s.artist.trim() && s.title.trim())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxSeeds)
      .map(s => ({
        artist: s.artist,
        title: s.title,
        id: s.id,
        platform: s.platform || 'youtube',
        weight: Math.round(s.weight * 1000) / 1000
      }));

    const dominantScript = cyrillicCount > (allTracks.length ? allTracks.length * 0.35 : 0) ? 'Cyrillic' : 'Latin';
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

    return {
      trackCount: Math.max(mergedMap.size, favs.length),
      topArtists: sortedArtists.slice(0, 5),
      dominantScript,
      avgDuration,
      bpmLabel: null,
      energyLabel: null,
      seeds
    };
  }

  function renderMyWaveChips(/** @type {unknown} */ profile) {
    const chipsContainer = document.getElementById('my-wave-chips');
    if (chipsContainer) chipsContainer.innerHTML = '';
  }

  const dominantColorsCache = new Map();

  function getCoverDominantColors(/** @type {string} */ url) {
    if (!url) return Promise.resolve(['rgb(80, 80, 120)', 'rgb(120, 80, 100)']);
    if (dominantColorsCache.has(url)) {
      return Promise.resolve(dominantColorsCache.get(url));
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
          ctx.drawImage(img, 0, 0, 32, 32);
          const data = ctx.getImageData(0, 0, 32, 32).data;

          const buckets = new Map();
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness < 30 || brightness > 230) continue;

            const qr = Math.round(r / 32) * 32;
            const qg = Math.round(g / 32) * 32;
            const qb = Math.round(b / 32) * 32;
            const key = `${qr},${qg},${qb}`;
            buckets.set(key, (buckets.get(key) || 0) + 1);
          }

          const sorted = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
          const c1 = sorted[0] ? `rgb(${sorted[0][0]})` : 'rgb(80, 100, 140)';
          const c2 = sorted[1] ? `rgb(${sorted[1][0]})` : sorted[0] ? `rgb(${sorted[0][0]})` : 'rgb(140, 80, 100)';

          const result = [c1, c2];
          dominantColorsCache.set(url, result);
          capMap(dominantColorsCache, 300);
          canvas.width = 0;
          canvas.height = 0;
          img.onload = null;
          img.onerror = null;
          img.src = '';
          resolve(result);
        } catch (e) {
          const fallback = ['rgb(80, 100, 140)', 'rgb(140, 80, 100)'];
          dominantColorsCache.set(url, fallback);
          img.onload = null;
          img.onerror = null;
          resolve(fallback);
        }
      };
      img.onerror = () => {
        if (img.crossOrigin) {
          img.crossOrigin = null;
          img.src = url;
          return;
        }
        const fallback = ['rgb(80, 100, 140)', 'rgb(140, 80, 100)'];
        dominantColorsCache.set(url, fallback);
        img.onload = null;
        img.onerror = null;
        resolve(fallback);
      };
      img.src = url;
    });
  }

  function updateTextFade(/** @type {HTMLElement} */ el) {
    if (!el) return;
    el.classList.toggle('fade-end', el.scrollWidth > el.clientWidth);
  }

  window.addEventListener('resize', () => {
    ['my-wave-focused-title', 'my-wave-focused-artist', 'jump-focused-title', 'jump-focused-artist'].forEach(id => {
      const el = document.getElementById(id);
      if (el) updateTextFade(el);
    });
  });

  let ambientIdx = 0;
  let currentAmbientUrl = null;
  async function setHomeAmbient(/** @type {string} */ url) {
    const box = document.getElementById('home-ambient');
    if (!box) return;
    const layers = /** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll('.home-ambient-layer'));
    if (!url) {
      currentAmbientUrl = null;
      layers.forEach((l) => {
        l.classList.remove('on');
        l.style.background = '';
      });
      return;
    }
    currentAmbientUrl = url;
    try {
      const [c1, c2] = await getCoverDominantColors(url);
      if (currentAmbientUrl !== url) return;
      const next = /** @type {HTMLElement} */ (layers[ambientIdx ^ 1]);
      const prev = layers[ambientIdx];
      const gradient = `radial-gradient(circle 550px at 28% 35%, ${c1} 0%, transparent 68%), radial-gradient(circle 550px at 72% 65%, ${c2} 0%, transparent 68%)`;
      if (next) {
        next.style.backgroundImage = 'none';
        next.style.background = gradient;
        next.classList.add('on');
      }
      if (prev) {
        prev.classList.remove('on');
      }
      ambientIdx ^= 1;
    } catch (e) {
      console.warn('Ambient error:', e);
    }
  }

  function syncHomeAmbientVisibility() {
    const ambient = document.getElementById('home-ambient');
    if (!ambient) return;
    const isDiscoverActive = state.currentView === 'discover' && el.viewDiscover && el.viewDiscover.classList.contains('active');
    const isSearchShowing = el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden');
    const isDiscoverEmptyShowing = el.discoverEmpty && !el.discoverEmpty.classList.contains('hidden');
    const hasModes = typeof availableModes === 'function' ? availableModes().length > 0 : true;
    const isAmbientEnabled = getAdv('my_wave_ambient', true);

    const shouldShow = isDiscoverActive && !isSearchShowing && isDiscoverEmptyShowing && hasModes && isAmbientEnabled;
    ambient.classList.toggle('ambient-hidden', !shouldShow);
    ambient.style.display = shouldShow ? '' : 'none';
  }

  async function updateAmbientLight(/** @type {HTMLElement | string | null} */ ambientEl, /** @type {string} */ thumbnailUrl) {
    let url = '';
    if (typeof thumbnailUrl === 'string') {
      url = thumbnailUrl;
    } else if (typeof ambientEl === 'string') {
      if (ambientEl === 'my-wave-ambient-light' || ambientEl === 'jump-ambient-light') {
        url = typeof thumbnailUrl === 'string' ? thumbnailUrl : '';
      } else {
        url = ambientEl;
      }
    } else if (ambientEl && typeof ambientEl === 'object' && typeof thumbnailUrl === 'string') {
      url = thumbnailUrl;
    }

    syncHomeAmbientVisibility();
    setHomeAmbient(url);
  }

  let currentWaveFocusedIndex = 0;

  // a second caller (Next pressed at the end while the background top-up runs) waits for the same top-up
  // instead of getting false and doing nothing
  /** @type {Promise<boolean> | null} */
  let myWaveExtending = null;
  function extendMyWaveQueue() {
    if (!state.myWaveActive) return Promise.resolve(false);
    if (!myWaveExtending) myWaveExtending = extendMyWaveQueueOnce().finally(() => { myWaveExtending = null; });
    return myWaveExtending;
  }

  async function extendMyWaveQueueOnce() {
    if (isExtendingMyWave) return false;
    isExtendingMyWave = true;
    const queue = state.queue;
    try {
      const profile = await computeTasteProfile();
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/vibe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: (state.history || []).slice(0, 30),
          favorites: (state.favorites || []).slice(0, 25),
          platform: 'youtube',
          limit: 8,
          clientProfile: profile,
          seeds: profile.seeds,
          avoid: getWaveAvoid()
        })
      });
      const data = await res.json();
      // another list started while this was loading: its queue doesn't get wave songs
      if (!state.myWaveActive || state.queue !== queue) return false;
      if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
        const existingIds = new Set(state.queue.map((/** @type {UrielTrack} */ t) => getTrackCanonicalId(t)));
        const existingKeys = new Set(state.queue.map((/** @type {UrielTrack} */ t) => getTrackNormalizedKey(t.artist, t.title)));
        const newTracks = data.tracks.filter((/** @type {UrielTrack} */ t) => {
          const cid = getTrackCanonicalId(t);
          const nkey = getTrackNormalizedKey(t.artist, t.title);
          return !existingIds.has(cid) && !existingKeys.has(nkey) && !isBlocked(t);
        });
        if (newTracks.length > 0) {
          state.queue.push(...newTracks);
          updateQueueBadge();
          renderQueueView();
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    } finally {
      isExtendingMyWave = false;
    }
  }

  const btnPlayMyWave = document.getElementById('btn-play-my-wave');
  if (btnPlayMyWave) {
    btnPlayMyWave.addEventListener('click', async () => {
      if (!myWaveCurrentTracks || myWaveCurrentTracks.length === 0) {
        const profile = await computeTasteProfile();
        if (profile.trackCount < 5) {
          showToast(Tm('Save at least 5 songs to tune My Wave'));
          return;
        }
        await loadHomePage();
      }
      if (myWaveCurrentTracks && myWaveCurrentTracks.length > 0) {
        state.myWaveActive = true;
        const startIdx = (currentWaveFocusedIndex >= 0 && currentWaveFocusedIndex < myWaveCurrentTracks.length) ? currentWaveFocusedIndex : 0;
        playTrack(myWaveCurrentTracks[startIdx], [...myWaveCurrentTracks], startIdx, 'wave');
        showToast(Tm('Playing My Wave'));
      }
    });
  }

  if (el.btnRefreshVibe) {
    el.btnRefreshVibe.addEventListener('click', async () => {
      const btn = el.btnRefreshVibe;
      if (btn.classList.contains('loading')) return;

      const wrapper = document.querySelector('#section-my-wave .my-wave-carousel-wrapper');
      btn.classList.add('loading');
      if (wrapper) wrapper.classList.add('loading');

      let spinner = /** @type {HTMLElement} */ (wrapper ? wrapper.querySelector('.my-wave-carousel-spinner') : null);
      if (!spinner && wrapper) {
        spinner = document.createElement('div');
        spinner.className = 'my-wave-carousel-spinner';
        spinner.innerHTML = `
          <div class="m3-spinner-container">
            <svg class="m3-circular-progress" viewBox="0 0 48 48">
              <circle class="m3-spinner-track" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
              <circle class="m3-spinner-head" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
            </svg>
          </div>
        `;
        wrapper.appendChild(spinner);
      }
      if (spinner) spinner.style.display = 'flex';

      try {
        const ok = await loadHomePage(true);
        if (!ok) {
          showToast(Tm('Could not refresh'), 'error');
        }
      } catch (err) {
        showToast(Tm('Could not refresh'), 'error');
      } finally {
        btn.classList.remove('loading');
        if (wrapper) wrapper.classList.remove('loading');
        if (spinner) spinner.style.display = 'none';
      }
    });
  }

  function scrollCarouselTo(/** @type {HTMLElement} */ row, /** @type {number} */ idx) {
    if (!row) return;
    const cards = /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll('.my-wave-track-card'));
    if (cards.length === 0) return;
    const clampedIdx = Math.max(0, Math.min(cards.length - 1, idx));
    row._targetIndex = clampedIdx;
    let step = 304;
    if (cards.length > 1) {
      step = cards[1].offsetLeft - cards[0].offsetLeft;
    } else if (cards.length === 1) {
      step = cards[0].offsetWidth + 24;
    }
    const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
    const target = Math.max(0, Math.min(maxScroll, clampedIdx * step));
    row.scrollTo({ left: target, behavior: 'smooth' });
  }

  function updateCoverflowCards(/** @type {HTMLElement | null} */ row, /** @type {HTMLElement | null} */ titleEl, /** @type {HTMLElement | null} */ artistEl, /** @type {HTMLElement | null} */ ambientEl, /** @type {UrielTrack[] | null} */ tracks) {
    if (!row) row = document.getElementById('home-vibe-grid');
    if (!row) return;
    if (!tracks) {
      tracks = (row.id === 'home-vibe-grid')
        ? (homeMode === 'recent' ? jumpBackCurrentTracks : myWaveCurrentTracks)
        : jumpBackCurrentTracks;
    }
    if (!tracks || tracks.length === 0) return;
    const cards = /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll('.my-wave-track-card'));
    if (cards.length === 0) return;

    if (!titleEl) titleEl = document.getElementById(row.id === 'home-vibe-grid' ? 'my-wave-focused-title' : 'jump-focused-title');
    if (!artistEl) artistEl = document.getElementById(row.id === 'home-vibe-grid' ? 'my-wave-focused-artist' : 'jump-focused-artist');
    if (!ambientEl) ambientEl = document.getElementById(row.id === 'home-vibe-grid' ? 'my-wave-ambient-light' : 'jump-ambient-light');

    let step = 304;
    if (cards.length > 1) {
      step = cards[1].offsetLeft - cards[0].offsetLeft;
    } else if (cards.length === 1) {
      step = cards[0].offsetWidth + 24;
    }
    if (!step || step <= 0) step = 304;

    const floatIndex = row.scrollLeft / step;
    const newFocused = Math.max(0, Math.min(cards.length - 1, Math.round(floatIndex)));
    if (typeof row._targetIndex === 'number' && Math.abs(row.scrollLeft - (row._targetIndex * step)) < 12) {
      row._targetIndex = undefined;
    }

    cards.forEach((card, /** @type {number} */ j) => {
      const dist = Math.abs(j - newFocused);
      card.classList.remove('near', 'far');
      if (dist === 0) {
        card.style.zIndex = '10';
      } else if (dist === 1) {
        card.classList.add('near');
        card.style.zIndex = '5';
      } else {
        card.classList.add('far');
        card.style.zIndex = '1';
      }
    });

    const prevFocused = (typeof row._focusedIndex === 'number') ? row._focusedIndex : -1;
    if (newFocused !== prevFocused && tracks[newFocused]) {
      row._focusedIndex = newFocused;
      if (row.id === 'home-vibe-grid') {
        currentWaveFocusedIndex = newFocused;
      }
      const track = tracks[newFocused];
      if (titleEl && artistEl) {
        titleEl.textContent = track.title || 'Untitled';
        artistEl.textContent = track.artist || 'Unknown';
        updateTextFade(titleEl);
        updateTextFade(artistEl);
      }
      const thumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(track) : '') || track.thumbnail || track.cover || track.image || '';
      updateAmbientLight(ambientEl, thumb);
    }
  }

  function getJumpBackTracks() {
    const raw = Array.isArray(state.history) ? state.history : [];
    const seen = new Set();
    const tracks = [];
    for (const t of raw) {
      if (!t || typeof t !== 'object') continue;
      const canId = (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(t) : '') || t.id || `${t.artist || ''}::${t.title || ''}`;
      if (seen.has(canId)) continue;
      seen.add(canId);
      const thumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(t) : '') || t.thumbnail || t.cover || t.image || t.localThumbnail || '';
      tracks.push({
        ...t,
        thumbnail: thumb,
        title: t.title || 'Untitled',
        artist: t.artist || t.uploader || 'Unknown artist'
      });
      if (tracks.length >= 15) break;
    }
    return tracks;
  }

  function buildHomeCard(/** @type {UrielTrack} */ track, /** @type {string} */ mode, /** @type {number} */ idx) {
    const card = document.createElement('div');
    card.className = 'my-wave-track-card';
    if (typeof idx === 'number') card.dataset.index = String(idx);
    const thumbUrl = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(track) : '') || track.thumbnail || track.cover || track.image || '';
    card.innerHTML = `
      <div class="my-wave-track-cover-wrap">
        <img class="my-wave-track-cover" loading="lazy" decoding="async" src="${escapeHtml(thumbUrl)}" alt="" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'280\\' height=\\'280\\' fill=\\'%23555\\'><rect width=\\'100%\\' height=\\'100%\\'/></svg>'">
        <div class="my-wave-track-play-overlay">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      const row = /** @type {HTMLElement} */ (document.getElementById('home-vibe-grid'));
      const curIdx = (typeof idx === 'number') ? idx : parseInt(String(card.dataset.index), 10);
      const focusedIndex = (row && typeof row._focusedIndex === 'number') ? row._focusedIndex : 0;
      if (curIdx === focusedIndex) {
        if (mode === 'wave') {
          state.myWaveActive = true;
          const waveQueue = [...myWaveCurrentTracks];
          playTrack(track, waveQueue, curIdx, 'wave');
        } else {
          state.myWaveActive = false;
          const recentTracks = jumpBackCurrentTracks.length > 0 ? jumpBackCurrentTracks : getJumpBackTracks();
          playTrack(track, [...recentTracks], curIdx);
        }
      } else if (row) {
        scrollCarouselTo(row, curIdx);
      }
    });

    return card;
  }

  function getWaveSpinnerHtml() {
    return `
      <div class="m3-spinner-container" style="margin: auto;">
        <svg class="m3-circular-progress" viewBox="0 0 48 48">
          <circle class="m3-spinner-track" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
          <circle class="m3-spinner-head" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
        </svg>
      </div>
    `;
  }

  function renderHomeCarousel(/** @type {string} */ mode) {
    if (!mode) mode = homeMode || 'wave';
    homeMode = mode;

    const headerLabel = /** @type {HTMLElement} */ (document.querySelector('#section-my-wave .home-pane-label'));
    if (headerLabel) {
      const waveLabel = (state.isHotPicks && state.hotPicksTitle) ? state.hotPicksTitle : 'My Wave';
      if (mode === 'recent' || waveLabel === 'My Wave') I18N.text(headerLabel, mode === 'recent' ? 'Jump back in' : 'My Wave');
      else headerLabel.textContent = waveLabel;
      headerLabel.style.cursor = availableModes().length > 1 ? 'pointer' : 'default';
      headerLabel.style.pointerEvents = 'auto';
      if (!headerLabel._hasToggleListener) {
        headerLabel._hasToggleListener = true;
        headerLabel.addEventListener('click', () => {
          const avail = availableModes();
          if (avail.length > 1) {
            const nextMode = homeMode === 'wave' ? 'recent' : 'wave';
            const curIdx = avail.indexOf(homeMode);
            const nextIdx = avail.indexOf(nextMode);
            if (nextIdx !== -1) {
              switchHomeMode(nextIdx - curIdx);
            }
          }
        });
      }
    }
    const actions = /** @type {HTMLElement} */ (document.querySelector('#section-my-wave .my-wave-actions'));
    if (actions) {
      actions.style.display = (mode === 'wave') ? '' : 'none';
    }

    const vibeGrid = /** @type {HTMLElement} */ (document.getElementById('home-vibe-grid'));
    const focusedMeta = document.getElementById('my-wave-focused-meta');
    if (!vibeGrid) return;

    if (mode === 'recent') {
      jumpBackCurrentTracks = getJumpBackTracks();
    }
    const source = (mode === 'recent') ? jumpBackCurrentTracks : myWaveCurrentTracks;

    vibeGrid.innerHTML = '';

    if (!source || source.length === 0) {
      if (focusedMeta) focusedMeta.innerHTML = '';
      if (mode === 'recent') {
        vibeGrid.innerHTML = `<div class="vibe-empty-hint" data-i18n>Play some songs to see them here</div>`;
      } else {
        vibeGrid.innerHTML = getWaveSpinnerHtml();
      }
      updateAmbientLight('my-wave-ambient-light', '');
      return;
    }

    const fragment = document.createDocumentFragment();
    source.forEach((track, idx) => {
      fragment.appendChild(buildHomeCard(track, mode, idx));
    });
    vibeGrid.appendChild(fragment);

    const firstThumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(source[0]) : '') || source[0].thumbnail || source[0].cover || source[0].image || '';

    if (focusedMeta && source[0]) {
      focusedMeta.innerHTML = `
        <div class="my-wave-focused-title" id="my-wave-focused-title">${escapeHtml(source[0].title || 'Untitled')}</div>
        <div class="my-wave-focused-artist" id="my-wave-focused-artist">${escapeHtml(source[0].artist || 'Unknown')}</div>
      `;
      const titleEl = document.getElementById('my-wave-focused-title');
      const artistEl = document.getElementById('my-wave-focused-artist');
      if (titleEl) updateTextFade(titleEl);
      if (artistEl) updateTextFade(artistEl);
      updateAmbientLight('my-wave-ambient-light', firstThumb);
    }

    vibeGrid.scrollLeft = 0;
    vibeGrid._focusedIndex = -1;
    updateCoverflowCards(vibeGrid, document.getElementById('my-wave-focused-title'), document.getElementById('my-wave-focused-artist'), document.getElementById('my-wave-ambient-light'), source);
  }


  function availableModes() {
    const modes = [];
    if (getAdv('my_wave', true)) modes.push('wave');
    if (getAdv('jump_back', true)) modes.push('recent');
    return modes;
  }

  function updateHomeDots() {
    const dotsContainer = document.getElementById('home-hero-dots');
    if (!dotsContainer) return;
    const avail = availableModes();
    if (avail.length <= 1) {
      dotsContainer.style.display = 'none';
      dotsContainer.innerHTML = '';
      return;
    }
    dotsContainer.style.display = '';
    dotsContainer.innerHTML = '';
    avail.forEach(m => {
      const btn = document.createElement('button');
      const label = m === 'recent' ? 'Jump back in' : 'My Wave';
      btn.setAttribute('aria-label', T(label));
      btn.title = T(label);
      if (m === homeMode) btn.classList.add('active');
      btn.addEventListener('click', () => {
        if (m !== homeMode) {
          const curIdx = avail.indexOf(homeMode);
          const targetIdx = avail.indexOf(m);
          switchHomeMode(targetIdx - curIdx);
        }
      });
      dotsContainer.appendChild(btn);
    });
  }

  function switchHomeMode(/** @type {number} */ dir) {
    const avail = availableModes();
    if (avail.length <= 1) return;
    const curIdx = avail.indexOf(homeMode);
    if (curIdx === -1) return;
    const targetIdx = curIdx + dir;
    if (targetIdx < 0 || targetIdx >= avail.length) return;
    const newMode = avail[targetIdx];
    if (newMode === homeMode) return;

    homeMode = newMode;
    localStorage.setItem('uriel_home_pane', newMode);
    updateHomeDots();

    const isPerf = document.body.classList.contains('perf') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isPerf) {
      renderHomeCarousel(newMode);
      return;
    }

    const vibeGrid = document.getElementById('home-vibe-grid');
    const focusedMeta = document.getElementById('my-wave-focused-meta');
    const animTargets = /** @type {HTMLElement[]} */ ([vibeGrid, focusedMeta].filter(Boolean));

    const shiftOut = dir > 0 ? '-16px' : '16px';
    const shiftIn = dir > 0 ? '16px' : '-16px';

    animTargets.forEach(el => {
      el.style.setProperty('--home-shift', shiftOut);
      el.classList.remove('home-in');
      el.classList.add('home-out');
    });

    setTimeout(() => {
      renderHomeCarousel(newMode);
      const newVibeGrid = document.getElementById('home-vibe-grid');
      const newFocusedMeta = document.getElementById('my-wave-focused-meta');
      const newTargets = /** @type {HTMLElement[]} */ ([newVibeGrid, newFocusedMeta].filter(Boolean));
      newTargets.forEach(el => {
        el.style.setProperty('--home-in-shift', shiftIn);
        el.classList.remove('home-out');
        el.classList.add('home-in');
        setTimeout(() => {
          el.classList.remove('home-in');
        }, 260);
      });
    }, 180);
  }

  function initHomeHero() {
    const avail = availableModes();
    const hero = document.getElementById('home-hero') || document.querySelector('#view-discover .discover-content');
    const dots = document.getElementById('home-hero-dots');

    if (avail.length === 0) {
      if (hero) hero.style.display = 'none';
      if (dots) dots.style.display = 'none';
      const homeAmbient = document.getElementById('home-ambient');
      if (homeAmbient) homeAmbient.style.display = 'none';
      return;
    }

    if (hero) hero.style.display = '';

    if (!avail.includes(homeMode)) {
      homeMode = avail[0];
      localStorage.setItem('uriel_home_pane', homeMode);
    }

    updateHomeDots();
    renderHomeCarousel(homeMode);
    syncHomeAmbientVisibility();
  }

  function stepCarouselFocus(/** @type {number} */ delta) {
    const row = /** @type {HTMLElement} */ (document.getElementById('home-vibe-grid'));
    if (!row) return;
    const cards = /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll('.my-wave-track-card'));
    if (cards.length === 0) return;
    const base = (typeof row._targetIndex === 'number')
      ? row._targetIndex
      : ((typeof row._focusedIndex === 'number') ? row._focusedIndex : 0);
    const next = Math.max(0, Math.min(cards.length - 1, base + delta));
    scrollCarouselTo(row, next);
  }

  function isDiscoverActive() {
    const view = document.getElementById('view-discover');
    return !!(view && view.classList.contains('active'));
  }

  function isFormInputFocused() {
    const activeEl = /** @type {HTMLElement} */ (document.activeElement);
    if (!activeEl) return false;
    const tag = activeEl.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || activeEl.isContentEditable;
  }

  let isWheelModeLocked = false;
  let isCarouselWheelLocked = false;

  const viewDiscoverEl = document.getElementById('view-discover');
  if (viewDiscoverEl) {
    viewDiscoverEl.addEventListener('wheel', (e) => {
      if (!isDiscoverActive() || isFormInputFocused()) return;
      if (el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden')) return;
      if (/** @type {HTMLElement} */ (e.target).closest('#search-results-container')) return;
      // the home page scrolls (recommendations below the card): only sideways scrolling, or scrolling
      // over the card row itself, flips cards
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!sideways && !/** @type {HTMLElement} */ (e.target).closest('.my-wave-carousel-wrapper')) return;
      const delta = sideways ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 8) return;
      if (isCarouselWheelLocked) return;
      e.preventDefault();
      isCarouselWheelLocked = true;
      setTimeout(() => { isCarouselWheelLocked = false; }, 85);
      stepCarouselFocus(delta > 0 ? 1 : -1);
    }, { passive: false });

    let touchStartY = 0;
    let touchStartX = 0;
    viewDiscoverEl.addEventListener('touchstart', (e) => {
      if (!isDiscoverActive()) return;
      if (el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden')) return;
      if (e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
      }
    }, { passive: true });

    viewDiscoverEl.addEventListener('touchend', (e) => {
      if (!isDiscoverActive()) return;
      if (el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden')) return;
      if (e.changedTouches.length > 0) {
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        const diffY = touchStartY - touchEndY;
        const diffX = touchStartX - touchEndX;
        // vertical swipes scroll the page; sideways swipes flip cards
        if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
          stepCarouselFocus(diffX > 0 ? 1 : -1);
        }
      }
    }, { passive: true });
  }

  window.addEventListener('keydown', (e) => {
    if (!isDiscoverActive() || isFormInputFocused()) return;
    if (el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden')) return;
    // Up/Down scroll the (now scrolling) Home page; nothing behind an open dialog or Encore moves
    if (document.querySelector('.encore, .modal-backdrop.visible:not(.hidden)')) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepCarouselFocus(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepCarouselFocus(1);
    }
  });


  // "For you": genres, similar artists and picks from /api/discover (iTunes genres + Deezer related/charts)
  let forYouSig = '';
  /** @param {boolean} [force] */
  async function loadForYou(force) {
    const box = document.getElementById('section-for-you');
    if (!box || !state.serverPort) return;
    const sig = `${state.history.length}:${state.favorites.length}:${state.history[0] ? state.history[0].id : ''}`;
    if (!force && sig === forYouSig) return;
    forYouSig = sig;
    const isEmpty = (/** @type {UrielForYou | null} */ d) => !d || !d.success || (!(d.genres || []).length && !(d.sections || []).some((/** @type {UrielHomeSection} */ x) => (x.items || x.tracks || []).length));
    // what For you showed last time, drawn at once while the new one loads
    const cached = safeJson('uriel_home_foryou_cache', null);
    if (!box.children.length && cached && !isEmpty(cached.data)) renderForYou(box, cached.data);
    let data = null;
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/discover`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: state.history.slice(0, 60), favorites: state.favorites.slice(0, 60) }),
      });
      data = await res.json();
    } catch (e) {}
    // forget the signature on a failed (or offline, empty) load, or "For you" stayed empty until the history changed
    if (isEmpty(data)) { if (forYouSig === sig) forYouSig = ''; return; }
    try { localStorage.setItem('uriel_home_foryou_cache', JSON.stringify({ at: Date.now(), data })); } catch (e) {}
    renderForYou(box, data);
  }
  function renderForYou(/** @type {HTMLElement} */ box, /** @type {UrielForYou} */ data) {
    box.innerHTML = '';
    const section = (/** @type {string} */ title) => {
      const block = document.createElement('div');
      block.className = 'section-block fy-section';
      block.innerHTML = `<div class="section-header-inline"><h3 class="section-title">${escapeHtml(title)}</h3></div>`;
      box.appendChild(block);
      return block;
    };
    if (data.genres && data.genres.length) {
      const chips = document.createElement('div');
      chips.className = 'suggestion-chips fy-genres';
      data.genres.slice(0, 6).forEach((/** @type {string} */ g) => {
        const c = document.createElement('button');
        c.className = 'chip-btn';
        c.textContent = g;
        c.addEventListener('click', () => { if (el.searchInput) el.searchInput.value = `${g} music`; performSearch(`${g} music`); });
        chips.appendChild(c);
      });
      section('Your genres').appendChild(chips);
    }
    // blocked artists and songs stay out of For you; so do the songs you played just now
    const blockedArtists = getBlocks().artists;
    const recentKeys = new Set((state.history || []).slice(0, 30).map((/** @type {UrielTrack} */ t) => getTrackNormalizedKey(t.artist, t.title)));
    for (const raw of data.sections || []) {
      const sec = raw.type === 'artists'
        ? { ...raw, items: (raw.items || []).filter((/** @type {UrielArtist} */ a) => a && !Lib.isArtistBlocked(blockedArtists, a.name)) }
        : { ...raw, tracks: (raw.tracks || []).filter((/** @type {UrielTrack} */ t) => t && !isBlocked(t) && !recentKeys.has(getTrackNormalizedKey(t.artist, t.title))) };
      if (!(sec.items || sec.tracks || []).length) continue;
      const row = document.createElement('div');
      row.className = 'fy-row';
      if (sec.type === 'artists') {
        (sec.items || []).forEach((/** @type {UrielArtist} */ a) => {
          const b = document.createElement('button');
          b.className = 'fy-artist';
          b.innerHTML = `<img src="${escapeHtml(a.picture || '')}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(a.name)}</span>`;
          b.addEventListener('click', () => openArtistProfile(a.name));
          row.appendChild(b);
        });
      } else {
        const list = sec.tracks || [];
        list.forEach((/** @type {UrielTrack} */ t, /** @type {number} */ i) => {
          const b = document.createElement('button');
          b.className = 'fy-card';
          b.innerHTML = `<img src="${escapeHtml(listThumb(getTrackThumbUrl(t)) || '')}" data-art="${escapeHtml(JSON.stringify(trackArtCandidates(t)))}" alt="" loading="lazy" decoding="async" onerror="${THUMB_FALLBACK}"><span class="fy-title">${escapeHtml(t.title)}</span><span class="fy-artist-name">${escapeHtml(t.artist)}</span>`;
          b.addEventListener('click', () => playTrack(t, sec.tracks, i));
          row.appendChild(b);
        });
      }
      section(sec.title).appendChild(row);
    }
    const firstSongs = (data.sections || []).find((/** @type {UrielHomeSection} */ x) => x.type !== 'artists' && (x.tracks || []).length);
    if (firstSongs) warmHomeSongs(firstSongs.tracks || [], 1);
  }

  // ---- the Artists tab (#10): the artists you follow, like the Albums tab; Settings > Tracks > Show Artists tab ----
  function updateArtistsCount() {
    const n = getFollowedArtists().filter((a) => a && a.name).length;
    const badge = document.getElementById('artists-count');
    if (badge) badge.textContent = String(n);
    const sub = document.getElementById('artists-subtitle');
    if (sub) sub.textContent = n === 1 ? T('1 artist followed') : Tf('{0} artists followed', n);
  }
  function renderArtistsTab() {
    const grid = document.getElementById('followed-artists-grid');
    if (!grid) return;
    const list = getFollowedArtists().filter((a) => a && a.name);
    updateArtistsCount();
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = `<div class="empty-hint">${escapeHtml(T('No artists yet. Open an artist and tap Follow to see them here.'))}</div>`;
      return;
    }
    sortedLibrary('artists', list).forEach((a) => grid.appendChild(followedArtistCard(a)));
    if (state.serverPort) fetchFollowedMeta(list);
  }
  const btnShowArtists = document.getElementById('btn-show-artists');
  function applyShowArtists() {
    const show = localStorage.getItem('uriel_show_artists') === '1';
    document.body.classList.toggle('hide-artists-tab', !show);
    const nav = document.getElementById('nav-artists');
    if (nav) nav.classList.toggle('nav-collapsed', !show);
    if (btnShowArtists) btnShowArtists.classList.toggle('active', show);
    if (!show && state.currentView === 'artists') switchView('discover');
    updateArtistsCount();
    refreshStacks();
    updateNavIndicator(false);
  }
  if (btnShowArtists) {
    btnShowArtists.addEventListener('click', () => {
      localStorage.setItem('uriel_show_artists', localStorage.getItem('uriel_show_artists') === '1' ? '0' : '1');
      applyShowArtists();
    });
  }
  applyShowArtists();

  // ---- the Home rows: the layout, quick picks, Daily Mixes, Trending now, your artists (app/home.js) ----
  const home = /** @type {UrielHomePart} */ ({});
  function isSpotifyHome() { return home.isSpotifyHome(); }
  function renderFollowedArtists() { return home.renderFollowedArtists(); }
  function renderMadeForYou() { return home.renderMadeForYou(); }
  function readDailyMixes() { return home.readDailyMixes(); }
  function artistPlays(/** @type {string} */ name) { return home.artistPlays(name); }
  function followedArtistCard(/** @type {UrielArtist} */ a) { return home.followedArtistCard(a); }
  function fetchFollowedMeta(/** @type {UrielArtist[]} */ list) { return home.fetchFollowedMeta(list); }
  function renderSpotifyHome() { return home.renderSpotifyHome(); }
  var spHomeReady = false;
  window.UrielApp.home({
    state, Lib, escapeHtml, getAdv, playTrack, safeJson, showToast, compactCount, getFollowedArtists, getTrackThumbUrl, bindHorizontalWheel, updateRowFade, switchView, getTrackCanonicalId, listThumb, openPlaylistDetail, renderPlaylistCover, computeTasteProfile, normalizeArtistName, getWaveAvoid, isBlocked, openAlbum, warmHomeSongs, openArtistProfile, setFollowedArtists, updateArtistsCount, renderArtistsTab, syncHomeAmbientVisibility,
    homeReady: () => spHomeReady, getWaveTracks: () => myWaveCurrentTracks,
  }, home);
  spHomeReady = true;
  home.applyHomeLayout();

  // My Wave's picks from /api/vibe, one of each song
  // The first few recommended songs, looked up ahead so tapping one starts at once: computers find the stream,
  // phones fetch the song into the offline cache (so only on Wi-Fi, and never with Data Saver). A few per feed,
  // a few seconds apart, never while a song you picked is loading, at most 8 per session.
  /** @type {Set<string>} */
  var homeWarmed = new Set();
  function warmHomeSongs(/** @type {UrielTrack[]} */ tracks, /** @type {number} */ n) {
    if (!state.serverPort || !Array.isArray(tracks)) return;
    const conn = navigator.connection;
    if (conn && conn.saveData) return;
    if (isPhoneApp && conn && conn.type && conn.type !== 'wifi' && conn.type !== 'ethernet') return;
    homeWarmed = homeWarmed || new Set();
    const picks = tracks.filter((t) => t && t.platform !== 'local' && (t.url || t.id) && !isBlocked(t) && !homeWarmed.has(getTrackCanonicalId(t))).slice(0, n || 2);
    picks.forEach((t, k) => {
      if (homeWarmed.size >= 8) return;
      homeWarmed.add(getTrackCanonicalId(t));
      setTimeout(() => {
        if (state.trackLoading || offlineState(t)) return;
        fetch(`http://127.0.0.1:${state.serverPort}/api/prefetch?url=${encodeURIComponent(t.url || '')}&id=${encodeURIComponent(t.id || '')}&platform=${t.platform || 'youtube'}&title=${encodeURIComponent(t.title || '')}&artist=${encodeURIComponent(t.artist || '')}&duration=${encodeURIComponent(t.duration || 0)}&thumbnail=${encodeURIComponent(t.thumbnail || '')}`).catch(() => {});
      }, 5000 + homeWarmed.size * 4000);
    });
  }
  async function fetchWaveTracks(/** @type {Record<string, unknown>} */ payload) {
    const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/vibe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const out = [];
    if (data && data.success && Array.isArray(data.tracks)) {
      const seenIds = new Set();
      const seenKeys = new Set();
      for (const t of data.tracks) {
        const cid = getTrackCanonicalId(t);
        const nkey = getTrackNormalizedKey(t.artist, t.title);
        if (!seenIds.has(cid) && !seenKeys.has(nkey)) {
          seenIds.add(cid);
          seenKeys.add(nkey);
          out.push(t);
        }
      }
    }
    return out;
  }
  function saveWaveCache(/** @type {UrielTrack[]} */ tracks) {
    if (!Array.isArray(tracks) || tracks.length < 5) return;
    try { localStorage.setItem('uriel_home_wave_cache', JSON.stringify({ at: Date.now(), tracks: tracks.slice(0, 30) })); } catch (e) {}
  }

  async function loadHomePage(isRefresh = false) {
    loadForYou();
    const jumpSection = document.getElementById('section-jump-back');
    if (jumpSection) {
      jumpSection.style.display = 'none';
    }

    const waveSection = document.getElementById('section-my-wave');
    if (waveSection) {
      waveSection.style.display = '';
    }

    if (!isRefresh) {
      jumpBackCurrentTracks = getJumpBackTracks();
      initHomeHero();
    }
    if (availableModes().length === 0) return false;

    if (!getAdv('my_wave', true)) {
      if (homeMode === 'recent') {
        renderHomeCarousel('recent');
      }
      return false;
    }

    const vibeGrid = /** @type {HTMLElement} */ (document.getElementById('home-vibe-grid'));
    const focusedMeta = document.getElementById('my-wave-focused-meta');

    if (!isRefresh && focusedMeta && homeMode === 'wave' && myWaveCurrentTracks.length === 0) {
      focusedMeta.innerHTML = `
        <div class="my-wave-skeleton-title-bar skeleton-shimmer"></div>
        <div class="my-wave-skeleton-artist-bar skeleton-shimmer"></div>
      `;
    }

    if (!isRefresh && vibeGrid && homeMode === 'wave' && myWaveCurrentTracks.length === 0) {
      vibeGrid.style.opacity = '1';
      vibeGrid.innerHTML = getWaveSpinnerHtml();
    }

    try {
      const profile = await computeTasteProfile();
      /** @type {{ history: UrielTrack[], favorites: UrielTrack[], platform: string, limit: number, clientProfile: unknown, seeds: unknown, avoid: unknown, refresh?: boolean }} */
      const vibePayload = {
        history: (state.history || []).slice(0, 30),
        favorites: (state.favorites || []).slice(0, 25),
        platform: 'youtube',
        limit: 10,
        clientProfile: profile,
        seeds: profile.seeds,
        avoid: getWaveAvoid()
      };
      if (isRefresh) {
        vibePayload.refresh = true;
      }
      // the last My Wave shows at once (no waiting for the network on every start) and a new one is fetched
      // quietly for next time; Refresh always asks for new picks
      let uniqueTracks = [];
      const cachedWave = isRefresh ? null : safeJson('uriel_home_wave_cache', null);
      const waveFresh = !!(cachedWave && Array.isArray(cachedWave.tracks) && cachedWave.tracks.length >= 5 && Date.now() - (cachedWave.at || 0) < 6 * 3600e3);
      if (waveFresh) {
        uniqueTracks = cachedWave.tracks.filter((/** @type {UrielTrack} */ t) => t && !isBlocked(t));
        setTimeout(() => { fetchWaveTracks({ ...vibePayload, refresh: true }).then(saveWaveCache, () => {}); }, 15000);
      } else {
        uniqueTracks = await fetchWaveTracks(vibePayload).catch(() => []);
        saveWaveCache(uniqueTracks);
      }
      warmHomeSongs(uniqueTracks, 2);

      state.isHotPicks = false;
      state.hotPicksTitle = '';

      if (uniqueTracks.length < 5) {
        try {
          const hotRes = await fetch(`http://127.0.0.1:${state.serverPort}/api/hot?limit=12`);
          const hotData = await hotRes.json();
          if (hotData && hotData.success && Array.isArray(hotData.tracks) && hotData.tracks.length > 0) {
            uniqueTracks = hotData.tracks;
            state.isHotPicks = true;
            state.hotPicksTitle = hotData.title || `Hot picks ${new Date().getFullYear()}`;
          }
        } catch (_) {}
      }

      if (uniqueTracks.length === 0) {
        if (!isRefresh) {
          myWaveCurrentTracks = [];
          if (homeMode === 'wave') {
            if (focusedMeta) focusedMeta.innerHTML = '';
            if (vibeGrid) {
              vibeGrid.innerHTML = `
                <div class="my-wave-retry-container" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: auto; padding: 24px; color: var(--md-sys-color-on-surface-variant); font-size: 14px;">
                  <span data-i18n>Couldn't load recommendations</span>
                  <button class="btn-icon-pill" id="btn-retry-vibe" title="Retry" aria-label="Retry" data-i18n-attr="title aria-label" style="width: 32px; height: 32px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  </button>
                </div>
              `;
              const retryBtn = vibeGrid.querySelector('#btn-retry-vibe');
              if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                  if (el.btnRefreshVibe) el.btnRefreshVibe.click();
                  else loadHomePage(true);
                });
              }
            }
            updateAmbientLight('my-wave-ambient-light', '');
          }
        }
        return false;
      }

      // blocked artists and songs never make it into My Wave (the server leaves them out too; this is the safety net)
      myWaveCurrentTracks = uniqueTracks.filter((/** @type {UrielTrack} */ t) => !isBlocked(t));
      if (!myWaveCurrentTracks.length) myWaveCurrentTracks = uniqueTracks;
      currentWaveFocusedIndex = 0;
      if (spHomeReady && isSpotifyHome()) renderMadeForYou();
      if (homeMode === 'wave') {
        if (vibeGrid) {
          vibeGrid.style.transition = 'none';
          vibeGrid.style.opacity = '0';
        }
        renderHomeCarousel('wave');
        currentWaveFocusedIndex = 0;
        if (vibeGrid) {
          vibeGrid.scrollLeft = 0;
          vibeGrid._focusedIndex = 0;
          const firstCard = /** @type {HTMLElement} */ (vibeGrid.querySelector('.my-wave-track-card'));
          if (firstCard && document.activeElement && document.activeElement.closest('#home-vibe-grid')) {
            firstCard.focus();
          }
          vibeGrid.offsetHeight;
          vibeGrid.style.transition = 'opacity 250ms ease';
          vibeGrid.style.opacity = '1';
        }
      }
      return true;
    } catch (err) {
      if (!isRefresh) {
        myWaveCurrentTracks = [];
        if (homeMode === 'wave') {
          if (focusedMeta) focusedMeta.innerHTML = '';
          if (vibeGrid) {
            vibeGrid.innerHTML = `
              <div class="my-wave-retry-container" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: auto; padding: 24px; color: var(--md-sys-color-on-surface-variant); font-size: 14px;">
                <span data-i18n>Couldn't load recommendations</span>
                <button class="btn-icon-pill" id="btn-retry-vibe" title="Retry" aria-label="Retry" data-i18n-attr="title aria-label" style="width: 32px; height: 32px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                </button>
              </div>
            `;
            const retryBtn = vibeGrid.querySelector('#btn-retry-vibe');
            if (retryBtn) {
              retryBtn.addEventListener('click', () => {
                if (el.btnRefreshVibe) el.btnRefreshVibe.click();
                else loadHomePage(true);
              });
            }
          }
          updateAmbientLight('my-wave-ambient-light', '');
        }
      }
      return false;
    }
  }

  const vibeGridEl = document.getElementById('home-vibe-grid');
  if (vibeGridEl) {
    vibeGridEl.addEventListener('scroll', () => {
      const curTracks = (homeMode === 'recent') ? jumpBackCurrentTracks : myWaveCurrentTracks;
      updateCoverflowCards(vibeGridEl, document.getElementById('my-wave-focused-title'), document.getElementById('my-wave-focused-artist'), document.getElementById('my-wave-ambient-light'), curTracks);
    }, { passive: true });
  }

  const quickRowEl = document.getElementById('home-quick-play-row');
  if (quickRowEl) {
    quickRowEl.addEventListener('scroll', () => {
      updateCoverflowCards(quickRowEl, document.getElementById('jump-focused-title'), document.getElementById('jump-focused-artist'), document.getElementById('jump-ambient-light'), jumpBackCurrentTracks);
    }, { passive: true });
  }

  // ---- Settings → Storage: the cache, music on this device, folders and offline songs (app/storage.js) ----
  const storagePart = /** @type {UrielStoragePart} */ ({});
  /** @param {Record<string, unknown>} [change] */
  function updateDeviceMusicUI(change) { return storagePart.updateDeviceMusicUI(change); }
  function updateOfflineStorageUI() { return storagePart.updateOfflineStorageUI(); }
  function updateMusicFolderUI() { return storagePart.updateMusicFolderUI(); }
  function updateDownloadFolderUI() { return storagePart.updateDownloadFolderUI(); }
  // the window can be hidden before this part has started
  function pauseCacheBars() { if (storagePart.pauseCacheBars) storagePart.pauseCacheBars(); }
  function resumeCacheBars() { if (storagePart.resumeCacheBars) storagePart.resumeCacheBars(); }
  // savePlaylists is defined further down, so it is looked up when a restore saves, not now
  window.UrielApp.storage({ T, Tf, Tm, closeModal, createPlaylist, el, escapeHtml, getTrackThumbUrl, getTrackToDownload, isSameTrack, listThumb, offlineChanged, openModal, openPlaylistDetail, renderLocalView, savePlaylists: () => savePlaylists(), showToast, stampAddedAt, state, updateDownloadCaptionPath }, storagePart);

  const btnOpenShortcuts = document.getElementById('btn-open-shortcuts');
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const btnCloseShortcutsModal = document.getElementById('btn-close-shortcuts-modal');
  if (btnOpenShortcuts && shortcutsModal) btnOpenShortcuts.addEventListener('click', () => openModal(shortcutsModal));
  if (btnCloseShortcutsModal && shortcutsModal) btnCloseShortcutsModal.addEventListener('click', () => closeModal(shortcutsModal));

  const btnCopyDiagnostics = document.getElementById('btn-copy-diagnostics');
  if (btnCopyDiagnostics) {
    btnCopyDiagnostics.addEventListener('click', async () => {
      const api = window.electronAPI || {};
      let text = '';
      try {
        if (typeof api.getDiagnostics === 'function') text = await api.getDiagnostics();
        else {
          // phones: no main process to ask, so the app's own details and its error log
          text = [`Uriel ${(window.URIEL_BUILD && window.URIEL_BUILD.version) || ''} (${(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'web'})`,
            navigator.userAgent, `Language ${navigator.language}`, '--- log ---', window.UrielLog ? window.UrielLog.text() : 'no log'].join('\n');
        }
      } catch (e) { text = `Diagnostics failed: ${(e instanceof Error ? e.message : String(e))}`; }
      if (await copyText(text)) showToast(Tm('Diagnostics copied. Paste it into your report'), 'info');
      else showToast(Tm("Couldn't copy the diagnostics"), 'error');
    });
  }

  const btnOpenLogs = document.getElementById('btn-open-logs');
  if (btnOpenLogs) {
    btnOpenLogs.addEventListener('click', async () => {
      const api = window.electronAPI || {};
      if (typeof api.openLogsFolder === 'function') api.openLogsFolder();
      // phones have no folder to open: share the log instead
      else if (typeof api.shareText === 'function') {
        const res = await api.shareText('Uriel error log', window.UrielLog ? window.UrielLog.text() : 'no log');
        if (res === 'copied') showToast(Tm('Log copied to clipboard'), 'info');
      }
    });
  }

  // the clipboard: the desktop app's own (always allowed), else the page's, else the old select-and-copy
  async function copyText(/** @type {string} */ text) {
    const api = window.electronAPI || {};
    try { if (typeof api.copyText === 'function') { await api.copyText(text); return true; } } catch (e) {}
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  // ---- the Track art dialog: a song's own cover and banner (app/trackArt.js) ----
  const trackArtPart = /** @type {UrielTrackArtPart} */ ({});
  function openTrackArtModal(/** @type {UrielTrack} */ track, /** @type {HTMLElement | null} */ triggerEl = null) { return trackArtPart.openTrackArtModal(track, triggerEl); }
  function applyTrackBannerFx(/** @type {UrielTrackArt | null} */ art) { return trackArtPart.applyTrackBannerFx(art); }
  window.UrielApp.trackArt({ I18N, LiquidMotion, T, Tm, YT_THUMB, analysisCache, closeModal, coverAnalysisCache, el, getTrackArt, getTrackCanonicalId, getTrackThumbUrl, isSameTrack, listThumb, m3cSetImage, nextTrackArt, setTrackArt, showToast, state, syncTvBanner, trackArtCandidates, trackYoutubeId, updateMediaSession, updateRightPanelBanner, updateThemeFromState }, trackArtPart);

  // Search results: All / Songs / Artists / Albums (from Riff 43.1). Only shows or hides the sections, so the
  // choice stays for the next search.
  (function initSearchFilterChips() {
    const box = el.searchResultsContainer;
    const chips = document.getElementById('search-filter-chips');
    if (!box || !chips) return;
    chips.addEventListener('click', (e) => {
      const chip = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.target).closest('.chip-btn[data-filter]'));
      if (!chip) return;
      box.dataset.filter = chip.dataset.filter;
      chips.querySelectorAll('.chip-btn').forEach((c) => {
        const on = c === chip;
        c.classList.toggle('active', on);
        c.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    });
  })();

  // The mouse's back button goes back like the page's own Back button (from Riff 43.1; computers)
  (function initMouseBack() {
    if (isPhoneApp) return;
    const back = (/** @type {MouseEvent} */ e) => {
      if (e.button !== 3) return;
      e.preventDefault();
      if (e.type !== 'mouseup') return;
      if (document.querySelector('.modal-backdrop:not(.hidden)')) return;
      const btn = ['btn-back-artist', 'btn-back-album', 'btn-back-playlists', 'btn-settings-back']
        .map((id) => document.getElementById(id)).find((b) => b && b.offsetParent !== null && b.closest('.content-view.active'));
      if (btn) { btn.click(); return; }
      if (state.previousView && state.previousView !== state.currentView && state.currentView !== 'discover') switchView(state.previousView);
    };
    window.addEventListener('mousedown', back, true);
    window.addEventListener('mouseup', back, true);
  })();

  loadPlugins();
  loadHomePage();
  initHomeHero();
  resizeCanvases();
  updateOfflineStorageUI();
  updateMusicFolderUI();
  updateDownloadFolderUI();
  checkToolsStatus(false);
  setLyricsEmpty(true);
  updateLyricsTranslationUI();
  loadCustomThemes();
  applyCustomStyles();
  enterSettings();
  refreshStacks();
  requestAnimationFrame(() => requestAnimationFrame(refreshStacks));
  initTvk();
  if (typeof m3cInit === 'function') m3cInit();
  requestAnimationFrame(() => requestAnimationFrame(() => updateNavIndicator(false)));

  if (localStorage.getItem('uriel_perf_mode') === null && window.electronAPI && window.electronAPI.getGpuCompositing) {
    window.electronAPI.getGpuCompositing().then((/** @type {string} */ status) => {
      if (status && !status.startsWith('enabled')) {
        localStorage.setItem('uriel_perf_mode', '1');
        applyPerfMode(true);
        if (btnPerfMode) btnPerfMode.classList.add('active');
        showToast(Tm('Performance mode enabled: no GPU acceleration detected. You can turn it off in Settings'));
      }
    }).catch(() => {});
  }

  // ---- the sleep timer (app/sleepTimer.js) ----
  const sleepTimerPart = /** @type {UrielSleepTimerPart} */ ({});
  function updateSleepTimerUI() { return sleepTimerPart.updateSleepTimerUI(); }
  window.UrielApp.sleepTimer({ Tm, audioEngine, el, pauseSmooth, showToast, state }, sleepTimerPart);

  /** @type {ReturnType<typeof setTimeout> | null} */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let queueSaveTimer = null;

  function saveQueueState() {
    if (!state._queueRestored) return;
    try {
      // the song brought back from last time isn't loaded until it plays: its place is still the one it was saved at
      // (going to the background before playing used to save 0, and the song then started over)
      const loaded = el.nativeAudio && el.nativeAudio.src;
      const position = loaded ? (Number.isFinite(el.nativeAudio.currentTime) ? el.nativeAudio.currentTime : 0) : (Number(state.queueRestorePosition) || 0);
      // up to 1000 songs around the current one: a queue made from a long Liked Songs list was megabytes, filled
      // the browser storage and made every save fail and retry (seconds, on each pause and on closing)
      const all = Array.isArray(state.queue) ? state.queue : [];
      const idx = Math.max(0, state.queueIndex);
      const from = all.length > 1000 ? Math.max(0, Math.min(idx - 100, all.length - 1000)) : 0;
      localStorage.setItem('uriel_queue_state', JSON.stringify({
        queue: from || all.length > 1000 ? all.slice(from, from + 1000) : all,
        queueIndex: state.queueIndex - from,
        currentTrack: state.currentTrack,
        position
      }));
    } catch (e) {}
  }

  function scheduleQueueSave() {
    if (queueSaveTimer) clearTimeout(queueSaveTimer);
    queueSaveTimer = setTimeout(saveQueueState, 600);
  }

  function restoreQueueState() {
    state._queueRestored = true;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('uriel_queue_state') || 'null');
    } catch (e) {}
    if (!saved || !Array.isArray(saved.queue) || saved.queue.length === 0) return;
    if (state.currentTrack) return;
    state.queue = saved.queue;
    state.queueIndex = Number.isInteger(saved.queueIndex) && saved.queueIndex >= 0 && saved.queueIndex < saved.queue.length
      ? saved.queueIndex
      : 0;
    state.queueHistory = [state.queueIndex];
    const track = saved.currentTrack && typeof saved.currentTrack === 'object' ? saved.currentTrack : state.queue[state.queueIndex];
    state.queueRestorePosition = Number(saved.position) || 0;
    state.currentTrack = track || null;
    if (state.currentTrack) updateNowPlayingUI(state.currentTrack);
    onTrackAudioTrackChange();
    updateQueueBadge();
    if (el.queueCount) {
      el.queueCount.classList.remove('restored');
      void el.queueCount.offsetWidth;
      el.queueCount.classList.add('restored');
    }
    renderQueueView();
  }

  window.addEventListener('beforeunload', saveQueueState);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveQueueState();
  });
  // and every so often while it plays: a phone ends the app without either of those, and the song started over
  setInterval(() => { if (state.isPlaying) saveQueueState(); }, 15000);

  function openAudioTab(/** @type {string} */ name) {
    const tab = /** @type {HTMLElement} */ (document.querySelector(`.audio-tab[data-audio-tab="${name}"]`));
    if (tab) tab.click();
    if (el.audioSettingsModal) openModal(el.audioSettingsModal);
    refreshStacks();
  }

  // ---- the command palette, Ctrl+K (app/palette.js) ----
  window.UrielApp.palette({ T, Tf, closeModal, el, escapeHtml, getTrackCanonicalId, matchesTrackQuery, openAudioTab, openModal, openPlaylistDetail, performSearch, playTrack, state, switchView, updateLocalBadge });

  function renderPlaylistDuplicateButton(/** @type {UrielPlaylist} */ pl) {
    if (!el.btnDedupePlaylist || !pl) return;
    const duplicates = pl.tracks.length - dedupeTracks(pl.tracks, isSameTrack, getTrackCanonicalId).length;
    el.btnDedupePlaylist.classList.toggle('hidden', duplicates === 0);
    if (el.btnDedupePlaylistLabel) {
      el.btnDedupePlaylistLabel.textContent = duplicates === 1 ? 'Remove 1 duplicate' : `Remove ${duplicates} duplicates`;
    }
  }

  function removePlaylistDuplicates() {
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    if (!pl) return;
    const before = pl.tracks.length;
    pl.tracks = dedupeTracks(pl.tracks, isSameTrack, getTrackCanonicalId);
    const removed = before - pl.tracks.length;
    if (!removed) return;
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    openPlaylistDetail(pl.id);
    renderPlaylistsList();
    showToast(removed === 1 ? Tm('Removed 1 duplicate') : Tm('Removed {0} duplicates', removed));
  }

  if (el.btnDedupePlaylist) el.btnDedupePlaylist.addEventListener('click', removePlaylistDuplicates);

  // ======================= Riff 43: player & look =======================
  // Everything below is from Riff 43, fitted to Uriel. Variables are `var` because code above (lyrics, the
  // player events) can call these functions before this part of the file has run.

  // a Settings dropdown (trigger + menu of .m3-dropdown-option) that saves its value under `key`
  function wireSettingDropdown(/** @type {string} */ id, /** @type {string} */ key, /** @type {string} */ fallback, /** @type {(value: string) => void} */ onPick) {
    const dd = document.getElementById(`${id}-dropdown`);
    const trigger = document.getElementById(`${id}-trigger`);
    const menu = document.getElementById(`${id}-menu`);
    const label = document.getElementById(`${id}-label`);
    if (!dd || !trigger || !menu) return;
    const show = (/** @type {string} */ val) => {
      /** @type {NodeListOf<HTMLElement>} */ (menu.querySelectorAll('.m3-dropdown-option')).forEach((o) => {
        const sel = o.dataset.value === val;
        o.classList.toggle('selected', sel);
        if (sel && label) label.textContent = o.textContent;
      });
    };
    show(localStorage.getItem(key) || fallback);
    trigger.addEventListener('click', (e) => { e.stopPropagation(); dd.classList.toggle('open'); });
    /** @type {NodeListOf<HTMLElement>} */ (menu.querySelectorAll('.m3-dropdown-option')).forEach((o) => o.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.setItem(key, String(o.dataset.value));
      show(o.dataset.value || '');
      dd.classList.remove('open');
      if (onPick) onPick(o.dataset.value || '');
    }));
    document.addEventListener('click', () => dd.classList.remove('open'));
  }

  // ---- hiding the titlebar, intensity on the background, icon packs, the icon on the Home button (app/look.js) ----
  var { applyIconPack } = window.UrielApp.look({ isPhoneApp, getAdv, setAdv, updateThemeFromState, showToast, escapeHtml, Tm, wireSettingDropdown });

  // ---- playbar visualizer: compact (right of the bar) or wide behind the bar; bars or one liquid wave ----
  (function setupBarVisualizer() {
    const group = document.getElementById('bar-viz-pos-group');
    const applyPos = (/** @type {string | undefined} */ pos) => {
      document.body.classList.toggle('bar-viz-behind', pos === 'behind' && !isPhoneApp);
      if (group) /** @type {NodeListOf<HTMLElement>} */ (group.querySelectorAll('.theme-mode-btn')).forEach((b) => b.classList.toggle('active', b.dataset.barVizPos === pos));
      resizeCanvases();
      if (state.isPlaying) startVisualizers();
    };
    applyPos(localStorage.getItem('uriel_bar_viz_pos') || 'behind');
    if (group) /** @type {NodeListOf<HTMLElement>} */ (group.querySelectorAll('.theme-mode-btn')).forEach((b) => b.addEventListener('click', () => {
      localStorage.setItem('uriel_bar_viz_pos', String(b.dataset.barVizPos));
      applyPos(b.dataset.barVizPos);
    }));

    const slider = /** @type {HTMLInputElement} */ (document.getElementById('slider-bar-viz-opacity'));
    const val = document.getElementById('val-bar-viz-opacity');
    const applyOpacity = (/** @type {string} */ v) => {
      const n = Math.max(5, Math.min(85, parseInt(v, 10) || 22));
      document.documentElement.style.setProperty('--bar-viz-opacity', String(n / 100));
      if (val) val.textContent = `${n}%`;
      if (slider && String(slider.value) !== String(n)) slider.value = String(n);
    };
    applyOpacity(localStorage.getItem('uriel_bar_viz_opacity') || '22');
    if (slider) slider.addEventListener('input', (e) => { localStorage.setItem('uriel_bar_viz_opacity', /** @type {HTMLInputElement} */ (e.target).value); applyOpacity(/** @type {HTMLInputElement} */ (e.target).value); });

    const btns = /** @type {HTMLElement[]} */ ([document.getElementById('btn-viz-connected'), document.getElementById('btn-tvk-viz-connected')].filter(Boolean));
    const sync = () => btns.forEach((b) => b.classList.toggle('active', viz.connected));
    btns.forEach((b) => b.addEventListener('click', () => {
      viz.connected = !viz.connected;
      localStorage.setItem('uriel_viz_connected', viz.connected ? '1' : '0');
      sync();
    }));
    sync();
  })();

  // ---- song radio and sharing the playing song (app/radio.js) ----
  const radioPart = /** @type {UrielRadioPart} */ ({});
  function songRadioEnabled() { return radioPart.songRadioEnabled(); }
  function startSongRadio(/** @type {UrielTrack[]} */ seeds) { return radioPart.startSongRadio(seeds); }
  window.UrielApp.radio({ Lib, state, getBlocks, isBlocked, Tm, showToast, isSameTrack, updateQueueBadge, playTrack, el, I18N, sharePlaylist }, radioPart);

  // ---- the fullscreen karaoke, lyrics under the mini player, the lyrics source and word timings (app/lyrics.js) ----
  const lyricsPart = /** @type {UrielLyricsPart} */ ({});
  function miniLyricsShown() { return lyricsPart.miniLyricsShown(); }
  function updateMiniLyricsHighlight(/** @type {number} */ currentTime) { return lyricsPart.updateMiniLyricsHighlight(currentTime); }
  function renderMiniLyrics() { return lyricsPart.renderMiniLyrics(); }
  function lyricsSourcePref() { return lyricsPart.lyricsSourcePref(); }
  function fetchAndUpgradeWords(/** @type {string} */ title, /** @type {string} */ artist, /** @type {number} */ token) { return lyricsPart.fetchAndUpgradeWords(title, artist, token); }
  function lyricWordSpans(/** @type {UrielLyricLine} */ line) { return lyricsPart.lyricWordSpans(line); }
  function lineTimedWords(/** @type {UrielLyricLine} */ line) { return lyricsPart.lineTimedWords(line); }
  function timedWordIndex(/** @type {UrielTimedWord[]} */ timed, /** @type {number} */ t) { return lyricsPart.timedWordIndex(timed, t); }
  function setTvkAmbient(/** @type {boolean} */ on) { return lyricsPart.setTvkAmbient(on); }
  function syncTvkAmbientPlayback() { return lyricsPart.syncTvkAmbientPlayback(); }
  function syncTvkProgress(/** @type {number} */ cur, /** @type {number} */ dur) { return lyricsPart.syncTvkProgress(cur, dur); }
  window.UrielApp.lyrics({ state, formatDuration, el, updateMediaPositionState, rgbToHsl, hexToRgb, hslToHex, getTrackThumbUrl, isPhoneApp, resetTvIdleTimer, getAdv, getLineStartTime, getLineEndTime, escapeHtml, fetchAndApplyTranslation, renderLyricsView, updateSyncedLyricsHighlight, loadSyncedLyrics, wireSettingDropdown, getTvIdleTimer: () => tvIdleTimer }, lyricsPart);

  // ---- stream timeout: a song that has loaded nothing for this long is given up on ----
  (function setupStreamTimeout() {
    const slider = /** @type {HTMLInputElement} */ (document.getElementById('slider-stream-timeout'));
    const val = document.getElementById('val-stream-timeout');
    const seconds = () => Math.max(5, Math.min(30, parseInt(localStorage.getItem('uriel_stream_timeout') || '12', 10) || 12));
    const show = () => { if (val) val.textContent = `${seconds()}s`; if (slider) slider.value = String(seconds()); };
    show();
    if (slider) slider.addEventListener('input', (e) => { localStorage.setItem('uriel_stream_timeout', /** @type {HTMLInputElement} */ (e.target).value); show(); });
    const audio = el.nativeAudio;
    if (!audio) return;
    // checked once a second while a song with a source is loading; anything new buffered counts as progress
    /** @type {ReturnType<typeof setInterval> | null} */
    let poll = null;
    let token = -1;
    let lastProgressAt = 0;
    let lastBuffered = -1;
    const stop = () => { if (poll) clearInterval(poll); poll = null; };
    const bufferedEnd = () => { try { const b = audio.buffered; return b.length ? b.end(b.length - 1) : 0; } catch (e) { return 0; } };
    const giveUp = () => {
      stop();
      if (hlsInstance) { try { hlsInstance.destroy(); } catch (e) {} hlsInstance = null; }
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {}
      state.isPlaying = false;
      document.body.classList.remove('is-playing');
      if (retryFresh(token, state.currentTrack)) return;
      updatePlayPauseButton(false, false);
      if (!skipUnplayable(token, state.currentTrack)) showPlayFailure(Tm('This song took too long to load. Try again or skip.'));
    };
    const arm = () => {
      stop();
      if (!state.trackLoading || !state.currentTrack || state.currentTrack.platform === 'local') return;
      if (!audio.getAttribute('src') && !hlsInstance) return;
      token = state.loadToken;
      lastProgressAt = Date.now();
      lastBuffered = -1;
      poll = setInterval(() => {
        if (token !== state.loadToken || !state.trackLoading || (!audio.paused && audio.currentTime > 0)) { stop(); return; }
        const b = bufferedEnd() + audio.readyState * 1e-3;
        if (b !== lastBuffered) { lastBuffered = b; lastProgressAt = Date.now(); return; }
        if (Date.now() - lastProgressAt > seconds() * 1000) giveUp();
      }, 1000);
    };
    audio.addEventListener('loadstart', () => setTimeout(arm, 0));
    audio.addEventListener('playing', stop);
  })();

  // ======================= end of Riff 43: player & look =======================

  restoreQueueState();

  emitPluginEvent('ready');

  // ---- Core API for the iPhone interface (mobile/ui), which draws its own screens on this engine ----
  const savePlaylists = () => { localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists)); renderPlaylistsList(); window.dispatchEvent(new Event('uriel:library')); };
  window.UrielCore = {
    state,
    audio: el.nativeAudio,
    base: () => `http://127.0.0.1:${state.serverPort}`,
    thumb: (/** @type {UrielTrack} */ t) => getTrackThumbUrl(t),
    playTrack: (/** @type {UrielTrack} */ track, /** @type {UrielTrack[]} */ list, /** @type {number} */ index) => playTrack(track, list || null, typeof index === 'number' ? index : -1),
    togglePlay: () => togglePlayPause(),
    restoreAt: (/** @type {number} */ index, /** @type {number} */ position, /** @type {boolean} */ play) => restoreQueueAt(index, position, play),
    adoptAt: (/** @type {number} */ index) => adoptQueueAt(index),
    resumeAudio: () => audioEngine && audioEngine.resumeAudioContext && audioEngine.resumeAudioContext(),
    next: () => playNext(),
    prev: () => playPrev(),
    seek: (/** @type {number} */ sec) => { if (isFinite(sec)) el.nativeAudio.currentTime = Math.max(0, sec); },
    toggleShuffle: () => { if (el.btnShuffle) el.btnShuffle.click(); return state.isShuffle; },
    toggleRepeat: () => { if (el.btnRepeat) el.btnRepeat.click(); return state.repeatMode; },
    isFavorite: (/** @type {UrielTrack} */ t) => isFavoriteSong(t),
    toggleFavorite: (/** @type {UrielTrack} */ t) => { toggleFavoriteTrack(t); window.dispatchEvent(new Event('uriel:library')); return isFavoriteSong(t); },
    createPlaylist(/** @type {string} */ name, /** @type {UrielTrack[]} */ tracks = []) {
      if (!name || !name.trim()) return null;
      const pl = { id: 'pl_' + Date.now(), name: name.trim(), tracks: tracks.slice() };
      state.playlists.push(pl);
      savePlaylists();
      return pl;
    },
    renamePlaylist(/** @type {string} */ id, /** @type {string} */ name) { const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === id); if (pl && name && name.trim()) { pl.name = name.trim(); savePlaylists(); } },
    deletePlaylist(/** @type {string} */ id) { state.playlists = state.playlists.filter((/** @type {UrielPlaylist} */ p) => p.id !== id); savePlaylists(); },
    addToPlaylist(/** @type {string} */ id, /** @type {UrielTrack} */ track) {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === id);
      if (!pl || pl.tracks.some((/** @type {UrielTrack} */ t) => isSameTrack(t, track))) return false;
      pl.tracks.push(track);
      savePlaylists();
      return true;
    },
    removeFromPlaylist(/** @type {string} */ id, /** @type {UrielTrack} */ track) { const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === id); if (pl) { pl.tracks = pl.tracks.filter((/** @type {UrielTrack} */ t) => !isSameTrack(t, track)); savePlaylists(); } },
    playNextInQueue(/** @type {UrielTrack} */ track) {
      const at = Math.max(0, state.queueIndex + 1);
      state.queue.splice(at, 0, track);
      updateQueueBadge();
      window.dispatchEvent(new Event('uriel:queue'));
    },
    addToQueue(/** @type {UrielTrack} */ track) { state.queue.push(track); updateQueueBadge(); window.dispatchEvent(new Event('uriel:queue')); },
    isSameTrack: (/** @type {UrielTrack | null} */ a, /** @type {UrielTrack | null} */ b) => isSameTrack(a, b),
    formatDuration: (/** @type {number | undefined} */ s) => formatDuration(s),
    toast: (/** @type {UrielText} */ msg, /** @type {string} */ kind) => showToast(msg, kind),
    refreshBackground: () => updateCustomBg(),
    // for lastfm.js and backup.js (Last.fm dialog, playlist files, backups)
    openModal: (/** @type {HTMLElement | null} */ m) => openModal(m),
    closeModal: (/** @type {HTMLElement | null} */ m) => closeModal(m),
    importPlaylist(/** @type {string} */ name, /** @type {UrielTrack[]} */ tracks, { cover = '', description = '' } = {}) {
      const pl = createPlaylist(name, tracks || [], cover, { open: false });
      if (pl && description) { pl.description = description; localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists)); }
      if (pl) window.dispatchEvent(new Event('uriel:library'));
      return pl;
    },
    openPlaylist: (/** @type {string} */ id) => openPlaylistDetail(id),
    // songs known only by title and artist, found on YouTube like a Spotify import
    matchTracks: (/** @type {Partial<UrielImportSong>[]} */ list, /** @type {((done: number, total: number) => void) | undefined} */ onProgress) => matchSpotifyTracks(list, onProgress),
    // sync.js wrote these keys with what another device had; show it without a restart
    reloadFromStorage(/** @type {string[]} */ keys) {
      const has = (/** @type {string} */ k) => keys.includes(k);
      if (has('devsize_playlists')) {
        state.playlists = safeArray('devsize_playlists');
        renderPlaylistsList();
        if (state.currentView === 'playlist-detail' && state.currentPlaylistId) {
          if (state.playlists.some((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId)) openPlaylistDetail(state.currentPlaylistId);
          else switchView('local');
        }
      }
      if (has('devsize_favorites')) {
        state.favorites = dedupeFavoriteTracks(safeArray('devsize_favorites'));
        updateFavoritesBadge();
        updateFavoriteIcon();
        if (state.currentView === 'favorites') renderFavoritesView();
      }
      if (has('devsize_history')) {
        state.history = safeArray('devsize_history');
        if (state.currentView === 'history') renderHistoryView();
      }
      // saved albums and followed artists from another device
      if (has('uriel_saved_albums')) {
        updateAlbumsCount();
        if (state.currentView === 'albums') renderSavedAlbums();
        if (state.currentView === 'album') updateSaveAlbumButton();
      }
      if (has('uriel_followed_artists')) {
        renderFollowedArtists();
        if (state.currentView === 'artist') updateFollowButton();
      }
      if (['uriel_theme_mode', 'uriel_theme_accent', 'uriel_theme_intensity', 'uriel_theme_brightness', 'uriel_palette_style', 'uriel_site_theme'].some(has)) {
        state.siteTheme = localStorage.getItem('uriel_site_theme') ?? 'halloween';
        state.themeMode = localStorage.getItem('uriel_theme_mode') || 'dark';
        state.themeAccent = localStorage.getItem('uriel_theme_accent') || '#6750A4';
        state.themeIntensity = parseInt(localStorage.getItem('uriel_theme_intensity') || '0', 10);
        state.themeBrightness = parseInt(localStorage.getItem('uriel_theme_brightness') || '50', 10);
        state.paletteStyle = localStorage.getItem('uriel_palette_style') || 'classic';
        updateThemeFromState();
      }
      if (has('uriel_font')) {
        state.riffFont = localStorage.getItem('uriel_font') || 'google';
        applyFont(state.riffFont);
      }
      if (has('uriel_track_trims')) forgetTrackTrims();
      if (has('uriel_icon_pack')) applyIconPack(localStorage.getItem('uriel_icon_pack') || 'material');
      if (has('uriel_adv_intensity_bg')) updateThemeFromState();
      if (keys.some((/** @type {string} */ k) => k === 'devsize_playlists' || k === 'devsize_favorites')) window.dispatchEvent(new Event('uriel:library'));
    },
  };
  window.dispatchEvent(new Event('uriel:ready'));
});

document.addEventListener('DOMContentLoaded', () => {
  const btnCollapseRightPanel = document.getElementById('btn-collapse-right-panel');
  const rightPanel = document.getElementById('right-panel');
  if (btnCollapseRightPanel && rightPanel) {
    btnCollapseRightPanel.addEventListener('click', () => {
      rightPanel.classList.toggle('is-collapsed');
    });
  }
});

