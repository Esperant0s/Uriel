// @ts-check
// "Available offline": the small arrow before a song's artist, like Spotify's. A song plays without internet
// when it's a local file, in the Downloads folder, or in the offline cache (songs kept from playing them). Local
// songs are marked at once; for the others server.js is asked in one batch per drawn list, and the answer is
// remembered until something changes (a download, a cleared cache). Part of app.js, which calls this once as
// it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielOfflinePart} out */
window.UrielApp.offline = function ({ capMap, el, getTrackCanonicalId, state }, out) {
  const OFFLINE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8"/><path d="M8 3.6v6.2M5.2 7.4 8 10.2l2.8-2.8M5 12h6" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const offlineKnown = new Map(); // offlineKey -> true / false
  const offlineSeen = new Map(); // offlineKey -> the track, to ask again when the device's songs change
  /** @type {number | null} */
  let offlineLocalVersion = null;
  /** @type {Map<string, UrielTrack>} */
  let offlinePending = new Map();
  let offlineTimer = 0;
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

  /** @type {UrielOfflinePart} */
  const api = { OFFLINE_ICON, offlineKey, offlineState, checkOffline, offlineChanged };
  Object.assign(out, api);
};
