// @ts-check
// Writing your own lyrics for a song, and the sync mode that times them: tap each line as it's sung.
// Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielLyricsEditorPart} out */
window.UrielApp.lyricsEditor = function ({ animateLyricsScroll, closeModal, el, loadSyncedLyrics, openModal, playSmooth, showToast, state, Tm }, out) {
  function openCustomLyricsEditor() {
    if (!state.currentTrack) {
      showToast(Tm('Play a song first to add lyrics'), 'info');
      return;
    }
    if (el.customLyricsTrackTitle) el.customLyricsTrackTitle.textContent = (state.currentTrack.title || 'untitled');
    if (el.customLyricsTrackArtist) el.customLyricsTrackArtist.textContent = (state.currentTrack.artist || '');

    // the editor stays open across song changes: remember which song it is for
    customLyricsFor = { title: state.currentTrack.title || '', artist: state.currentTrack.artist || '' };
    if (state.syncedLyrics.length > 0) {
      // keep the timestamps, or fixing a typo in synced lyrics saved them unsynced
      if (el.customLyricsTextarea) el.customLyricsTextarea.value = state.syncedLyrics.map((/** @type {{ time: number, text: string }} */ l) => (l.time >= 0 ? `${lrcStamp(l.time)}${l.text}` : l.text)).join('\n');
    } else {
      if (el.customLyricsTextarea) el.customLyricsTextarea.value = '';
    }
    if (el.customLyricsModal) {
      openModal(el.customLyricsModal);
      if (el.customLyricsTextarea) setTimeout(() => el.customLyricsTextarea.focus(), 100);
    }
  }

  function closeCustomLyricsEditor() {
    if (el.customLyricsModal) closeModal(el.customLyricsModal);
  }

  /** @type {{ title: string, artist: string } | null} */
  let customLyricsFor = null;
  const lrcStamp = (/** @type {number} */ t) => `[${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}]`;
  const isCurrentSong = (/** @type {{ title: string, artist: string } | null | undefined} */ s) => !!(s && state.currentTrack && (state.currentTrack.title || '') === s.title && (state.currentTrack.artist || '') === s.artist);

  async function saveCustomLyrics() {
    if (!customLyricsFor || !el.customLyricsTextarea) return;
    const text = el.customLyricsTextarea.value.trim();

    const { title, artist } = customLyricsFor;

    try {
      const res = await fetch(
        `http://127.0.0.1:${state.serverPort}/api/save-custom-lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
                              {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ lyrics: text })
                              }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Save failed');

      showToast(text ? Tm('Lyrics saved successfully') : Tm('Lyrics removed'), 'info');
      closeCustomLyricsEditor();
      if (isCurrentSong({ title, artist })) loadSyncedLyrics(title, artist, state.loadToken);
    } catch (e) {
      showToast(Tm('Failed to save lyrics: {0}', (e instanceof Error ? e.message : String(e))), 'error');
    }
  }

  if (el.btnAddCustomLyrics) el.btnAddCustomLyrics.addEventListener('click', openCustomLyricsEditor);
  if (el.btnCloseCustomLyrics) el.btnCloseCustomLyrics.addEventListener('click', closeCustomLyricsEditor);
  if (el.btnCancelCustomLyrics) el.btnCancelCustomLyrics.addEventListener('click', closeCustomLyricsEditor);
  if (el.btnSaveCustomLyrics) el.btnSaveCustomLyrics.addEventListener('click', saveCustomLyrics);

  if (el.customLyricsModal) {
    el.customLyricsModal.addEventListener('click', (/** @type {MouseEvent} */ e) => {
      if (e.target === el.customLyricsModal) closeCustomLyricsEditor();
    });
  }

  /** @type {UrielSyncState} */
  const syncState = {
    active: false,
    lines: [],
    currentIndex: 0
  };

  function openSyncMode() {
    if (!state.currentTrack) {
      showToast(Tm('Play a song first to sync lyrics'), 'info');
      return;
    }

    if (state.syncedLyrics.length === 0) {
      showToast(Tm('Add lyrics first using the edit button, then sync them'), 'info');
      return;
    }

    syncState.active = true;
    syncState.lines = state.syncedLyrics.map((/** @type {{ time: number, text: string }} */ l) => ({ text: l.text, time: null }));
    syncState.currentIndex = 0;
    // the overlay stays open when the song ends: the timings belong to this song, not whatever plays at Save
    syncState.song = { title: state.currentTrack.title || '', artist: state.currentTrack.artist || '' };

    renderSyncLines();
    // the banner shipped with placeholder text and was never filled in
    const syncTitle = document.getElementById('sync-track-title');
    const syncArtist = document.getElementById('sync-track-artist');
    if (syncTitle) syncTitle.textContent = (state.currentTrack && state.currentTrack.title) || 'Untitled';
    if (syncArtist) syncArtist.textContent = (state.currentTrack && state.currentTrack.artist) || '';
    if (el.syncModeOverlay) openModal(el.syncModeOverlay);

    if (state.currentTrack && !state.isPlaying) {
      playSmooth();
    }

    showToast(Tm('Press play, then click or tap each line when you hear it'), 'info');
  }

  function updateSyncProgress() {
    const synced = syncState.lines.filter(l => l.time !== null).length;
    const total = syncState.lines.length;
    if (el.syncProgressText) el.syncProgressText.textContent = `${synced} / ${total} lines synced`;
  }

  function renderSyncLines() {
    if (!el.syncModeLyrics) return;
    const prevTop = el.syncModeLyrics.scrollTop;
    el.syncModeLyrics.innerHTML = '';
    syncState.lines.forEach((line, idx) => {
      const div = document.createElement('div');
      div.className = 'sync-line';
      div.textContent = line.text;

      if (line.time !== null) {
        div.classList.add('synced');
        const min = Math.floor(line.time / 60);
        const sec = (line.time % 60).toFixed(2);
        div.setAttribute('data-time', `[${min}:${sec.padStart(5, '0')}]`);
      }

      if (idx === syncState.currentIndex && line.time === null) {
        div.classList.add('next-line');
      }

      div.addEventListener('click', () => handleSyncLineClick(idx));
      el.syncModeLyrics.appendChild(div);
    });

    el.syncModeLyrics.scrollTop = prevTop;
    updateSyncProgress();

    const nextEl = el.syncModeLyrics.querySelector('.next-line');
    if (nextEl) {
      const c = el.syncModeLyrics;
      const cr = c.getBoundingClientRect(), nr = nextEl.getBoundingClientRect();
      animateLyricsScroll(c, c.scrollTop + (nr.top - cr.top) - c.clientHeight / 2 + nr.height / 2);
    }
  }

  function handleSyncLineClick(/** @type {number} */ idx) {
    if (!syncState.active || !el.nativeAudio) return;
    if (!isCurrentSong(syncState.song)) { showToast(Tm('The song changed. Save or restart the sync.'), 'info'); return; }

    const currentTime = el.nativeAudio.currentTime || 0;
    syncState.lines[idx].time = currentTime;

    let next = -1;
    for (let i = idx + 1; i < syncState.lines.length; i++) {
      if (syncState.lines[i].time === null) {
        next = i;
        break;
      }
    }
    syncState.currentIndex = next >= 0 ? next : syncState.lines.length;

    renderSyncLines();
  }

  function restartSync() {
    syncState.lines.forEach(l => l.time = null);
    syncState.currentIndex = 0;
    if (el.nativeAudio && isCurrentSong(syncState.song)) el.nativeAudio.currentTime = 0;
    renderSyncLines();
    showToast(Tm('Sync restarted'), 'info');
  }

  async function saveSyncAndExit() {
    if (!syncState.song) return;

    const lrcLines = syncState.lines.map(line => {
      if (line.time !== null) {
        const min = Math.floor(line.time / 60);
        const sec = (line.time % 60).toFixed(2);
        return `[${min}:${sec.padStart(5, '0')}]${line.text}`;
      }
      return line.text;
    });
    const lrcContent = lrcLines.join('\n');

    const { title, artist } = syncState.song;

    try {
      const res = await fetch(
        `http://127.0.0.1:${state.serverPort}/api/save-custom-lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
                              {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ lyrics: lrcContent })
                              }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Save failed');

      showToast(Tm('Synced lyrics saved'), 'info');
      closeSyncMode();
      if (isCurrentSong({ title, artist })) loadSyncedLyrics(title, artist, state.loadToken);
    } catch (e) {
      showToast(Tm('Failed to save synced lyrics: {0}', (e instanceof Error ? e.message : String(e))), 'error');
    }
  }

  function closeSyncMode() {
    syncState.active = false;
    if (el.syncModeOverlay) closeModal(el.syncModeOverlay);
  }

  if (el.btnSyncLyrics) el.btnSyncLyrics.addEventListener('click', openSyncMode);
  if (el.btnRestartSync) el.btnRestartSync.addEventListener('click', restartSync);
  if (el.btnSaveSync) el.btnSaveSync.addEventListener('click', saveSyncAndExit);
  if (el.btnCancelSync) el.btnCancelSync.addEventListener('click', closeSyncMode);

  if (el.syncModeOverlay) {
    el.syncModeOverlay.addEventListener('click', (/** @type {MouseEvent} */ e) => {
      if (e.target === el.syncModeOverlay) closeSyncMode();
    });
  }

  /** @type {UrielLyricsEditorPart} */
  const api = { syncState, handleSyncLineClick };
  Object.assign(out, api);
};
