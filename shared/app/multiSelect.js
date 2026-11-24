// @ts-check
// Selecting several songs at once in favourites or a playlist, and the bar that acts on them. Part of app.js,
// which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielMultiSelectPart} out */
window.UrielApp.multiSelect = function ({ el, getTrackCanonicalId, matchesTrackQuery, openPlaylistDetail, renderFavoritesView, state }, out) {
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

  /** @type {UrielMultiSelectPart} */
  const api = { multiSel, updateMultiSelectBar, rerenderMultiSelectView, exitMultiSelect, startMultiSelect, toggleTrackSelection, multiSelectSourceTracks };
  Object.assign(out, api);
};
