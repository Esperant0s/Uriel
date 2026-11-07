// Problems found by profiling the desktop app and the Android app. These live inside app.js's closure, so the
// checks read the source; each one names what went wrong when it was missing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('shared/app.js');
const css = read('shared/styles.css');
const fnBody = (src, name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`${name} never ends`);
};

test('a failed start stops the playing state: is-playing left on kept the animations running with no sound', () => {
  const stop = fnBody(app, 'stopAfterFailure');
  assert.match(stop, /state\.isPlaying = false/);
  assert.match(stop, /classList\.remove\('is-playing'\)/);
  // no failure path may only reset the button before giving up on the song
  assert.doesNotMatch(app, /updatePlayPauseButton\(false, false\);\s*if \(!skipUnplayable\((currentToken|token), track\)\)/);
});

test('the player keeps saying a song failed after the toast is gone, until another song loads', () => {
  assert.match(fnBody(app, 'showPlayFailure'), /classList\.add\('play-failed'\)/);
  assert.match(fnBody(app, 'updateNowPlayingUI'), /classList\.remove\('play-failed'\)/);
  assert.doesNotMatch(app, /!skipUnplayable\([^)]*\)\) showToast/);
});

test('covers are saved in one batch: a save per cover ran the phone out of memory on a long list', () => {
  const remember = fnBody(app, 'rememberTrackArt');
  assert.doesNotMatch(remember, /JSON\.stringify|localStorage/);
  assert.match(remember, /setTimeout\(saveRememberedArt/);
  assert.match(fnBody(app, 'saveRememberedArt'), /localStorage\.setItem\('devsize_favorites'/);
});

test('offline, a song looks only for saved copies instead of waiting on every online source', () => {
  assert.match(fnBody(app, 'attachStream'), /localOnly \|\| navigator\.onLine === false \? '&localOnly=1'/);
});

test('Android tells the WebView about the network: navigator.onLine stayed true in airplane mode otherwise', () => {
  assert.match(read('mobile/android/app/src/main/java/io/github/esperant0s/uriel/MainActivity.java'), /setNetworkAvailable/);
  assert.match(read('mobile/android/app/src/main/AndroidManifest.xml'), /android\.permission\.ACCESS_NETWORK_STATE/);
});

test('the frame cap defaults to 60, and capped loops wait on a timer instead of waking on every screen refresh', () => {
  assert.match(app, /getItem\('uriel_fps_cap'\) \|\| '60', 10\) \|\| 0/);
  assert.match(app, /const cur = localStorage\.getItem\('uriel_fps_cap'\) \|\| '60'/);
  assert.match(fnBody(app, 'scheduleVizFrame'), /setTimeout/);
  assert.match(fnBody(app, 'renderLoop'), /scheduleVizFrame\(renderLoop, fpsCap\)/);
  assert.doesNotMatch(fnBody(app, 'renderLoop'), /animationFrameId = requestAnimationFrame\(renderLoop\)/);
});

test('the karaoke word fill follows the cap: it restyled the lyrics on every screen refresh', () => {
  const start = fnBody(app, 'startGradientLoop');
  assert.match(start, /isPhoneApp \? 30 : userFpsCap/);
  assert.match(start, /gradientTimer = setTimeout/);
});

test('list rows are measured once per width, not on every chunk of a scroll', () => {
  assert.match(fnBody(app, 'renderChunk'), /_rowMeasuredFor === parentRect\.width \? 0 : measureRowHeight\(\)/);
});

test('the blurred background shapes animate transform only: border-radius repainted them on every frame', () => {
  for (const name of ['float-pill', 'float-egg', 'float-triangle']) {
    const m = css.match(new RegExp(`@keyframes ${name} \\{[\\s\\S]*?\\n\\}`));
    assert.ok(m, `${name} exists`);
    assert.doesNotMatch(m[0], /border-radius:/);
  }
});

test('playlist and favourites pages do not scroll by themselves: overflow-x hidden made a second scrollbar', () => {
  const m = css.match(/#view-playlist-detail,\s*#view-favorites \{\s*overflow-x: (\w+);/);
  assert.ok(m, 'the rule exists');
  assert.strictEqual(m[1], 'clip');
  assert.match(css, /\.fy-row \{[^}]*overflow-x: auto; overflow-y: hidden;/);
});
