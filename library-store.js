// Playlists, favorites and history in IndexedDB instead of localStorage (docs/adr/0001, action item 1).
// localStorage holds ~5 MB for everything; a big library filled it and saving anything failed. These three lists
// now live in IndexedDB (no such cap) and every other key stays where it was.
//
// How: profiles-core.js routes every localStorage key through one raw store ({ get, set, remove, keys }). This
// file wraps that store, so profiles, Sync, backups and the rest of the app keep calling localStorage as before.
// IndexedDB is async and localStorage is not, so the lists are read into memory once at start-up (app.js waits
// for `ready`) and every change is written back in the background.
//  - First start: the lists move from localStorage into IndexedDB, then leave localStorage.
//  - A copy in localStorage always wins over IndexedDB at start-up: it is either data not moved yet or a change
//    saved there because the page was closing before IndexedDB had it (see `pagehide`).
//  - IndexedDB missing or broken before the move (some private windows): everything stays in localStorage.
//  - IndexedDB failing after the move: the lists are in there and nowhere else. Try again a few times, then go
//    'unavailable': changes stay in memory only, because anything saved to localStorage would win over the real
//    lists at the next start. app.js tells the user and sync.js stays off (it would read the gaps as deletions).
// No DOM: test/library-store.test.js runs this in Node with a fake database.
(function (root) {
  const LISTS = ['devsize_playlists', 'devsize_favorites', 'devsize_history'];
  // every profile's copy too ("uriel_p:<id>:devsize_playlists", profiles-core.js)
  const isLibraryKey = (k) => LISTS.some((l) => k === l || (k.startsWith('uriel_p:') && k.endsWith(':' + l)));
  // set once the lists have moved: from then on a slow IndexedDB is waited for, never skipped (skipping would
  // show empty lists, and the next change would overwrite the real ones)
  const MOVED = 'uriel_library_idb';
  const FIRST_OPEN_MS = 8000;
  const MOVED_OPEN_MS = 20000; // long enough for a slow disk; after this the app says so instead of a blank window
  const RETRY_MS = [300, 1200];

  // base: the real localStorage ({ get, set, remove, keys }); db: { loadAll() -> Map, put(k, v), del(k) }
  function createStore(base, db, { onError = () => {}, timeoutMs = FIRST_OPEN_MS, movedTimeoutMs = MOVED_OPEN_MS, retryMs = RETRY_MS } = {}) {
    const mem = new Map();
    const seq = new Map(); // a write's number per key, so an older write finishing late can't undo a newer one
    const pending = new Set(); // keys IndexedDB doesn't have yet
    let mode = 'starting'; // 'starting' | 'idb' | 'local' | 'unavailable'
    let closing = false;

    const keep = (k, v) => { try { base.set(k, v); return true; } catch (e) { onError(e, k); return false; } };
    function write(k) {
      const n = (seq.get(k) || 0) + 1;
      seq.set(k, n);
      pending.add(k);
      const v = mem.has(k) ? mem.get(k) : null;
      if (closing) { if (v == null) base.remove(k); else keep(k, v); }
      Promise.resolve(v == null ? db.del(k) : db.put(k, v)).then(() => {
        if (seq.get(k) !== n) return;
        pending.delete(k);
        // the copy kept while closing (or not moved yet) isn't needed now
        if (!closing) base.remove(k);
      }, (e) => {
        onError(e, k);
        if (seq.get(k) === n && v != null) keep(k, v);
      });
    }

    const store = {
      get: (k) => {
        if (!isLibraryKey(k)) return base.get(k);
        if (mode === 'idb') return mem.has(k) ? mem.get(k) : null;
        return mode === 'unavailable' && mem.has(k) ? mem.get(k) : base.get(k);
      },
      set: (k, v) => {
        if (mode === 'unavailable' && isLibraryKey(k)) { mem.set(k, String(v)); return; }
        if (mode !== 'idb' || !isLibraryKey(k)) return base.set(k, v);
        mem.set(k, String(v));
        write(k);
      },
      remove: (k) => {
        if (mode === 'unavailable' && isLibraryKey(k)) { mem.set(k, null); return; }
        if (mode !== 'idb' || !isLibraryKey(k)) return base.remove(k);
        mem.delete(k);
        base.remove(k);
        write(k);
      },
      keys: () => {
        const out = base.keys();
        if (mode === 'idb') for (const k of mem.keys()) if (!out.includes(k)) out.push(k);
        if (mode === 'unavailable') for (const [k, v] of mem) { const at = out.indexOf(k); if (v == null) { if (at >= 0) out.splice(at, 1); } else if (at < 0) out.push(k); }
        return out;
      },
    };

    // the page is going (closing, reloading for another profile): what IndexedDB hasn't confirmed goes to
    // localStorage too, which wins at the next start
    store.closing = (on = true) => {
      closing = on;
      if (on) for (const k of pending) if (mem.has(k)) keep(k, mem.get(k));
    };

    const loadWithin = (ms) => {
      let timer;
      return Promise.race([
        Promise.resolve().then(() => db.loadAll()),
        new Promise((_, no) => { timer = setTimeout(() => no(new Error('IndexedDB took too long')), ms); }),
      ]).finally(() => clearTimeout(timer));
    };

    async function start() {
      const moved = base.get(MOVED) === '1';
      let saved;
      if (moved) {
        // the lists are only in there: a slow database gets time and a broken one more tries
        for (let attempt = 0; !saved; attempt++) {
          try {
            saved = await loadWithin(movedTimeoutMs);
          } catch (e) {
            onError(e);
            if (attempt >= retryMs.length || /too long/.test(e && e.message)) { mode = 'unavailable'; return mode; }
            await new Promise((r) => setTimeout(r, retryMs[attempt]));
          }
        }
      } else {
        try {
          // before anything has moved, localStorage still has it all: don't hold the app up for a stuck database
          saved = await loadWithin(timeoutMs);
        } catch (e) {
          onError(e);
          mode = 'local';
          return mode;
        }
      }
      for (const [k, v] of saved) if (isLibraryKey(k) && typeof v === 'string') mem.set(k, v);
      mode = 'idb';
      // not moved yet, or saved while the page was closing: localStorage's copy is the newer one
      for (const k of base.keys()) {
        if (!isLibraryKey(k)) continue;
        const v = base.get(k);
        if (v == null) continue;
        mem.set(k, v);
        write(k);
      }
      if (!moved) keep(MOVED, '1');
      return mode;
    }
    store.ready = start();
    store.mode = () => mode;
    return store;
  }

  // IndexedDB: one table of key → text
  function idbBackend(indexedDB, name = 'mural-library') {
    let opening = null;
    const open = () => opening || (opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    }).catch((e) => { opening = null; throw e; })); // a retry opens it again rather than repeating this failure
    const tx = (mode, fn) => open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction('kv', mode);
      const out = fn(t.objectStore('kv'));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('IndexedDB write was cancelled'));
    }));
    return {
      loadAll: () => open().then((db) => new Promise((resolve, reject) => {
        const map = new Map();
        const req = db.transaction('kv', 'readonly').objectStore('kv').openCursor();
        req.onsuccess = () => { const c = req.result; if (!c) return resolve(map); map.set(String(c.key), c.value); c.continue(); };
        req.onerror = () => reject(req.error);
      })),
      put: (k, v) => tx('readwrite', (s) => s.put(v, k)),
      del: (k) => tx('readwrite', (s) => s.delete(k)),
    };
  }

  // for profiles-core.js: wrap the raw store it built, once
  function attach(base) {
    if (root.UrielLibraryStore && root.UrielLibraryStore.store) return root.UrielLibraryStore.store;
    let idb = null;
    try { idb = root.indexedDB || null; } catch (e) {}
    if (!idb) return null;
    const store = createStore(base, idbBackend(idb), { onError: (e, k) => { try { console.warn('library storage', k || '', e); } catch (_) {} } });
    root.UrielLibraryStore.store = store;
    root.UrielLibraryStore.ready = store.ready;
    if (root.addEventListener) {
      root.addEventListener('pagehide', () => store.closing(true));
      root.addEventListener('beforeunload', () => store.closing(true));
      root.addEventListener('pageshow', () => store.closing(false));
    }
    return store;
  }

  const api = { LISTS, MOVED, isLibraryKey, createStore, idbBackend, attach, ready: Promise.resolve('local'), store: null };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UrielLibraryStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
