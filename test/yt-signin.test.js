'use strict';

// "Play with my YouTube sign-in": the Google login's cookies as a cookies.txt for yt-dlp (google-library.js), and
// every yt-dlp run getting it (server.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-ytsignin-'));
process.env.MURIEL_DATA_DIR = path.join(tmp, 'data');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { netscapeCookies } = require('../google-library')._test;

test("only YouTube's cookies go into the file (not the Google account's), in the format yt-dlp reads", () => {
  const text = netscapeCookies([
    { domain: '.youtube.com', hostOnly: false, path: '/', secure: true, expirationDate: 1893456000.5, name: 'SAPISID', value: 'abc' },
    { domain: 'accounts.google.com', hostOnly: true, path: '/', secure: true, expirationDate: 0, name: 'LSID', value: 'x' },
    { domain: '.example.com', hostOnly: false, path: '/', secure: false, name: 'other', value: 'nope' },
    { domain: '.youtube.com', path: '/', name: 'bad\ttab', value: 'v' },
  ]);
  const lines = text.trim().split('\n');
  assert.equal(lines[0], '# Netscape HTTP Cookie File');
  assert.ok(lines.includes('.youtube.com\tTRUE\t/\tTRUE\t1893456000\tSAPISID\tabc'));
  assert.equal(text.includes('LSID'), false, 'google.com account cookies stay out');
  assert.equal(text.includes('example.com'), false);
  assert.equal(text.includes('bad'), false);
});

const server = require('../server');

test('every yt-dlp run uses the cookie file while it is set, and the bot pause ends', () => {
  const file = path.join(tmp, 'youtube-cookies.txt');
  fs.writeFileSync(file, '# Netscape HTTP Cookie File\n');
  const args = ['--no-config', '-g', '--', 'https://www.youtube.com/watch?v=abcdefghijk'];
  assert.deepEqual(server._test.withYtDlpCookies(args), args, 'off: unchanged');
  server.setYtDlpCookies(file);
  assert.deepEqual(server._test.withYtDlpCookies(args), ['--no-config', '--cookies', file, '-g', '--', 'https://www.youtube.com/watch?v=abcdefghijk']);
  server.setYtDlpCookies(null);
  assert.deepEqual(server._test.withYtDlpCookies(args), args, 'off again');
  server.setYtDlpCookies(path.join(tmp, 'missing.txt'));
  assert.deepEqual(server._test.withYtDlpCookies(args), args, 'a file that is gone is not passed');
});
