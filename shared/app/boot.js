// @ts-check
// What app.js sets up before the page is ready: the server's key on the app's own requests, a full storage that
// doesn't break the app, page errors sent to the app's log (at most 20 a minute), the opening star, and the screen
// for a library that can't be opened. A plain script loaded just before app.js; libraryUnavailableScreen stays a
// global for it.

(() => {
  try {
    if (typeof window === 'undefined' || window.__riffFetchPatched) return;
    const api = window.electronAPI;
    const token = api && api.serverToken;
    if (!token) return;
    const origFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!origFetch) return;
    window.__riffFetchPatched = true;
    window.fetch = function (/** @type {any} */ input, init) {
      try {
        const raw = typeof input === 'string' ? input : (input && input.url) || '';
        if (raw.startsWith('http://127.0.0.1:') && new URL(raw).pathname.startsWith('/api/')) {
          const opts = Object.assign({}, init || {});
          const headers = new Headers(opts.headers || (input && input.headers) || undefined);
          headers.set('X-Uriel-Token', token);
          opts.headers = headers;
          return origFetch(input, opts);
        }
      } catch (e) {}
      return origFetch(input, init);
    };
  } catch (e) {}
})();

// localStorage (~5 MB) holds favorites, playlists, history, the queue and Encore. When it was full, every
// setItem threw: a song tap failed before the stream was even requested and new favorites vanished on restart.
// Free what can be rebuilt (the phone debug log, old Encore days) and retry; if it still doesn't fit, report
// it once a minute instead of throwing into whatever the app was doing.
(() => {
  try {
    const orig = Storage.prototype.setItem;
    let reportedAt = 0;
    Storage.prototype.setItem = function setItem(key, value) {
      try { return orig.call(this, key, value); } catch (e) {
        if (!e || (e.name !== 'QuotaExceededError' && e.code !== 22 && e.code !== 1014)) throw e;
        try { if (key !== 'uriel_debug_log') this.removeItem('uriel_debug_log'); } catch (_) {}
        try { if (key !== 'uriel_i18n_snap') this.removeItem('uriel_i18n_snap'); } catch (_) {}
        try { if (window.UrielEncore && window.UrielEncore.compact) window.UrielEncore.compact(90); } catch (_) {}
        try { return orig.call(this, key, value); } catch (e2) {
          if (Date.now() - reportedAt > 60000) { reportedAt = Date.now(); window.dispatchEvent(new CustomEvent('uriel:storage-full', { detail: key })); }
        }
      }
    };
  } catch (e) {}
})();

(() => {
  let lastErrLogReset = Date.now();
  let errLogCount = 0;
  function reportError(level, message, stack) {
    if (!window.electronAPI || typeof window.electronAPI.logError !== 'function') return;
    const now = Date.now();
    if (now - lastErrLogReset > 60000) {
      lastErrLogReset = now;
      errLogCount = 0;
    }
    if (errLogCount < 20) {
      errLogCount++;
      window.electronAPI.logError(level, message, stack);
    }
  }
  window.__riffLogError = reportError;
  window.addEventListener('error', (e) => {
    reportError('ERROR', e.message || String(e), e.error ? e.error.stack : null);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const msg = (reason && reason.message) ? reason.message : String(reason);
    const stack = (reason && reason.stack) ? reason.stack : null;
    reportError('ERROR', msg, stack);
  });
})();

// Riff 43 splash: Uriel's star (styles.css animates it) stays up until start-up is done and the page runs smoothly,
// so the app appears ready instead of stuttering through its first second (computers only; phones show their own
// launch screen). styles.css also fades it out on its own after 8 s, so a startup error can't leave it up.
(function urielSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const perf = /^(1|true)$/.test(localStorage.getItem('uriel_perf_mode') || '');
  if (document.documentElement.classList.contains('is-mobile') || perf) { splash.remove(); return; }
  const MIN_MS = 1100; // the bloom (styles.css) and a moment of the star at rest
  const MAX_MS = 7000;
  const SMOOTH_MS = 450; // this long without a frame over 50 ms after start-up
  let ready = false;
  const finish = () => {
    if (!splash.isConnected || splash.classList.contains('hide')) return;
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 480);
  };
  window.addEventListener('uriel:ready', () => { ready = true; }, { once: true });
  // a hidden window gets no frames: give up on time instead
  setTimeout(finish, Math.max(0, MAX_MS - performance.now()));
  let last = 0, smooth = 0;
  const tick = (now) => {
    if (!splash.isConnected) return;
    if (last) smooth = now - last > 50 ? 0 : smooth + (now - last);
    last = now;
    if ((ready && smooth >= SMOOTH_MS && now >= MIN_MS) || now >= MAX_MS) return finish();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

// The saved lists couldn't be read (library-store.js). They are safe as long as nothing replaces them, so say so
// and let the user try again; "Continue" runs this session on an empty library that isn't saved.
function libraryUnavailableScreen() {
  const L = window.UrielLibraryStore;
  if (!L || !L.store || L.store.mode() !== 'unavailable') return Promise.resolve();
  const T = (s) => (window.UrielI18n && window.UrielI18n.T ? window.UrielI18n.T(s) : s);
  document.getElementById('splash')?.remove();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'library-unavailable';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    const h = document.createElement('h2');
    h.textContent = T("Your library couldn't be opened");
    const p = document.createElement('p');
    p.textContent = T("Your playlists, favorites and history haven't been changed. Try again, or restart your computer or phone if this keeps happening. If you continue, your library will look empty and nothing you add will be saved.");
    const retry = document.createElement('button');
    retry.textContent = T('Try again');
    retry.addEventListener('click', () => location.reload());
    const go = document.createElement('button');
    go.textContent = T('Continue for now');
    go.addEventListener('click', () => { box.remove(); resolve(); });
    box.append(h, p, retry, go);
    document.body.appendChild(box);
    retry.focus();
  });
}
