// @ts-check
// Saved settings, playlists and the rest used to be stored as muriel_x (Muriel, Mural) and a few as mural_x; they
// are uriel_x now. The first script on every page: each key with an old name moves to its new one (other profiles'
// keys too: "muriel_p:<id>:muriel_x" -> "uriel_p:<id>:uriel_x"), so everything after it only knows the new names.
// A key that already has a value under its new name keeps that value. Nothing happens once everything has moved.
// test/storage-migrate.test.js runs this in Node.
(function (root) {
  const renamed = (k) => k.replace(/(^|:)(?:muriel|mural)_/g, '$1uriel_');
  // values that named the app: the Home button icon and the home layout
  const VALUES = /(^|:)uriel_(?:app_icon|home_layout)$/;

  function migrate(ls) {
    const keys = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k != null) keys.push(k); }
    let moved = 0;
    for (const k of keys) {
      const to = renamed(k);
      if (to === k) continue;
      const v = ls.getItem(k);
      if (v !== null && ls.getItem(to) === null) {
        try { ls.setItem(to, v); }
        catch (e) {
          // storage full: make room with the old copy, and put it back if the new one still doesn't fit
          ls.removeItem(k);
          try { ls.setItem(to, v); } catch (e2) { try { ls.setItem(k, v); } catch (e3) {} continue; }
        }
      }
      ls.removeItem(k);
      moved++;
    }
    for (const k of keys.map(renamed)) {
      if (VALUES.test(k) && ls.getItem(k) === 'muriel') { try { ls.setItem(k, 'uriel'); } catch (e) {} }
    }
    return moved;
  }

  if (typeof module === 'object' && module.exports) module.exports = { migrate, renamed };
  else { try { migrate(root.localStorage); } catch (e) {} }
})(typeof window !== 'undefined' ? window : globalThis);
