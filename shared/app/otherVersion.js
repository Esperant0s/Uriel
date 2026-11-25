// @ts-check
// "Find another version" (Riff 0.7's Reset audio source): when YouTube picked the wrong video for a song (a live
// cut, a cover, a sped-up edit), the song's menu looks for another one and plays that instead, from then on.
// The song itself keeps its id, so favorites and playlists still know it; only where its sound comes from
// changes (uriel_source_overrides, read by playback.js). Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielOtherVersionPart} out */
window.UrielApp.otherVersion = function ({ getTrackCanonicalId, playTrack, showToast, state, Tm }, out) {
  const KEY = 'uriel_source_overrides';
  const WRONG = 'uriel_wrong_sources';
  /** @returns {Record<string, { id: string, url: string, platform?: string }>} */
  const overrides = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  /** @returns {string[]} */
  const wrongOnes = () => { try { return JSON.parse(localStorage.getItem(WRONG) || '[]') || []; } catch (e) { return []; } };

  // where this song's sound comes from instead of its own id, if a better version was picked
  function sourceOverride(/** @type {UrielTrack | null} */ track) {
    return track ? overrides()[getTrackCanonicalId(track)] || null : null;
  }

  async function findAnotherVersion(/** @type {UrielTrack} */ track) {
    const now = sourceOverride(track);
    const wrong = wrongOnes();
    const playing = now ? now.id : String(track.id || '');
    if (playing && !wrong.includes(playing)) wrong.push(playing);
    localStorage.setItem(WRONG, JSON.stringify(wrong.slice(-300)));
    // the wrong one's copy in the cache would otherwise play again
    fetch(`http://127.0.0.1:${state.serverPort}/api/offline-delete?id=${encodeURIComponent(playing)}`, { method: 'POST' }).catch(() => {});
    showToast(Tm('Looking for another version…'), 'info');

    const q = `${track.artist ? track.artist + ' ' : ''}${track.title || ''}`.trim();
    const want = Number(track.duration) || 0;
    /** @type {UrielTrack | null} */
    let pick = null;
    for (const platform of ['ytmusic', 'youtube']) {
      let found = [];
      try { found = (await (await fetch(`http://127.0.0.1:${state.serverPort}/api/search?q=${encodeURIComponent(q)}&platform=${platform}&limit=10`)).json()).tracks || []; } catch (e) {}
      const fresh = found.filter((/** @type {UrielTrack} */ t) => t && t.id && !wrong.includes(String(t.id)));
      // about as long as the song is, when its length is known: a live cut or an extended mix is the usual mistake
      pick = fresh.find((/** @type {UrielTrack} */ t) => !want || !t.duration || Math.abs(Number(t.duration) - want) <= 15) || fresh[0] || null;
      if (pick) break;
    }
    if (!pick) { showToast(Tm('No other version found'), 'error'); return; }
    const all = overrides();
    all[getTrackCanonicalId(track)] = { id: String(pick.id), url: pick.url || '', platform: pick.platform };
    localStorage.setItem(KEY, JSON.stringify(all));
    showToast(Tm('Playing another version'), 'success');
    if (state.currentTrack && getTrackCanonicalId(state.currentTrack) === getTrackCanonicalId(track)) playTrack(state.currentTrack);
  }

  function otherVersionMenuItem(/** @type {UrielTrack} */ track) {
    if (!track || track.platform === 'local' || track.platform === 'soundcloud') return null;
    return { label: 'Find another version', run: () => { findAnotherVersion(track); } };
  }

  /** @type {UrielOtherVersionPart} */
  const api = { sourceOverride, otherVersionMenuItem };
  Object.assign(out, api);
};
