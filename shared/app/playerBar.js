// @ts-check
// The search engine buttons (YouTube, YouTube Music, SoundCloud) and how they're shown, and the player bar's
// buttons: play, next, previous, shuffle, repeat, the heart, the queue, and the volume. Part of app.js, which
// calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielPlayerBarPart} out */
window.UrielApp.playerBar = function ({ applyAudioSettings, el, performSearch, persistSoundSettings, playNext, playPrev, renderHistoryView, renderQueueView, showPlayingInQueue, shuffleQueue, state, T, toggleFavoriteTrack, togglePlayPause, unshuffleQueue, updateQueueBadge }, out) {
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

  /** @type {UrielPlayerBarPart} */
  const api = { setPlatform, updateEngineWidthVar, setShuffle, persistVolumeState, syncVolumeControls };
  Object.assign(out, api);
};
