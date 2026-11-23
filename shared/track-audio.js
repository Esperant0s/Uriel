// @ts-check
// Per-track speed / pitch / volume (issue #11) and speed & pitch presets. A song can keep its own speed, tape speed,
// pitch and volume gain ("For this track only" in Audio → Tempo); every other song follows the global values, and a
// song with its own settings keeps them when the global ones change. "Ignore per-track settings" plays everything
// with the global values without touching what is saved, so turning it off brings the songs' settings back.
// Saved per profile (localStorage, which profiles namespace). No DOM here: app.js wires it up,
// test/track-audio.test.js runs this.
(function () {
  const KEYS = ['speed', 'speedPitch', 'pitch', 'volume'];
  /** @type {Record<string, number>} */
  const DEFAULTS = { speed: 1.0, speedPitch: 1.0, pitch: 0, volume: 1.0 };
  /** @type {Record<string, [number, number]>} */
  const RANGE = { speed: [0.5, 2.0], speedPitch: [0.5, 2.0], pitch: [-12, 12], volume: [0, 2.0] };
  const round2 = (/** @type {number} */ v) => Math.round(v * 100) / 100;

  /** @param {string} key @param {unknown} v */
  function clampValue(key, v) {
    const n = Number(v);
    if (!Number.isFinite(n) || !RANGE[key]) return null;
    const [lo, hi] = RANGE[key];
    const c = Math.min(hi, Math.max(lo, n));
    return key === 'pitch' ? Math.round(c) : round2(c);
  }

  // the tempo values a saved entry (or anything shaped like one) holds, filled in from `base`
  // a saved entry is { speed, speedPitch, pitch, volume, updatedAt }, but anything with those fields will do
  /** @param {Record<string, unknown> | null | undefined} entry @param {Record<string, number>} [base] @returns {Record<string, number>} */
  function normalizeEntry(entry, base) {
    const b = base || DEFAULTS;
    /** @type {Record<string, number>} */
    const out = {};
    for (const k of KEYS) {
      const v = entry && entry[k] != null ? clampValue(k, entry[k]) : null;
      out[k] = v == null ? (b[k] != null ? b[k] : DEFAULTS[k]) : v;
    }
    return out;
  }

  // the settings to play with: the global settings, with the song's own tempo values over them unless ignored
  /** @template {object} G @param {G | null | undefined} globalSettings @param {Record<string, unknown> | null | undefined} entry @param {boolean} ignore */
  function effectiveSettings(globalSettings, entry, ignore) {
    const g = globalSettings || /** @type {G} */ ({});
    if (!entry || ignore) return { ...g };
    return { ...g, ...normalizeEntry(entry, normalizeEntry(/** @type {Record<string, unknown>} */ (g))) };
  }

  // the store with `values` saved for `key` (a new object; null values remove the song's entry)
  /** @param {Record<string, Record<string, number>> | null | undefined} store @param {string} key @param {Record<string, unknown> | null | undefined} values @param {number} [now] */
  function setEntry(store, key, values, now) {
    const next = { ...(store || {}) };
    if (!key) return next;
    if (values == null) { delete next[key]; return next; }
    next[key] = { ...normalizeEntry(values), updatedAt: now || Date.now() };
    return next;
  }

  // drop entries that are not objects; keep at most `max` (the most recently changed)
  /** @param {unknown} store @param {number} [max] */
  function cleanStore(store, max = 5000) {
    if (!store || typeof store !== 'object' || Array.isArray(store)) return {};
    const entries = /** @type {[string, Record<string, unknown>][]} */ (Object.entries(store).filter(([k, v]) => k && v && typeof v === 'object'));
    const updated = (/** @type {Record<string, unknown>} */ e) => Number(e.updatedAt) || 0;
    entries.sort((a, b) => updated(b[1]) - updated(a[1]));
    /** @type {Record<string, Record<string, number>>} */
    const out = {};
    for (const [k, v] of entries.slice(0, max)) out[k] = { ...normalizeEntry(v), updatedAt: updated(v) };
    return out;
  }

  // speed & pitch presets: only these values, the rest of the sound stays as it is
  const BUILTIN_PRESETS = [
    { id: 'tp_normal', name: 'Normal', builtin: true, values: { speed: 1.0, speedPitch: 1.0, pitch: 0 } },
    { id: 'tp_slowed', name: 'Slowed', builtin: true, values: { speed: 1.0, speedPitch: 0.8, pitch: 0 } },
    { id: 'tp_daycore', name: 'Daycore', builtin: true, values: { speed: 1.0, speedPitch: 0.85, pitch: -1 } },
    { id: 'tp_sped', name: 'Sped up', builtin: true, values: { speed: 1.25, speedPitch: 1.0, pitch: 0 } },
    { id: 'tp_nightcore', name: 'Nightcore', builtin: true, values: { speed: 1.0, speedPitch: 1.25, pitch: 0 } },
    { id: 'tp_practice', name: 'Practice 0.75x', builtin: true, values: { speed: 0.75, speedPitch: 1.0, pitch: 0 } }
  ];
  const PRESET_KEYS = ['speed', 'speedPitch', 'pitch'];

  /** @param {Record<string, unknown> | null | undefined} settings */
  function presetValues(settings) {
    const n = normalizeEntry(settings);
    return { speed: n.speed, speedPitch: n.speedPitch, pitch: n.pitch };
  }

  /** @param {unknown} name @param {Record<string, unknown> | null | undefined} settings @param {number} [now] */
  function makePreset(name, settings, now) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!clean) return null;
    const t = now || Date.now();
    return { id: 'tpu_' + t.toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: clean, values: presetValues(settings) };
  }

  /** @param {unknown} list @returns {{ id: string, name: string, builtin?: boolean, values: ReturnType<typeof presetValues> }[]} */
  function cleanPresets(list) {
    if (!Array.isArray(list)) return [];
    return list.filter((/** @type {{ id?: unknown, name?: unknown } | null} */ p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim())
      .map((/** @type {{ id: string, name: string, values?: Record<string, unknown> }} */ p) => ({ id: p.id, name: p.name.trim().slice(0, 40), values: presetValues(p.values) }));
  }

  // does `settings` match the preset's values?
  /** @param {{ values: Record<string, number> } | null | undefined} preset @param {Record<string, unknown> | null | undefined} settings */
  function presetMatches(preset, settings) {
    if (!preset || !settings) return false;
    const s = normalizeEntry(settings);
    return PRESET_KEYS.every(k => Math.abs(s[k] - preset.values[k]) < 0.001);
  }

  const api = { KEYS, DEFAULTS, BUILTIN_PRESETS, clampValue, normalizeEntry, effectiveSettings, setEntry, cleanStore,
    presetValues, makePreset, cleanPresets, presetMatches };
  if (typeof module !== 'undefined') module.exports = api;
  else window.UrielTrackAudio = api;
})();
