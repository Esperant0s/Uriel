'use strict';

// playback-recovery.js: a song that loses its stream while playing is looked up again and continues
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMidSongRecovery, resumePosition, MAX_TRIES, CALM_MS } = require('../shared/playback-recovery.js');

function clock() {
  let t = 1000000;
  return { now: () => t, pass: (ms) => { t += ms; } };
}

test('a few tries per song, then it gives up instead of looping', () => {
  const r = createMidSongRecovery({ now: clock().now });
  for (let i = 0; i < MAX_TRIES; i++) assert.equal(r.decide({ song: 1 }), 'retry');
  assert.equal(r.decide({ song: 1 }), 'give-up');
});

test('the next song starts with all its tries', () => {
  const r = createMidSongRecovery({ now: clock().now });
  for (let i = 0; i <= MAX_TRIES; i++) r.decide({ song: 1 });
  assert.equal(r.decide({ song: 2 }), 'retry');
});

test('a long stretch of good playback starts the count again', () => {
  const c = clock();
  const r = createMidSongRecovery({ now: c.now });
  for (let i = 0; i < MAX_TRIES; i++) r.decide({ song: 1 });
  c.pass(CALM_MS);
  assert.equal(r.decide({ song: 1 }), 'retry');
});

test('offline waits for the connection and uses up no tries', () => {
  const r = createMidSongRecovery({ now: clock().now });
  for (let i = 0; i < 10; i++) assert.equal(r.decide({ song: 1, online: false }), 'wait-online');
  for (let i = 0; i < MAX_TRIES; i++) assert.equal(r.decide({ song: 1 }), 'retry');
});

test('a local file is not looked up again', () => {
  const r = createMidSongRecovery({ now: clock().now });
  assert.equal(r.decide({ song: 1, local: true }), 'give-up');
  assert.equal(r.decide({ song: 1, local: true, online: false }), 'give-up');
});

test('it continues where it stopped, unless that is the very start or end', () => {
  assert.equal(resumePosition(90, 200), 90);
  assert.equal(resumePosition(90, 0), 90, 'a stream that does not know its length yet');
  assert.equal(resumePosition(90, NaN), 90);
  assert.equal(resumePosition(0.5, 200), 0);
  assert.equal(resumePosition(199, 200), 0);
});

test('loaded before app.js, on computers and phones', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'shared/index.html'), 'utf8');
  const at = (f) => html.indexOf(`<script src="${f}"></script>`);
  assert.ok(at('playback-recovery.js') >= 0 && at('playback-recovery.js') < at('app.js'));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'mobile', 'build.mjs'), 'utf8'), /'playback-recovery\.js'/);
});
