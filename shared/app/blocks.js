// @ts-check
// Blocked artists and songs (from Riff 43.1; matching in library-pages.js). Skipped when the queue moves on (a
// blocked song still plays when tapped), kept out of My Wave, the mixes and For you. Per profile, and the same
// on linked devices (sync.js). Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielBlocksPart} out */
window.UrielApp.blocks = function ({ I18N, Lib, showToast, T, Tm, updateArtistBlockButton }, out) {
  const BLOCKED_ARTISTS_KEY = 'uriel_blocked_artists';
  const BLOCKED_SONGS_KEY = 'uriel_blocked_tracks';
  // parsed again only when the stored text changed (a linked device or another profile wrote it)
  /** @type {UrielBlocks | null} */
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

  /** @type {UrielBlocksPart} */
  const api = { getBlocks, isBlocked, toggleBlockArtist, toggleBlockSong, renderBlockedSettings };
  Object.assign(out, api);
};
