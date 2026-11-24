// @ts-check
// The command palette (Ctrl+K): jump to a view, a setting or a song in the library, typed or picked with the
// arrow keys. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.palette = function ({ T, Tf, closeModal, el, escapeHtml, getTrackCanonicalId, matchesTrackQuery, openAudioTab, openModal, openPlaylistDetail, performSearch, playTrack, state, switchView, updateLocalBadge }) {
  function paletteActions() {
    return [
      { label: 'Open favorites', hint: 'View', run: () => switchView('favorites') },
      { label: 'Open local library', hint: 'View', run: () => switchView('local') },
      { label: 'Open queue', hint: 'View', run: () => switchView('queue') },
      { label: 'Open history', hint: 'View', run: () => switchView('history') },
      { label: 'Uriel Encore', hint: 'Your stats', run: () => window.UrielEncore && window.UrielEncore.open('month') },
      { label: 'Open discover', hint: 'View', run: () => switchView('discover') },
      { label: 'Open settings', hint: 'View', run: () => switchView('settings') },
      { label: 'Audio settings', hint: 'Audio', run: () => openAudioTab('tempo') },
      { label: 'Sleep timer', hint: 'Audio', run: () => openAudioTab('sleep') }
    ];
  }

  function buildCommandPaletteRows(/** @type {string} */ query) {
    const q = normalizeSearch(query);
    const rows = [];
    // actions are found by their name in the UI language or in English
    const actions = paletteActions().filter(a => !q || normalizeSearch(a.label).includes(q) || normalizeSearch(T(a.label)).includes(q));
    for (const action of actions) rows.push({ group: 'Actions', label: T(action.label), hint: T(action.hint), run: action.run });
    if (state.playlists.length) {
      const playlists = state.playlists
        .filter((/** @type {UrielPlaylist} */ p) => p && typeof p.name === 'string' && (!q || normalizeSearch(p.name).includes(q)))
        .slice(0, q ? 5 : 3);
      for (const pl of playlists) {
        rows.push({ group: 'Playlists', label: pl.name, hint: Tf('{0} songs', (pl.tracks || []).length), run: () => openPlaylistDetail(pl.id) });
      }
    }
    const seen = new Set();
    const playlistTracks = [];
    for (const pl of state.playlists) {
      if (pl && Array.isArray(pl.tracks)) playlistTracks.push(...pl.tracks);
    }
    const sources = [
      { group: 'Favorites', tracks: state.favorites },
      { group: 'In playlists', tracks: playlistTracks },
      { group: 'Queue', tracks: state.queue },
      { group: 'History', tracks: state.history },
      { group: 'Library', tracks: state.localTracks }
    ];
    for (const source of sources) {
      if (!Array.isArray(source.tracks)) continue;
      for (const track of source.tracks) {
        if (!track) continue;
        if (q && !matchesTrackQuery(track, q)) continue;
        const id = getTrackCanonicalId(track) || track.id;
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        rows.push({ group: source.group, label: track.title || 'Untitled', hint: track.artist || '', run: () => playTrack(track) });
        if (rows.length >= 24) break;
      }
      if (rows.length >= 24) break;
    }
    const trimmed = query.trim();
    if (trimmed) {
      rows.push({
        group: 'Online',
        label: Tf('Search for "{0}"', trimmed),
        hint: T('Discover'),
        run: () => {
          if (el.searchInput) el.searchInput.value = trimmed;
          performSearch(trimmed);
        }
      });
    }
    return rows;
  }

  function setPaletteIndex(/** @type {number} */ index) {
    const rows = state.paletteRows || [];
    if (!rows.length) return;
    state.paletteIndex = Math.max(0, Math.min(rows.length - 1, index));
    const buttons = /** @type {NodeListOf<HTMLElement>} */ (el.commandPaletteResults.querySelectorAll('.command-palette-row'));
    buttons.forEach((btn, i) => btn.classList.toggle('active', i === state.paletteIndex));
    const active = buttons[state.paletteIndex];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function runPaletteRow(/** @type {number} */ index) {
    const rows = state.paletteRows || [];
    const row = rows[index];
    if (!row) return;
    closeModal(el.commandPalette);
    if (typeof row.run === 'function') row.run();
  }

  function renderCommandPalette(/** @type {string} */ query) {
    if (!el.commandPaletteResults) return;
    const rows = buildCommandPaletteRows(query);
    state.paletteRows = rows;
    state.paletteIndex = 0;
    if (!rows.length) {
      el.commandPaletteResults.innerHTML = '<div class="command-palette-empty" data-i18n>No results</div>';
      return;
    }
    let html = '';
    let group = '';
    rows.forEach((row, i) => {
      const delay = Math.min(i, 10);
      if (row.group !== group) {
        group = row.group;
        html += `<div class="command-palette-group" style="--row-i:${delay}">${escapeHtml(T(group))}</div>`;
      }
      html += `<button type="button" class="command-palette-row${i === 0 ? ' active' : ''}" data-palette-index="${i}" style="--row-i:${delay}">
        <span class="command-palette-label">${escapeHtml(row.label)}</span>
        <span class="command-palette-hint">${escapeHtml(row.hint || '')}</span>
      </button>`;
    });
    el.commandPaletteResults.innerHTML = html;
    /** @type {NodeListOf<HTMLElement>} */ (el.commandPaletteResults.querySelectorAll('[data-palette-index]')).forEach((btn) => {
      btn.addEventListener('click', () => runPaletteRow(Number(btn.dataset.paletteIndex)));
      btn.addEventListener('mousemove', () => setPaletteIndex(Number(btn.dataset.paletteIndex)));
    });
  }

  async function loadPaletteLibrary() {
    if (Array.isArray(state.localTracks) && state.localTracks.length) return;
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/library`);
      const tracks = await res.json();
      if (!Array.isArray(tracks)) return;
      state.localTracks = tracks;
      updateLocalBadge();
    } catch (e) {}
  }

  function openCommandPalette() {
    if (!el.commandPalette) return;
    el.commandPaletteInput.value = '';
    if (el.commandPaletteResults) el.commandPaletteResults.classList.add('entering');
    renderCommandPalette('');
    openModal(el.commandPalette);
    setTimeout(() => el.commandPaletteInput.focus(), 30);
    setTimeout(() => {
      if (el.commandPaletteResults) el.commandPaletteResults.classList.remove('entering');
    }, 420);
    loadPaletteLibrary().then(() => {
      if (el.commandPalette.classList.contains('visible')) renderCommandPalette(el.commandPaletteInput.value);
    });
  }

  if (el.commandPaletteInput) {
    el.commandPaletteInput.addEventListener('input', () => renderCommandPalette(el.commandPaletteInput.value));
    el.commandPaletteInput.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPaletteIndex((state.paletteIndex || 0) + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPaletteIndex((state.paletteIndex || 0) - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runPaletteRow(state.paletteIndex || 0);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeModal(el.commandPalette);
      }
    });
  }

  if (el.commandPalette) {
    el.commandPalette.addEventListener('mousedown', (/** @type {MouseEvent} */ e) => {
      if (e.target === el.commandPalette) closeModal(el.commandPalette);
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyK') {
      e.preventDefault();
      if (el.commandPalette && el.commandPalette.classList.contains('visible')) closeModal(el.commandPalette);
      else openCommandPalette();
    }
  }, true);
};
