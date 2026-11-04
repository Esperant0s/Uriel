// storage-migrate.js: saved settings move from their Muriel/Mural names (muriel_x, mural_x) to uriel_x
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('../storage-migrate');

function store(init) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    map: m,
  };
}

test('old names move to uriel_, other profiles included; new values win; nothing else changes', () => {
  const s = store({
    muriel_theme_mode: 'dark', devsize_playlists: '[]', mural_device_music_asked: '1',
    'muriel_p:abc:muriel_font': 'Inter', muriel_volume: '0.5', uriel_volume: '0.8',
    muriel_app_icon: 'muriel', 'muriel_p:abc:muriel_home_layout': 'muriel',
  });
  assert.equal(migrate(s), 6);
  assert.deepEqual(Object.fromEntries(s.map), {
    devsize_playlists: '[]', uriel_volume: '0.8', uriel_theme_mode: 'dark', uriel_device_music_asked: '1',
    'uriel_p:abc:uriel_font': 'Inter', uriel_app_icon: 'uriel', 'uriel_p:abc:uriel_home_layout': 'uriel',
  });
  assert.equal(migrate(s), 0, 'nothing left to move');
});

test('storage full: the key still moves when the old copy makes room', () => {
  const s = store({ muriel_big: 'x'.repeat(10) });
  const set = s.setItem;
  s.setItem = (k, v) => { if (s.map.size >= 1) throw new Error('QuotaExceededError'); set(k, v); };
  migrate(s);
  assert.deepEqual(Object.fromEntries(s.map), { uriel_big: 'x'.repeat(10) });
});
