// @ts-check
// Song credits (Riff 0.6): who wrote, composed and produced the playing song, from Kugou (server.js /api/credits).
// They sit under the last line of the lyrics, or under the song's name when it has none. Part of app.js, which
// calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.credits = function ({ state, T }) {
  /** @type {Record<string, string>} */
  const LABELS = { lyrics: 'Lyrics by', composed: 'Composed by', produced: 'Produced by', arranged: 'Arranged by' };
  /** @type {Map<string, Record<string, string>>} */
  const known = new Map();
  let shownFor = '';
  const keyOf = (/** @type {UrielTrack | null} */ t) => (t ? `${t.artist || ''}:${t.title || ''}` : '');

  /** @param {Record<string, string>} credits */
  function block(credits) {
    const box = document.createElement('div');
    box.className = 'song-credits';
    const head = document.createElement('div');
    head.className = 'song-credits-title';
    head.textContent = T('Credits');
    box.appendChild(head);
    for (const k of ['lyrics', 'composed', 'produced', 'arranged']) {
      if (!credits[k]) continue;
      const row = document.createElement('div');
      row.className = 'song-credits-row';
      const label = document.createElement('span');
      label.textContent = T(LABELS[k]);
      const names = document.createElement('b');
      names.textContent = credits[k];
      row.append(label, names);
      box.appendChild(row);
    }
    return box;
  }

  // puts the credits in place (or takes them away) for the playing song
  function place() {
    document.querySelectorAll('.song-credits').forEach((n) => n.remove());
    const credits = known.get(keyOf(state.currentTrack));
    if (!credits || !Object.keys(credits).length) return;
    const lyrics = document.getElementById('lyrics-container');
    const panel = document.getElementById('right-panel');
    const hasLyrics = !!lyrics && !!lyrics.querySelector('.lyric-line') && !(panel && panel.classList.contains('lyrics-empty'));
    const where = hasLyrics ? lyrics : document.querySelector('#right-panel .right-panel-meta');
    if (where) where.appendChild(block(credits));
  }

  async function load() {
    const t = state.currentTrack;
    const key = keyOf(t);
    if (!t || t.platform === 'local' || key === shownFor) return;
    shownFor = key;
    if (!known.has(key)) {
      try {
        const q = `title=${encodeURIComponent(t.title || '')}&artist=${encodeURIComponent(t.artist || '')}&duration=${encodeURIComponent(t.duration || 0)}`;
        const d = await (await fetch(`http://127.0.0.1:${state.serverPort}/api/credits?${q}`)).json();
        known.set(key, (d && d.credits) || {});
        if (known.size > 100) known.delete(/** @type {string} */ (known.keys().next().value));
      } catch (e) { known.set(key, {}); }
    }
    if (keyOf(state.currentTrack) === key) place();
  }

  window.addEventListener('uriel:track', () => { place(); load(); });
  // the lyrics are drawn again for each song, a mode switch and a translation: the credits go back under them
  const lyrics = document.getElementById('lyrics-container');
  if (lyrics) {
    new MutationObserver(() => {
      // a song without lyrics clears the list: the credits then go under its name instead
      if (!document.querySelector('.song-credits') || (lyrics.querySelector('.lyric-line') && !lyrics.querySelector('.song-credits'))) place();
    }).observe(lyrics, { childList: true });
  }
};
