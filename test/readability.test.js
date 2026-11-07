'use strict';

// See-through panels hurt readability: a fresh profile starts mostly solid, and dialogs, menus and messages are
// solid whatever Interface opacity says
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('Interface opacity starts at 85% when it was never set', () => {
  const app = read('shared/app.js');
  assert.match(app, /const DEFAULT_UI_ALPHA = '85';/);
  assert.equal(/getItem\('uriel_ui_alpha'\) \|\| '20'/.test(app), false, 'no 20% fallback left');
  assert.match(read('shared/index.html'), /id="slider-ui-alpha"[^>]*value="85"/);
});

test('dialogs, menus and messages are painted solid', () => {
  const css = read('shared/styles.css');
  const rule = css.slice(css.lastIndexOf(':is(.settings-card, .dialog-card'));
  for (const cls of ['.settings-card', '.dialog-card', '.modal-card', '.m3-dropdown-menu', '.track-context-menu', '.profile-menu', '.uriel-toast']) assert.ok(rule.split('{')[0].includes(cls), cls);
  assert.match(rule, /background-color: var\(--md-sys-color-surface-container-high-solid\) !important;/);
});
