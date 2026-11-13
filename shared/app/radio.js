// @ts-check
// Song radio (#28): songs like one song or a few picked together, a queue that grows as it plays; and sharing the
// song that's playing. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
window.UrielApp.radio = function ({ Lib, state, getBlocks, isBlocked, Tm, showToast, isSameTrack, shuffleBag, updateQueueBadge, playTrack, el, I18N, sharePlaylist }, out) {
  Object.assign(out, {
    songRadioEnabled, startSongRadio,
  });

  // ---- song radio (#28): a mix of songs like one song, or a few picked together; the queue grows as it plays ----
  // Settings > Tracks > Song radio shows or hides its buttons (on unless turned off).
  const songRadio = { current: null, nextId: 1 };
  function songRadioEnabled() {
    try { return localStorage.getItem('uriel_song_radio') !== '0'; } catch (e) { return true; }
  }
  function radioSeedOf(t) {
    return { id: t.id || '', title: t.title || '', artist: t.artist || '', platform: t.platform || 'youtube' };
  }
  function radioTrackKey(t) {
    return `${Lib.nameKey(t && t.artist)}::${Lib.nameKey(t && t.title)}`;
  }
  // the radio is on while its songs are still in the queue (playing something else from a list replaces the queue)
  function activeSongRadio() {
    const r = songRadio.current;
    return r && state.queue.some((t) => t && t._radio === r.id) ? r : null;
  }
  async function fetchSongRadio(r, limit) {
    const blocks = getBlocks();
    const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/radio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seeds: r.seeds.map(radioSeedOf),
        limit,
        exclude: { ids: [...r.ids], keys: [...r.keys] },
        blocks: { artists: blocks.artists, songs: blocks.songs },
      }),
    });
    const data = await res.json();
    const tracks = data && data.success && Array.isArray(data.tracks) ? data.tracks : [];
    // the server already leaves these out; this keeps a repeat out even if it found one under another id
    const fresh = tracks.filter((t) => t && t.title && !r.ids.has(String(t.id || '')) && !r.keys.has(radioTrackKey(t)) && !isBlocked(t));
    fresh.forEach((t) => { if (t.id) r.ids.add(String(t.id)); r.keys.add(radioTrackKey(t)); t._radio = r.id; });
    return fresh;
  }
  async function startSongRadio(seeds) {
    const list = (seeds || []).filter((t) => t && t.title).slice(0, 5);
    if (!list.length) return;
    const r = {
      id: songRadio.nextId++,
      seeds: list,
      label: list.length === 1 ? Tm('Radio · {0}', list[0].title) : Tm('Radio · {0} and {1} more', list[0].title, list.length - 1),
      ids: new Set(), keys: new Set(), loading: true, exhausted: false,
    };
    list.forEach((t) => { if (t.id) r.ids.add(String(t.id)); r.keys.add(radioTrackKey(t)); });
    songRadio.current = r;
    showToast(list.length === 1 ? Tm('Starting radio from "{0}"…', list[0].title) : Tm('Starting radio from {0} songs…', list.length), 'info');
    let tracks = [];
    try { tracks = await fetchSongRadio(r, 25); } catch (e) { console.warn('[radio]', e && e.message); }
    r.loading = false;
    if (songRadio.current !== r) return; // another radio was started meanwhile
    if (!tracks.length) {
      songRadio.current = null;
      showToast(navigator.onLine === false ? Tm('Radio needs the internet') : Tm('Couldn\'t find songs for a radio. Try another song'), 'error');
      return;
    }
    state.myWaveActive = false;
    if (list.length === 1) {
      // the song it was started from first; the same track when it is the one playing, so it doesn't restart
      const seed = state.currentTrack && isSameTrack(state.currentTrack, list[0]) ? state.currentTrack : list[0];
      seed._radio = r.id;
      if (seed === state.currentTrack) {
        state.queue = [seed, ...tracks];
        state.queueIndex = 0;
        state.queueHistory = [0];
        shuffleBag.next = []; shuffleBag.queue = state.queue;
        updateQueueBadge();
      } else {
        playTrack(seed, [seed, ...tracks], 0);
      }
    } else {
      playTrack(tracks[0], tracks, 0);
    }
    renderSongRadioLabel();
  }
  async function extendSongRadio() {
    const r = activeSongRadio();
    if (!r || r.loading || r.exhausted) return;
    if (state.queueIndex < state.queue.length - 5) return;
    r.loading = true;
    let more = [];
    try { more = await fetchSongRadio(r, 20); } catch (e) {}
    r.loading = false;
    if (activeSongRadio() !== r) return;
    if (!more.length) { r.exhausted = true; return; }
    state.queue.push(...more);
    updateQueueBadge();
  }
  // "Radio · <song>" above the queue while a radio plays
  function renderSongRadioLabel() {
    const list = el.queueTracksList;
    if (!list || !list.parentNode) return;
    let label = document.getElementById('queue-radio-label');
    const r = activeSongRadio();
    if (!r) { if (label) label.hidden = true; return; }
    if (!label) {
      label = document.createElement('div');
      label.id = 'queue-radio-label';
      label.className = 'queue-radio-label';
      label.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg><span class="queue-radio-text"></span>';
      list.parentNode.insertBefore(label, list);
    }
    label.hidden = false;
    I18N.text(label.querySelector('.queue-radio-text'), r.label);
  }
  window.addEventListener('uriel:queue', () => {
    renderSongRadioLabel();
    if (activeSongRadio()) extendSongRadio();
  });
  (function setupSongRadio() {
    const toggle = document.getElementById('toggle-song-radio');
    const apply = () => {
      const on = songRadioEnabled();
      document.body.classList.toggle('no-song-radio', !on);
      if (toggle) toggle.classList.toggle('active', on);
    };
    if (toggle) {
      toggle.addEventListener('click', () => {
        try { localStorage.setItem('uriel_song_radio', songRadioEnabled() ? '0' : '1'); } catch (e) {}
        apply();
      });
    }
    apply();
    const btn = document.getElementById('btn-playbar-radio');
    if (btn) {
      btn.addEventListener('click', () => {
        if (!state.currentTrack) { showToast(Tm('No track currently playing'), 'info'); return; }
        startSongRadio([state.currentTrack]);
      });
    }
  })();

  // ---- share the playing song: a one-song Uriel link, the same kind playlists use ----
  (function setupPlaybarShare() {
    const btn = document.getElementById('btn-playbar-share');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const t = state.currentTrack;
      if (!t) { showToast('Nothing is playing', 'info'); return; }
      if (t.platform === 'local') { showToast("Songs from your own files can't be shared", 'info'); return; }
      sharePlaylist({ name: [t.title, t.artist].filter(Boolean).join(' · ') || 'A song', tracks: [t] });
    });
  })();

};
