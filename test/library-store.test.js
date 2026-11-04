'use strict';

// library-store.js: playlists, favorites and history move from localStorage into IndexedDB (a fake one here)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../library-store.js');
const P = require('../profiles-core.js');

// the real localStorage, as profiles-core.js reaches it
function local(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, String(v)); }, remove: (k) => { m.delete(k); }, keys: () => [...m.keys()] };
}
// IndexedDB: answers after a tick, like the real one; `fail` makes it throw, `hang` never answers
function idb(init = {}, { fail = false, hang = false } = {}) {
  const m = new Map(Object.entries(init));
  const later = (fn) => (hang ? new Promise(() => {}) : new Promise((resolve, reject) => setImmediate(() => { if (fail) reject(new Error('broken')); else resolve(fn()); })));
  return { m, loadAll: () => later(() => new Map(m)), put: (k, v) => later(() => { m.set(k, v); }), del: (k) => later(() => { m.delete(k); }) };
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const PL = JSON.stringify([{ id: 'pl_1', name: 'Road trip', tracks: [] }]);

test('first start: the lists move into IndexedDB and leave localStorage; settings stay', async () => {
  const ls = local({ devsize_playlists: PL, devsize_favorites: '[]', uriel_theme_mode: 'dark' });
  const db = idb();
  const s = L.createStore(ls, db);
  assert.equal(await s.ready, 'idb');
  await settle();
  assert.equal(db.m.get('devsize_playlists'), PL);
  assert.equal(ls.m.has('devsize_playlists'), false, 'out of localStorage, so it stops counting towards the 5 MB');
  assert.equal(ls.get('uriel_theme_mode'), 'dark');
  assert.equal(ls.get(L.MOVED), '1');
  assert.equal(s.get('devsize_playlists'), PL);
  assert.ok(s.keys().includes('devsize_playlists'), 'backups and profiles still see the key');
});

test('after the move, changes go to IndexedDB only, and come back at the next start', async () => {
  const ls = local({ [L.MOVED]: '1' });
  const db = idb({ devsize_favorites: '[]' });
  const s = L.createStore(ls, db);
  await s.ready;
  const big = JSON.stringify(Array.from({ length: 20000 }, (_, i) => ({ id: `v${i}`, title: `Song ${i}` })));
  s.set('devsize_favorites', big);
  assert.equal(s.get('devsize_favorites'), big, 'readable at once, without waiting for the database');
  await settle();
  assert.equal(ls.m.has('devsize_favorites'), false);
  const again = L.createStore(ls, db);
  await again.ready;
  assert.equal(again.get('devsize_favorites'), big);
  s.remove('devsize_favorites');
  await settle();
  assert.equal(db.m.has('devsize_favorites'), false);
});

test('closing the page: what IndexedDB has not confirmed is kept in localStorage, and wins next time', async () => {
  const ls = local({ [L.MOVED]: '1' });
  const hung = idb({ devsize_history: '[]' });
  const s = L.createStore(ls, { loadAll: hung.loadAll, put: () => new Promise(() => {}), del: () => new Promise(() => {}) });
  await s.ready;
  s.set('devsize_history', '[{"id":"last"}]');
  s.closing(true);
  assert.equal(ls.get('devsize_history'), '[{"id":"last"}]');
  const next = L.createStore(ls, hung);
  await next.ready;
  assert.equal(next.get('devsize_history'), '[{"id":"last"}]');
  await settle();
  assert.equal(hung.m.get('devsize_history'), '[{"id":"last"}]', 'moved into the database');
  assert.equal(ls.m.has('devsize_history'), false);
});

test('no working IndexedDB: everything stays in localStorage, as before', async () => {
  const ls = local({ devsize_playlists: PL });
  const s = L.createStore(ls, idb({}, { fail: true }));
  assert.equal(await s.ready, 'local');
  s.set('devsize_favorites', '[1]');
  assert.equal(ls.get('devsize_favorites'), '[1]');
  assert.equal(s.get('devsize_playlists'), PL);
});

test('a stuck database is skipped before the move (localStorage has it all), waited for after it', async () => {
  const before = L.createStore(local({ devsize_playlists: PL }), idb({}, { hang: true }), { timeoutMs: 20 });
  assert.equal(await before.ready, 'local');
  assert.equal(before.get('devsize_playlists'), PL);
  const after = L.createStore(local({ [L.MOVED]: '1' }), idb({}, { hang: true }), { timeoutMs: 20 });
  const won = await Promise.race([after.ready, new Promise((r) => setTimeout(() => r('still waiting'), 60))]);
  assert.equal(won, 'still waiting', 'showing empty lists would let the next change overwrite the real ones');
});

test("a change saved before the database opened isn't lost", async () => {
  const ls = local({ [L.MOVED]: '1' });
  const db = idb({ devsize_playlists: '[]' });
  const s = L.createStore(ls, db);
  s.set('devsize_playlists', PL);
  await s.ready;
  assert.equal(s.get('devsize_playlists'), PL);
});

test('every profile has its own lists in IndexedDB; the move flag belongs to the device', async () => {
  const ls = local({ [`${P.PREFIX}abcd1234:devsize_history`]: '[2]', [`${P.PREFIX}abcd1234:uriel_font`]: 'serif' });
  const db = idb();
  const s = L.createStore(ls, db);
  await s.ready;
  await settle();
  assert.equal(db.m.get(`${P.PREFIX}abcd1234:devsize_history`), '[2]');
  assert.equal(ls.get(`${P.PREFIX}abcd1234:uriel_font`), 'serif');
  const v = P.view(s, 'abcd1234');
  assert.equal(v.getItem('devsize_history'), '[2]');
  v.setItem('devsize_playlists', PL);
  await settle();
  assert.equal(db.m.get(`${P.PREFIX}abcd1234:devsize_playlists`), PL);
  assert.equal(P.view(s, P.FIRST).getItem('devsize_playlists'), null, "another profile's list stays apart");
  assert.equal(P.isDevice(L.MOVED), true);
});

test('loaded before profiles-core.js, on computers and phones', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const at = (f) => html.indexOf(`<script src="${f}"></script>`);
  assert.ok(at('library-store.js') >= 0 && at('library-store.js') < at('profiles-core.js'));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'mobile', 'build.mjs'), 'utf8'), /'library-store\.js'/);
});
