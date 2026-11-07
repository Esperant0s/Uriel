// Tickets from the GitHub tracker that were reproduced in the running app.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('shared/app.js');

test('#41: wheel ticks add up: a smooth scrollBy per tick lost most of a fast flick', () => {
  const start = app.indexOf('function wheelRowSideways(');
  const body = app.slice(start, app.indexOf('function bindHorizontalWheel', start));
  assert.match(body, /glideRowBy\(row,/);
  assert.doesNotMatch(body, /scrollBy\(/);
  assert.match(body, /row\._glideRaf \? row\._glideTo : row\.scrollLeft/);
});

test('#41: Ctrl and = zooms in, since Ctrl and + needs Shift on most keyboards', () => {
  assert.match(read('desktop/main.js'), /input\.key !== '='[\s\S]{0,200}zoomLevel \+= 0\.5/);
});

test('#32: losing the output pauses, on the PC and on Android', () => {
  assert.match(app, /state\.isPlaying && \(lostChosen \|\| lostDefault\)/);
  assert.match(read('mobile/android/app/src/main/java/io/github/esperant0s/uriel/MediaControlsPlugin.java'), /ACTION_AUDIO_BECOMING_NOISY/);
});
