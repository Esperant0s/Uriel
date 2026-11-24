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

  // ---- the theme palette and the website themes (app/themePalette.js) ----
  const themePalettePart = /** @type {UrielThemePalettePart} */ ({});
  function activeSiteTheme() { return themePalettePart.activeSiteTheme(); }
  function generateM3Palette(/** @type {string} */ hexColor, /** @type {string} */ mode, /** @type {number} */ intensity, /** @type {number} */ brightness) { return themePalettePart.generateM3Palette(hexColor, mode, intensity, brightness); }
  window.UrielApp.themePalette({ getAdv, hexToRgb, hslToHex, mixHex, relLuminance, rgbToHsl, state }, themePalettePart);
  const PALETTE_STYLES = themePalettePart.PALETTE_STYLES;
  const SITE_THEMES = themePalettePart.SITE_THEMES;

  // playback flags the parts in shared/app/ read and set too, so they live in one object passed to them
  const playback = {
    // the playing song is fading out for Crossfade, and the next one should fade in when it starts
    crossfadeTriggered: false,
    crossfadeFadeInPending: false,
    // the progress bar's knob is being dragged
    isDraggingScrubber: false,
    // bumped when another song starts, so an album still being looked up stops queueing itself
    albumRunId: 0,
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

  // ---- sound presets (app/presets.js) ----
  const presetsPart = /** @type {UrielPresetsPart} */ ({});
  function renderPresets() { return presetsPart.renderPresets(); }
  function updateFade(/** @type {Element | null} */ el) { return presetsPart.updateFade(el); }
  function updatePresetsFade() { return presetsPart.updatePresetsFade(); }
  function saveCustomPreset(/** @type {string} */ name) { return presetsPart.saveCustomPreset(name); }
  function renameCustomPreset(/** @type {string} */ id, /** @type {string} */ newName) { return presetsPart.renameCustomPreset(id, newName); }
  function deleteCustomPreset(/** @type {string} */ id) { return presetsPart.deleteCustomPreset(id); }
  window.UrielApp.presets({ applyAudioSettings, defaultPresets, el, escapeHtml, I18N, initAudioContext, normalizePreset, openModal, persistSoundSettings, state, syncSettingsSlidersToState }, presetsPart);

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
      stopLyricsScroll();
      stopGradientLoop();
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

    if (context !== 'album') playback.albumRunId++;
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
    stopLyricsScroll();
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

  // ---- the synced lyrics view and translating lyrics (app/lyricsView.js) ----
  const lyricsViewPart = /** @type {UrielLyricsViewPart} */ ({});
  function setLyricsEmpty(/** @type {boolean} */ isEmpty) { return lyricsViewPart.setLyricsEmpty(isEmpty); }
  function loadSyncedLyrics(/** @type {string} */ title, /** @type {string} */ artist, /** @type {number} */ token) { return lyricsViewPart.loadSyncedLyrics(title, artist, token); }
  function getLyricsWordStyle() { return lyricsViewPart.getLyricsWordStyle(); }
  function renderLyricsView() { return lyricsViewPart.renderLyricsView(); }
  function updateLyricsPadding() { return lyricsViewPart.updateLyricsPadding(); }
  function fetchAndApplyTranslation() { return lyricsViewPart.fetchAndApplyTranslation(); }
  function updateLyricsTranslationUI() { return lyricsViewPart.updateLyricsTranslationUI(); }
  function getLineStartTime(/** @type {number} */ idx) { return lyricsViewPart.getLineStartTime(idx); }
  function getLineEndTime(/** @type {number} */ idx) { return lyricsViewPart.getLineEndTime(idx); }
  function getLyricsEase() { return lyricsViewPart.getLyricsEase(); }
  function getLyricsSpeed() { return lyricsViewPart.getLyricsSpeed(); }
  function applyLyricsEase() { return lyricsViewPart.applyLyricsEase(); }
  function getLyricsGradientTightness() { return lyricsViewPart.getLyricsGradientTightness(); }
  function applyLyricsGradientTightness() { return lyricsViewPart.applyLyricsGradientTightness(); }
  function stopLyricsScroll() { return lyricsViewPart.stopLyricsScroll(); }
  function animateLyricsScroll(/** @type {HTMLElement} */ container, /** @type {number} */ target) { return lyricsViewPart.animateLyricsScroll(container, target); }
  function updateActiveGradient() { return lyricsViewPart.updateActiveGradient(); }
  function stopGradientLoop() { return lyricsViewPart.stopGradientLoop(); }
  function updateSyncedLyricsHighlight(/** @type {number} */ currentTime) { return lyricsViewPart.updateSyncedLyricsHighlight(currentTime); }
  window.UrielApp.lyricsView({ capMap, lyricsSourcePref, el, fetchAndUpgradeWords, flipAnimate, getAdv, I18N, isPhoneApp, lineTimedWords, lyricWordSpans, miniLyricsShown, renderMiniLyrics, sendStateToServer, state, syncTvLayout, timedWordIndex, updateMiniLyricsHighlight, viz }, lyricsViewPart);
  const TRANSLATION_LANGUAGES = lyricsViewPart.TRANSLATION_LANGUAGES;

  // ---- the TV karaoke and its settings (app/tvKaraoke.js) ----
  const tvKaraokePart = /** @type {UrielTvKaraokePart} */ ({});
  function openTvKaraoke() { return tvKaraokePart.openTvKaraoke(); }
  function closeTvKaraoke() { return tvKaraokePart.closeTvKaraoke(); }
  function initTvk() { return tvKaraokePart.initTvk(); }
  function resetTvIdleTimer() { return tvKaraokePart.resetTvIdleTimer(); }
  function syncTvBanner() { return tvKaraokePart.syncTvBanner(); }
  /** @param {boolean} [forcedNoLyrics] */
  function syncTvLayout(forcedNoLyrics) { return tvKaraokePart.syncTvLayout(forcedNoLyrics); }
  function updateTvKaraokeMeta() { return tvKaraokePart.updateTvKaraokeMeta(); }
  function updateTvkOutput() { return tvKaraokePart.updateTvkOutput(); }
  function updateTvkVisualizerSetting(/** @type {boolean | string} */ enabled) { return tvKaraokePart.updateTvkVisualizerSetting(enabled); }
  function updateTvkVisualizerLyricsSetting(/** @type {boolean | string} */ enabled) { return tvKaraokePart.updateTvkVisualizerLyricsSetting(enabled); }
  function updateTvkVisualizerOpacity(/** @type {string | number} */ opacityVal) { return tvKaraokePart.updateTvkVisualizerOpacity(opacityVal); }
  window.UrielApp.tvKaraoke({ applyTrackBannerFx, audioEngine, el, ensureSfFontLoaded, fontVal, getTrackArt, getTrackThumbUrl, isPhoneApp, playNext, playPrev, renderLyricsView, resizeCanvases, setPlayPauseState, setTvkAmbient, SF_FONT_STACK, showToast, startVisualizers, state, stopLyricsScroll, syncTvkAmbientPlayback, syncTvkProgress, T, Tf, Tm, toggleFavoriteTrack, togglePlayPause, updateLyricsPadding, updatePlayPauseButton, updateSyncedLyricsHighlight, viz }, tvKaraokePart);

  // ---- Settings > Tracks > Output device (app/outputDevice.js) ----
  window.UrielApp.outputDevice({ audioEngine, el, isPhoneApp, showToast, state, T, Tf, Tm, updateTvkOutput });

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

  const Lib = window.UrielLibrary;

  // ---- playing albums, saved albums and rating Daily Mixes (app/albums.js) ----
  const albumsPart = /** @type {UrielAlbumsPart} */ ({});
  function fetchArtistCardForSearch(/** @type {string} */ query, /** @type {number} */ token, /** @type {UrielTrack[]} */ searchTracks) { return albumsPart.fetchArtistCardForSearch(query, token, searchTracks); }
  function resolveAlbumTrack(/** @type {UrielAlbum} */ album, /** @type {UrielTrack} */ t) { return albumsPart.resolveAlbumTrack(album, t); }
  function playAlbumFrom(/** @type {UrielAlbum} */ album, /** @type {UrielTrack[]} */ tracks, startIndex = 0) { return albumsPart.playAlbumFrom(album, tracks, startIndex); }
  function getSavedAlbums() { return albumsPart.getSavedAlbums(); }
  function setSavedAlbums(/** @type {UrielAlbum[]} */ list) { return albumsPart.setSavedAlbums(list); }
  function updateAlbumsCount() { return albumsPart.updateAlbumsCount(); }
  function renderSavedAlbums() { return albumsPart.renderSavedAlbums(); }
  function applyShowAlbums() { return albumsPart.applyShowAlbums(); }
  function updateSaveAlbumButton() { return albumsPart.updateSaveAlbumButton(); }
  function getMixFeedback() { return albumsPart.getMixFeedback(); }
  function showAlbumExtras(/** @type {UrielAlbum} */ album) { return albumsPart.showAlbumExtras(album); }
  window.UrielApp.albums({ el, escapeHtml, getTrackNormalizedKey, isSameTrack, Lib, normalizeImportText, openArtistProfile, playback, playTrack, pool, refreshStacks, renderAlbumCards, renderQueueView, safeArray, safeJson, showToast, shuffleQueue, sortedLibrary, state, switchView, Tm, toSeconds, updateNavIndicator, updateQueueBadge }, albumsPart);

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

  // ---- blocked artists and songs (from Riff 43.1) (app/blocks.js) ----
  const blocksPart = /** @type {UrielBlocksPart} */ ({});
  function getBlocks() { return blocksPart.getBlocks(); }
  function isBlocked(/** @type {UrielTrack} */ track) { return blocksPart.isBlocked(track); }
  function toggleBlockArtist(/** @type {string} */ name) { return blocksPart.toggleBlockArtist(name); }
  function toggleBlockSong(/** @type {UrielTrack} */ track) { return blocksPart.toggleBlockSong(track); }
  function renderBlockedSettings() { return blocksPart.renderBlockedSettings(); }
  window.UrielApp.blocks({ I18N, Lib, showToast, T, Tm, updateArtistBlockButton }, blocksPart);

  // ---- song rows, the song menu and the action menus (app/trackRows.js) ----
  const trackRowsPart = /** @type {UrielTrackRowsPart} */ ({});
  function createTrackRow(/** @type {UrielTrack} */ track, /** @type {number} */ idx, /** @type {string} */ currentCanonicalId, /** @type {string} */ context, /** @type {UrielTrack[]} */ tracks, /** @type {HTMLElement} */ container) { return trackRowsPart.createTrackRow(track, idx, currentCanonicalId, context, tracks, container); }
  function renderTracks(/** @type {HTMLElement} */ container, /** @type {UrielTrack[]} */ tracks, context = 'search') { return trackRowsPart.renderTracks(container, tracks, context); }
  function highlightPlayingRow() { return trackRowsPart.highlightPlayingRow(); }
  function isFavoriteSong(/** @type {UrielTrack} */ track) { return trackRowsPart.isFavoriteSong(track); }
  function showActionMenu(/** @type {number} */ x, /** @type {number} */ y, /** @type {UrielMenuItem[]} */ items, aboveY = y) { return trackRowsPart.showActionMenu(x, y, items, aboveY); }
  window.UrielApp.trackRows({ canReorder, checkOffline, copyText, dragGrip, el, escapeHtml, formatDuration, getBlocks, getTrackCanonicalId, getTrackThumbUrl, I18N, isBlocked, isPhoneApp, isSameTrack, Lib, listThumb, multiSel, OFFLINE_ICON, offlineKey, offlineState, openAddToPlaylistModal, openDownloadModal, openTrackArtist, openTrackArtModal, playTrack, removeTrackFromCurrentPlaylist, renderBlockedSettings, renderLocalView, rowTitle, sharePlaylist, shownThumbs, showToast, songRadioEnabled, sortTracksFor, startSongRadio, state, T, Tf, THUMB_FALLBACK, Tm, toggleBlockArtist, toggleBlockSong, toggleFavoriteTrack, toggleTrackSelection, trackArtCandidates, updateArtistBlockButton, updateLocalBadge, updateQueueBadge }, trackRowsPart);

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

  // ---- the library lists: favourites, history, the queue and your own files (app/library.js) ----
  const libraryPart = /** @type {UrielLibraryPart} */ ({});
  function toggleFavoriteTrack(/** @type {UrielTrack} */ track) { return libraryPart.toggleFavoriteTrack(track); }
  function updateFavoriteIcon() { return libraryPart.updateFavoriteIcon(); }
  function updateFavoritesBadge() { return libraryPart.updateFavoritesBadge(); }
  function getTrackSortMode(/** @type {string} */ kind) { return libraryPart.getTrackSortMode(kind); }
  function setTrackSortMode(/** @type {string} */ kind, /** @type {string} */ mode) { return libraryPart.setTrackSortMode(kind, mode); }
  function sortTracksFor(/** @type {string} */ kind, /** @type {UrielTrack[]} */ tracks) { return libraryPart.sortTracksFor(kind, tracks); }
  function stampAddedAt(/** @type {UrielTrack} */ track) { return libraryPart.stampAddedAt(track); }
  function renderFavoritesView() { return libraryPart.renderFavoritesView(); }
  function syncSortDropdown(/** @type {string} */ kind) { return libraryPart.syncSortDropdown(kind); }
  function setupSortDropdown(/** @type {string} */ kind, /** @type {HTMLSelectElement} */ selectEl) { return libraryPart.setupSortDropdown(kind, selectEl); }
  function getLibrarySort(/** @type {string} */ kind) { return libraryPart.getLibrarySort(kind); }
  function renderHistoryView() { return libraryPart.renderHistoryView(); }
  function updateQueueBadge() { return libraryPart.updateQueueBadge(); }
  function renderQueueView() { return libraryPart.renderQueueView(); }
  function updateLocalBadge() { return libraryPart.updateLocalBadge(); }
  function renderLocalView(forceFetch = true) { return libraryPart.renderLocalView(forceFetch); }
  /** @template {{ name: string }} I @param {string} kind @param {I[]} items @returns {I[]} */
  function sortedLibrary(kind, items) { return libraryPart.sortedLibrary(kind, items); }
  /** @param {{ folder?: boolean }} [opts] */
  function importLocalFiles(opts) { return libraryPart.importLocalFiles(opts); }
  window.UrielApp.library({ artistPlays, el, isFavoriteSong, isPhoneApp, matchesTrackQuery, renderArtistsTab, renderPlaylistsList, renderSavedAlbums, renderTracks, scheduleQueueSave, showToast, state, Tm, tokenUrl }, libraryPart);

  // ---- song covers: picking one, the fallbacks, and saving the ones that worked (app/covers.js) ----
  const coversPart = /** @type {UrielCoversPart} */ ({});
  function listThumb(/** @type {string} */ url) { return coversPart.listThumb(url); }
  function trackYoutubeId(/** @type {UrielTrack} */ track) { return coversPart.trackYoutubeId(track); }
  function trackArtCandidates(/** @type {UrielTrack | null} */ track) { return coversPart.trackArtCandidates(track); }
  function nextPlayerArt(/** @type {UrielTrack} */ track, /** @type {HTMLImageElement} */ img) { return coversPart.nextPlayerArt(track, img); }
  function getTrackThumbUrl(/** @type {UrielTrack | null} */ track) { return coversPart.getTrackThumbUrl(track); }
  function rowTitle(/** @type {UrielTrack} */ track) { return coversPart.rowTitle(track); }
  function nextTrackArt(/** @type {HTMLImageElement} */ img) { return coversPart.nextTrackArt(img); }
  /** @param {string | undefined} canonicalId @param {string} url */
  function rememberTrackArt(canonicalId, url) { return coversPart.rememberTrackArt(canonicalId, url); }
  window.UrielApp.covers({ getAdv, getTrackArt, getTrackCanonicalId, isPhoneApp, state, tokenUrl }, coversPart);
  const YT_THUMB = coversPart.YT_THUMB;

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

  // ---- playlists: the list, a playlist's page and the playlist dialogs (app/playlists.js) ----
  const playlistsPart = /** @type {UrielPlaylistsPart} */ ({});
  function renderPlaylistCover(/** @type {HTMLElement} */ container, /** @type {UrielPlaylist} */ playlist, size = 64) { return playlistsPart.renderPlaylistCover(container, playlist, size); }
  function renderPlaylistsList() { return playlistsPart.renderPlaylistsList(); }
  function createPlaylist(/** @type {string} */ name, /** @type {UrielTrack[]} */ initialTracks = [], cover = '', { open = true } = {}) { return playlistsPart.createPlaylist(name, initialTracks, cover, { open }); }
  function openPlaylistDetail(/** @type {string} */ playlistId) { return playlistsPart.openPlaylistDetail(playlistId); }
  function sharePlaylist(/** @type {{ name: string, tracks: UrielTrack[] } | undefined} */ pl) { return playlistsPart.sharePlaylist(pl); }
  function refreshPlaylistDownloads(/** @type {UrielPlaylist | undefined} */ pl) { return playlistsPart.refreshPlaylistDownloads(pl); }
  function importSharedPlaylist(/** @type {string} */ text) { return playlistsPart.importSharedPlaylist(text); }
  function removeTrackFromCurrentPlaylist(/** @type {UrielTrack} */ track) { return playlistsPart.removeTrackFromCurrentPlaylist(track); }
  function deleteCurrentPlaylist() { return playlistsPart.deleteCurrentPlaylist(); }
  function openAddToPlaylistModal(/** @type {UrielTrack | null} */ track, /** @type {UrielTrack[] | null} */ many = null) { return playlistsPart.openAddToPlaylistModal(track, many); }
  window.UrielApp.playlists({ canReorder, closeModal, downloadedInFolder, dragGrip, el, escapeHtml, exitMultiSelect, formatDuration, getCoverDominantColors, getLibrarySort, getTrackCanonicalId, getTrackSortMode, getTrackThumbUrl, I18N, isBlocked, isFavoriteSong, isPhoneApp, isSameTrack, matchesTrackQuery, multiSel, multiSelectSourceTracks, nextTrackArt, offlineChanged, openModal, playTrack, renderPlaylistDuplicateButton, renderTracks, rerenderMultiSelectView, setShuffle, setTrackSortMode, setupSortDropdown, showActionMenu, showToast, songRadioEnabled, sortedLibrary, sortTracksFor, stampAddedAt, startMultiSelect, startSongRadio, state, switchView, syncSortDropdown, T, Tf, Tm, trackArtCandidates, updateFavoriteIcon, updateFavoritesBadge, updateMultiSelectBar, updateQueueBadge }, playlistsPart);

  // ---- dragging rows to reorder lists (app/reorder.js) ----
  window.UrielApp.reorder({ el, getLibrarySort, getTrackSortMode, isPhoneApp, state, updateQueueBadge });

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

  // ---- the slide-over drawer: Now playing and Queue (app/panelDrawer.js) ----
  const panelDrawerPart = /** @type {UrielPanelDrawerPart} */ ({});
  function openPanelDrawer(/** @type {string} */ tab) { return panelDrawerPart.openPanelDrawer(tab); }
  function showPlayingInQueue() { return panelDrawerPart.showPlayingInQueue(); }
  window.UrielApp.panelDrawer({ el, renderQueueView, resizeCanvases, startVisualizers, state, viz }, panelDrawerPart);

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

  // the active card follows the theme; applyTheme calls this before the cards' part has started
  function syncSiteThemeCards() {
    const site = activeSiteTheme();
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.site-theme-card')).forEach((c) => {
      const on = c.dataset.siteTheme === 'system' ? state.siteTheme === 'system' : !!site && c.dataset.siteTheme === site.id;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
  }

  // ---- the app theme cards and the System theme (app/themeCards.js) ----
  const themeCardsPart = /** @type {UrielThemeCardsPart} */ ({});
  function setSiteTheme(/** @type {string} */ id, apply = true) { return themeCardsPart.setSiteTheme(id, apply); }
  function applySystemColors() { return themeCardsPart.applySystemColors(); }
  window.UrielApp.themeCards({ activeSiteTheme, SITE_THEMES, smoothThemeSwap, state, syncSiteThemeCards, updateThemeFromState }, themeCardsPart);

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

  // ---- keyboard shortcuts (app/shortcuts.js) ----
  window.UrielApp.shortcuts({ applyAudioSettings, closeModal, closeTvKaraoke, el, handleSyncLineClick, openTvKaraoke, persistVolumeState, playNext, playPrev, resetTvIdleTimer, state, switchView, syncState, syncVolumeControls, toggleMiniWindow, togglePlayPause });

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

  // ---- My Wave, Jump back in and For you on Home (app/wave.js) ----
  const wavePart = /** @type {UrielWavePart} */ ({});
  function computeTasteProfile(maxSeeds = 8) { return wavePart.computeTasteProfile(maxSeeds); }
  function normalizeArtistName(/** @type {string} */ name) { return wavePart.normalizeArtistName(name); }
  function getTrackNormalizedKey(/** @type {string | undefined} */ artist, /** @type {string | undefined} */ title) { return wavePart.getTrackNormalizedKey(artist, title); }
  function getWaveAvoid() { return wavePart.getWaveAvoid(); }
  function recordWaveSkip(/** @type {UrielTrack} */ track) { return wavePart.recordWaveSkip(track); }
  function extendMyWaveQueue() { return wavePart.extendMyWaveQueue(); }
  function getCoverDominantColors(/** @type {string} */ url) { return wavePart.getCoverDominantColors(url); }
  function syncHomeAmbientVisibility() { return wavePart.syncHomeAmbientVisibility(); }
  function initHomeHero() { return wavePart.initHomeHero(); }
  /** @param {boolean} [force] */
  function loadForYou(force) { return wavePart.loadForYou(force); }
  function warmHomeSongs(/** @type {UrielTrack[]} */ tracks, /** @type {number} */ n) { return wavePart.warmHomeSongs(tracks, n); }
  function loadHomePage(isRefresh = false) { return wavePart.loadHomePage(isRefresh); }
  window.UrielApp.wave({ capMap, el, escapeHtml, getAdv, getBlocks, getMixFeedback, getTrackCanonicalId, getTrackThumbUrl, homeReady: () => spHomeReady, I18N, isBlocked, isPhoneApp, isSpotifyHome, Lib, listThumb, offlineState, openArtistProfile, performSearch, playTrack, renderMadeForYou, renderQueueView, safeJson, showToast, state, T, THUMB_FALLBACK, Tm, trackArtCandidates, updateQueueBadge }, wavePart);
  const analysisCache = wavePart.analysisCache;

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
    homeReady: () => spHomeReady, getWaveTracks: () => wavePart.getWaveTracks(),
  }, home);
  spHomeReady = true;
  home.applyHomeLayout();

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
  window.UrielApp.lyrics({ state, formatDuration, el, updateMediaPositionState, rgbToHsl, hexToRgb, hslToHex, getTrackThumbUrl, isPhoneApp, resetTvIdleTimer, getAdv, getLineStartTime, getLineEndTime, escapeHtml, fetchAndApplyTranslation, renderLyricsView, updateSyncedLyricsHighlight, loadSyncedLyrics, wireSettingDropdown, getTvIdleTimer: () => tvKaraokePart.getTvIdleTimer() }, lyricsPart);

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

