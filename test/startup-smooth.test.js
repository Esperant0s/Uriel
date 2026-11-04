'use strict';

// A smooth first second: the artwork shapes are stored, not worked out at start-up (that took ~0.9 s), and the
// splash stays up until the app is ready and drawing smoothly
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the four artwork shapes are ready as soon as m3shapes.js runs, without touching the page', () => {
  const win = {};
  const doc = { readyState: 'loading', addEventListener: () => assert.fail('nothing should wait for the page'), createElementNS: () => assert.fail('no SVG measuring at start-up') };
  new Function('window', 'document', read('m3shapes.js'))(win, doc);
  const S = win.RiffShapes;
  assert.equal(S.ready(), true);
  assert.equal(S.count(), 4);
  for (let i = 0; i < 4; i++) {
    const p = S.profile(i);
    assert.equal(p.length, S.K);
    assert.equal(Math.max(...p), 160, 'scaled to 160 at the widest');
    assert.ok(Math.min(...p) > 100);
  }
  assert.equal(typeof S.rebuild, 'function', 'still possible to work them out again after changing a shape');
});

test('the splash waits for the app and for smooth frames, with a cap; it only animates transform and opacity', () => {
  const app = read('app.js');
  const splash = app.slice(app.indexOf('(function urielSplash()'), app.indexOf("document.addEventListener('DOMContentLoaded'"));
  assert.match(splash, /addEventListener\('uriel:ready'/);
  assert.match(splash, /MAX_MS/);
  assert.match(splash, /smooth >= SMOOTH_MS/);
  const css = read('styles.css');
  for (const name of ['splashBloom', 'splashBreathe']) {
    const kf = css.slice(css.indexOf(`@keyframes ${name}`), css.indexOf('}\n', css.indexOf(`@keyframes ${name}`)) + 1);
    const props = [...kf.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
    assert.ok(props.length && props.every((p) => p === 'transform' || p === 'opacity'), `${name}: ${props}`);
  }
  assert.match(css, /splashGiveUp \.45s 8s/, 'the CSS fallback still clears it if start-up fails');
});
