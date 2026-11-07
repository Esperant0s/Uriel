'use strict';

// theme-boot.js: the chosen theme from the first frame instead of styles.css's purple until start-up gets to it
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('runs at the top of the page, after the profile storage, before anything is drawn (computers and phones)', () => {
  const html = read('shared/index.html');
  const at = (s) => html.indexOf(s);
  const boot = at('<script src="theme-boot.js"></script>');
  assert.ok(boot > at('<body') && boot > at('<script src="profiles-core.js"></script>'));
  assert.ok(boot < at('<div id="splash"'), 'before the first element');
  assert.match(read('mobile/build.mjs'), /'theme-boot\.js'/);
});

test('app.js saves what the theme painted, after each change and when the page goes', () => {
  const app = read('shared/app.js');
  assert.match(app, /localStorage\.setItem\('uriel_theme_boot'/);
  assert.match(app, /saveThemeBootSoon\(\);\n  }/, 'at the end of applyTheme');
  assert.match(app, /addEventListener\('pagehide', saveThemeBoot\)/);
});

test('the saved copy is not put in backups (the theme settings are)', () => {
  const B = require('../shared/backup-core.js');
  const backup = B.makeBackup([['uriel_theme_boot', '{}'], ['uriel_theme_accent', '#2E7D32']]);
  const data = JSON.stringify(backup);
  assert.equal(data.includes('uriel_theme_boot'), false);
  assert.equal(data.includes('uriel_theme_accent'), true);
});
