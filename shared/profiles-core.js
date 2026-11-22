// @ts-check
// Profiles: several people on one device, each with their own playlists, favorites, history, Encore stats,
// queue, look, sound and lyrics settings, and their own Sync group. All of that lives in localStorage, so a
// profile is simply its own set of keys there: the first profile keeps the plain keys it always had (nothing to
// migrate), every other profile stores its keys as "uriel_p:<id>:<key>". Loaded before every other script, this
// file makes localStorage show only the open profile, so the rest of the app never has to know. The few keys in
// DEVICE belong to the device and are shared by every profile. Switching profiles reloads the page.
// No DOM: profiles.js draws Settings → Profiles and the switcher, test/profiles-core.test.js runs this in Node.
(function (root) {
  const LIST = 'uriel_profiles'; // [{ id, name, color, emoji, created }]
  const ACTIVE = 'uriel_profile_active';
  const PREFIX = 'uriel_p:';
  const FIRST = 'default'; // the profile with the plain keys

  // shared by every profile on this device. Hardware acceleration and the music and download folders aren't in
  // localStorage at all (main.js keeps them), and neither are the song cache, downloads and lyrics.
  const DEVICE = new Set([
    LIST, ACTIVE,
    // the window, the tray and the keyboard belong to the computer
    'uriel_tray_on_close', 'uriel_global_media_keys', 'uriel_win_global_media_keys', 'uriel_hide_titlebar',
    // what this device can handle
    'uriel_perf_mode', 'uriel_battery_saver', 'uriel_fps_cap', 'uriel_cache_limit_mb', 'uriel_sc_client_id', 'uriel_stream_timeout', 'uriel_audio_output_device',
    // asked, shown or done once per device
    'uriel_update_found', 'uriel_update_last', 'uriel_update_snooze', 'uriel_welcome_done', 'uriel_bg_asked',
    'uriel_scale_rebased_v2', 'uriel_debug_log',
    // the library has moved to IndexedDB on this device (library-store.js)
    'uriel_library_idb',
    // a copy of the open language's translations for a quick start (i18n.js); which language is per profile
    'uriel_i18n_snap',
  ]);
  // how a song sounds, worked out once per device; logins the in-app server keeps for every profile (bridge.ts)
  const DEVICE_PREFIXES = ['uriel_audio_analysis_', 'uriel_secret_'];
  /** @typedef {{ get: (k: string) => string | null, set: (k: string, v: string) => void, remove: (k: string) => void, keys: () => string[] }} RawStore */
  /** @typedef {{ id: string, name: string, color: string, emoji: string, created: number, [field: string]: any }} Profile */
  const isDevice = (/** @type {string} */ k) => DEVICE.has(k) || DEVICE_PREFIXES.some((p) => k.startsWith(p));

  const COLORS = ['#D0BCFF', '#A8C7FA', '#7FD8C0', '#C5E1A5', '#FDD663', '#FFB59A', '#F4A7C6', '#B8C4D0'];

  // ---------- keys ----------
  const nsOf = (/** @type {string} */ id) => (id === FIRST ? '' : `${PREFIX}${id}:`);
  // where profile `id` keeps `key`
  const rawKey = (/** @type {string} */ id, /** @type {string} */ key) => (isDevice(key) ? key : nsOf(id) + key);
  // the key profile `id` sees for a stored key, or null when it belongs to another profile
  /** @param {string} id @param {string} raw */
  function ownKey(id, raw) {
    if (raw.startsWith(PREFIX)) {
      const ns = nsOf(id);
      if (!ns || !raw.startsWith(ns)) return null;
      const key = raw.slice(ns.length);
      return isDevice(key) ? null : key;
    }
    return id === FIRST || isDevice(raw) ? raw : null;
  }
  // the stored keys that are profile `id`'s own (not the device's)
  const ownRawKeys = (/** @type {RawStore} */ store, /** @type {string} */ id) => store.keys().filter((r) => (id === FIRST ? !r.startsWith(PREFIX) && !isDevice(r) : r.startsWith(nsOf(id))));

  // localStorage as profile `id` sees it. `store` is the real storage: { get, set, remove, keys } (a Map in tests).
  /** @param {RawStore} store @param {string} id */
  function view(store, id) {
    const keys = () => { /** @type {string[]} */ const out = []; for (const r of store.keys()) { const k = ownKey(id, r); if (k !== null) out.push(k); } return out; };
    return {
      getItem: (/** @type {string} */ k) => store.get(rawKey(id, k)),
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => store.set(rawKey(id, k), v),
      removeItem: (/** @type {string} */ k) => store.remove(rawKey(id, k)),
      key: (/** @type {unknown} */ i) => { const ks = keys(); const n = Number(i) >>> 0; return n < ks.length ? ks[n] : null; },
      get length() { return keys().length; },
      keys,
      // this profile's own keys; the device's and the other profiles' stay
      clear: () => { for (const r of ownRawKeys(store, id)) store.remove(r); },
    };
  }

  // ---------- the profiles on this device ----------
  const parse = (/** @type {any} */ s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  const cleanName = (/** @type {unknown} */ s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 24);
  const cleanEmoji = (/** @type {unknown} */ s) => String(s == null ? '' : s).trim().slice(0, 16);
  const cleanColor = (/** @type {unknown} */ c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toUpperCase() : '');
  const firstProfile = () => ({ id: FIRST, name: 'Me', color: COLORS[0], emoji: '', created: 0 });
  const validId = (/** @type {unknown} */ id) => id === FIRST || /^[a-z0-9]{4,16}$/.test(String(id || ''));

  /** @param {RawStore} store @returns {Profile[]} */
  function list(store) {
    const saved = parse(store.get(LIST));
    /** @type {Profile[]} */
    const out = [];
    for (const p of Array.isArray(saved) ? saved : []) {
      if (!p || !validId(p.id) || out.some((q) => q.id === p.id)) continue;
      // anything else stored with a profile (an account it is signed in to, one day) is kept as it is
      out.push({ ...p, name: cleanName(p.name) || 'Profile', color: cleanColor(p.color) || COLORS[out.length % COLORS.length], emoji: cleanEmoji(p.emoji), created: Number(p.created) || 0 });
    }
    // nobody has opened Profiles yet: the plain keys are the one profile there is
    if (!out.length) out.push(firstProfile());
    // a profile whose things are stored but that isn't listed (the list was lost) comes back instead of staying hidden
    for (const r of store.keys()) {
      if (!r.startsWith(PREFIX)) continue;
      const id = r.slice(PREFIX.length, r.indexOf(':', PREFIX.length));
      if (validId(id) && id !== FIRST && !out.some((p) => p.id === id)) out.push({ id, name: `Profile ${out.length + 1}`, color: COLORS[out.length % COLORS.length], emoji: '', created: 0 });
    }
    return out;
  }
  const save = (/** @type {RawStore} */ store, /** @type {Profile[]} */ profiles) => store.set(LIST, JSON.stringify(profiles));

  // the profile to open: the one picked last, or the first one
  /** @param {RawStore} store */
  function activeId(store) {
    const id = store.get(ACTIVE);
    const profiles = list(store);
    return profiles.some((p) => p.id === id) ? /** @type {string} */ (id) : profiles[0].id;
  }

  const randomId = () => {
    const c = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function' ? crypto : null;
    const bytes = c ? [...c.getRandomValues(new Uint8Array(8))] : Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
    return bytes.map((b) => (b % 36).toString(36)).join('');
  };

  // a new, empty profile: default settings, nothing in it
  /** @param {RawStore} store @param {{ name?: unknown, color?: unknown, emoji?: unknown }} [opts] */
  function create(store, opts = {}) {
    const profiles = list(store);
    let id = randomId();
    while (id === FIRST || profiles.some((p) => p.id === id) || store.keys().some((r) => r.startsWith(nsOf(id)))) id = randomId();
    const used = new Set(profiles.map((p) => p.color));
    const p = {
      id,
      name: cleanName(opts.name) || `Profile ${profiles.length + 1}`,
      color: cleanColor(opts.color) || COLORS.find((c) => !used.has(c)) || COLORS[profiles.length % COLORS.length],
      emoji: cleanEmoji(opts.emoji),
      created: Date.now(),
    };
    save(store, [...profiles, p]);
    return p;
  }

  // name, color and emoji; the id never changes
  /** @param {RawStore} store @param {string} id @param {{ name?: unknown, color?: unknown, emoji?: unknown }} [patch] */
  function update(store, id, patch = {}) {
    const profiles = list(store);
    const p = profiles.find((q) => q.id === id);
    if (!p) return null;
    if ('name' in patch && cleanName(patch.name)) p.name = cleanName(patch.name);
    if ('color' in patch && cleanColor(patch.color)) p.color = cleanColor(patch.color);
    if ('emoji' in patch) p.emoji = cleanEmoji(patch.emoji);
    save(store, profiles);
    return p;
  }

  // deletes the profile and everything in it. The open profile can't be deleted (so one always stays).
  /** @param {RawStore} store @param {string} id @param {string} openId */
  function remove(store, id, openId) {
    const profiles = list(store);
    if (id === openId || !profiles.some((p) => p.id === id) || profiles.length < 2) return false;
    for (const r of ownRawKeys(store, id)) store.remove(r);
    save(store, profiles.filter((p) => p.id !== id));
    if (store.get(ACTIVE) === id) store.set(ACTIVE, openId);
    return true;
  }

  // the profile the next start opens
  /** @param {RawStore} store @param {string} id */
  function setActive(store, id) {
    const profiles = list(store);
    if (!profiles.some((p) => p.id === id)) return false;
    save(store, profiles);
    store.set(ACTIVE, id);
    return true;
  }

  // ---------- in the app ----------
  // Puts the open profile between the app and localStorage: Storage.prototype for getItem/setItem/removeItem/key/
  // clear/length, and window.localStorage itself for Object.keys(localStorage), localStorage.foo and `for in`.
  // Later patches of Storage.prototype (app.js for a full storage, sync.js to notice changes) wrap these, so they
  // see the keys as the app writes them.
  /** @param {any} win */
  function install(win) {
    if (win.UrielProfiles) return win.UrielProfiles;
    let ls;
    try { ls = win.localStorage; } catch (e) { return null; } // storage switched off: nothing to keep apart
    const P = win.Storage && win.Storage.prototype;
    const lengthOf = P && Object.getOwnPropertyDescriptor(P, 'length');
    if (!ls || !P || !lengthOf || !lengthOf.get) return null;
    const native = { getItem: P.getItem, setItem: P.setItem, removeItem: P.removeItem, key: P.key, clear: P.clear, length: lengthOf.get };
    const raw = {
      get: (/** @type {string} */ k) => native.getItem.call(ls, k),
      set: (/** @type {string} */ k, /** @type {string} */ v) => native.setItem.call(ls, k, v),
      remove: (/** @type {string} */ k) => native.removeItem.call(ls, k),
      keys: () => { const out = []; for (let i = 0, n = native.length.call(ls); i < n; i++) out.push(native.key.call(ls, i)); return out; },
    };
    // playlists, favorites and history live in IndexedDB (library-store.js, loaded just before this file)
    const lib = win.UrielLibraryStore;
    const store = (lib && lib.attach && lib.attach(raw)) || raw;
    // fixed for the life of the page: what is saved on the way out (the queue, Encore) still lands in this profile
    const id = activeId(store);
    const v = view(store, id);
    /** @type {any} */
    let proxy = null;
    const ours = (/** @type {unknown} */ s) => s === ls || (s != null && s === proxy);
    P.getItem = function getItem(/** @type {string} */ k) { return ours(this) ? v.getItem(String(k)) : native.getItem.apply(this, arguments); };
    P.setItem = function setItem(/** @type {string} */ k, /** @type {string} */ val) { return ours(this) ? v.setItem(String(k), String(val)) : native.setItem.apply(this, arguments); };
    P.removeItem = function removeItem(/** @type {string} */ k) { return ours(this) ? v.removeItem(String(k)) : native.removeItem.apply(this, arguments); };
    P.key = function key(/** @type {number} */ i) { return ours(this) ? v.key(i) : native.key.apply(this, arguments); };
    P.clear = function clear() { return ours(this) ? v.clear() : native.clear.apply(this, arguments); };
    Object.defineProperty(P, 'length', { configurable: true, enumerable: true, get() { return ours(this) ? v.length : native.length.call(this); } });

    try {
      const item = /** @type {(k: string | symbol) => k is string} */ ((k) => typeof k === 'string' && !(k in P));
      proxy = new Proxy(Object.create(P), {
        get: (t, k) => { if (!item(k)) return Reflect.get(P, k, proxy); const val = v.getItem(k); return val === null ? undefined : val; },
        set: (t, k, val) => { if (typeof k === 'string') v.setItem(k, String(val)); return true; },
        has: (t, k) => (item(k) ? v.getItem(k) !== null : k in P),
        deleteProperty: (t, k) => { if (typeof k === 'string') v.removeItem(k); return true; },
        ownKeys: () => v.keys(),
        getOwnPropertyDescriptor: (t, k) => {
          const val = item(k) ? v.getItem(k) : null;
          return val === null ? undefined : { value: val, writable: true, enumerable: true, configurable: true };
        },
        defineProperty: (t, k, d) => { if (typeof k === 'string' && 'value' in d) v.setItem(k, String(d.value)); return true; },
      });
      Object.defineProperty(win, 'localStorage', { configurable: true, enumerable: true, get: () => proxy });
      if (win.localStorage !== proxy) proxy = null;
    } catch (e) { proxy = null; } // getItem & co. above still keep the profiles apart

    const api = {
      id,
      current: () => list(store).find((p) => p.id === id) || firstProfile(),
      list: () => list(store),
      create: (/** @type {any} */ opts) => create(store, opts),
      update: (/** @type {string} */ pid, /** @type {any} */ patch) => update(store, pid, patch),
      remove: (/** @type {string} */ pid) => remove(store, pid, id),
      // opens with the next load; profiles.js stops the music and reloads
      open: (/** @type {string} */ pid) => setActive(store, pid),
      // one key of any profile, without opening it (song counts in Settings, the phone's song cache)
      peek: (/** @type {string} */ pid, /** @type {string} */ key) => store.get(rawKey(pid, key)),
      isDevice,
      COLORS,
    };
    win.UrielProfiles = api;
    return api;
  }

  const api = { PREFIX, FIRST, LIST, ACTIVE, DEVICE, COLORS, isDevice, rawKey, ownKey, view, list, activeId, create, update, remove, setActive, install };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else install(root);
})(typeof window !== 'undefined' ? window : globalThis);
