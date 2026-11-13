'use strict';

// app.js and the parts split out of it (shared/app/), as one text. The tests that look for a line in the app's
// code find it wherever it lives now, and the ones that check a line is gone check every part.
const fs = require('fs');
const path = require('path');

const shared = path.join(__dirname, '..', 'shared');

module.exports = function appSource() {
  const parts = fs.readdirSync(path.join(shared, 'app')).filter((f) => f.endsWith('.js')).sort();
  return [path.join(shared, 'app.js'), ...parts.map((f) => path.join(shared, 'app', f))]
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
};
