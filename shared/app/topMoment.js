// @ts-check
// Top moment (Riff 0.7): one spot per song, like the drop at 1:10, marked with a pin on the progress bar that
// jumps there. Set from the song's menu or a right-click on the progress bar. Kept in uriel_top_moments by song.
// Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielTopMomentPart} out */
window.UrielApp.topMoment = function ({ el, formatDuration, getTrackCanonicalId, isSameTrack, showActionMenu, showToast, state, Tf, Tm }, out) {
  const KEY = 'uriel_top_moments';
  /** @returns {Record<string, number>} */
  const all = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const momentOf = (/** @type {UrielTrack | null} */ t) => { const s = t ? all()[getTrackCanonicalId(t)] : undefined; return typeof s === 'number' ? s : null; };
  function setMoment(/** @type {UrielTrack} */ t, /** @type {number | null} */ sec) {
    const m = all();
    if (sec === null) delete m[getTrackCanonicalId(t)];
    else m[getTrackCanonicalId(t)] = Math.round(sec * 10) / 10;
    localStorage.setItem(KEY, JSON.stringify(m));
    placePin();
  }

  const wrapper = /** @type {HTMLElement | null} */ (document.querySelector('.scrubber-bar-wrapper'));
  const track = document.getElementById('scrubber-track');
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'top-moment-pin';
  pin.hidden = true;
  pin.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.5 2.3 4.5 6.2 4.5c2.3 0 3.7 1.3 4.6 2.6l1.2 1.6 1.2-1.6c.9-1.3 2.3-2.6 4.6-2.6 3.9 0 5.8 4 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>';
  if (wrapper) { wrapper.style.position = 'relative'; wrapper.appendChild(pin); }

  // where the pin goes: over the progress bar, at the moment's share of the song
  function placePin() {
    const sec = momentOf(state.currentTrack);
    const dur = el.nativeAudio && Number.isFinite(el.nativeAudio.duration) && el.nativeAudio.duration > 0 ? el.nativeAudio.duration : Number(state.currentTrack && state.currentTrack.duration) || 0;
    if (sec === null || !(dur > 0) || !track || sec > dur) { pin.hidden = true; return; }
    pin.hidden = false;
    pin.style.left = `${track.offsetLeft + (sec / dur) * track.offsetWidth}px`;
    pin.title = Tf('Top moment: {0}', formatDuration(sec));
    pin.setAttribute('aria-label', pin.title);
  }
  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    const sec = momentOf(state.currentTrack);
    if (sec !== null && el.nativeAudio) el.nativeAudio.currentTime = sec;
  });

  // the song's menu: set it at the playing spot, or take it away (only for the song that's playing)
  function topMomentMenuItem(/** @type {UrielTrack} */ t) {
    if (!state.currentTrack || !isSameTrack(state.currentTrack, t) || !el.nativeAudio) return null;
    if (momentOf(t) !== null) return { label: 'Remove top moment', run: () => { setMoment(t, null); showToast(Tm('Top moment removed'), 'info'); } };
    const at = el.nativeAudio.currentTime || 0;
    return { label: Tf('Set top moment here ({0})', formatDuration(at)), run: () => { setMoment(t, at); showToast(Tm('Top moment set at {0}', formatDuration(at)), 'success'); } };
  }
  if (track) {
    track.addEventListener('contextmenu', (e) => {
      const item = state.currentTrack && topMomentMenuItem(state.currentTrack);
      if (!item) return;
      e.preventDefault();
      showActionMenu(e.clientX, e.clientY, [item]);
    });
  }

  window.addEventListener('uriel:track', placePin);
  window.addEventListener('resize', placePin);
  if (el.nativeAudio) el.nativeAudio.addEventListener('loadedmetadata', placePin);

  /** @type {UrielTopMomentPart} */
  const api = { topMomentMenuItem };
  Object.assign(out, api);
};
