const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrate, folderPairs } = require('../migrate-legacy');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-migrate-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

test('each computer brings over its own Muriel folders', () => {
  const home = '/home/me';
  assert.deepEqual(folderPairs('/home/me/.config', 'linux', {}, home), [
    ['/home/me/.config/Muriel', '/home/me/.config/Uriel'],
    ['/home/me/.cache/muriel', '/home/me/.cache/uriel'],
    ['/home/me/.config/muriel', '/home/me/.config/uriel'],
  ]);
  assert.equal(folderPairs('/Users/me/Library/Application Support', 'darwin', {}, '/Users/me').length, 1);
  assert.equal(folderPairs('C:\\AppData\\Roaming', 'win32', { LOCALAPPDATA: 'C:\\AppData\\Local' }, 'C:\\me').length, 2);
});

test("Muriel's storage, settings and songs come over once; songs are shared, not copied", () => {
  const home = path.join(tmp, 'home');
  const appData = path.join(home, '.config');
  put(path.join(appData, 'Muriel', 'Local Storage', 'leveldb', '000003.log'), 'playlists');
  put(path.join(appData, 'Muriel', 'Cache', 'big'), 'x');
  put(path.join(home, '.cache', 'muriel', 'tracks', 'abc.opus'), 'song');
  put(path.join(home, '.cache', 'muriel', 'metadata.json'), '{}');
  put(path.join(appData, 'muriel', 'config.json'), '{"downloadDir":"/music"}');

  const moved = migrate(appData, { platform: 'linux', env: {}, home });
  assert.equal(moved.length, 3);
  assert.equal(fs.readFileSync(path.join(appData, 'Uriel', 'Local Storage', 'leveldb', '000003.log'), 'utf8'), 'playlists');
  assert.equal(fs.existsSync(path.join(appData, 'Uriel', 'Cache')), false);
  assert.equal(fs.readFileSync(path.join(appData, 'uriel', 'config.json'), 'utf8'), '{"downloadDir":"/music"}');
  const oldSong = fs.statSync(path.join(home, '.cache', 'muriel', 'tracks', 'abc.opus'));
  const newSong = fs.statSync(path.join(home, '.cache', 'uriel', 'tracks', 'abc.opus'));
  assert.equal(newSong.ino, oldSong.ino, 'the song file is hard-linked');
  const oldMeta = fs.statSync(path.join(home, '.cache', 'muriel', 'metadata.json'));
  const newMeta = fs.statSync(path.join(home, '.cache', 'uriel', 'metadata.json'));
  assert.notEqual(newMeta.ino, oldMeta.ino, 'files both apps rewrite are copied');

  // Uriel's own folders are never overwritten on later starts
  fs.writeFileSync(path.join(appData, 'uriel', 'config.json'), '{"changed":true}');
  assert.deepEqual(migrate(appData, { platform: 'linux', env: {}, home }), []);
  assert.equal(fs.readFileSync(path.join(appData, 'uriel', 'config.json'), 'utf8'), '{"changed":true}');
});

test("Mural's folders come over to Uriel, and win over Muriel's", () => {
  const home = path.join(tmp, 'home-mural');
  const appData = path.join(home, '.config');
  put(path.join(appData, 'Muriel', 'Local Storage', 'leveldb', '000003.log'), 'old playlists');
  put(path.join(appData, 'Mural', 'Local Storage', 'leveldb', '000003.log'), 'playlists');
  put(path.join(home, '.cache', 'mural', 'tracks', 'abc.opus'), 'song');
  put(path.join(appData, 'mural', 'config.json'), '{"downloadDir":"/music"}');

  assert.deepEqual(folderPairs(appData, 'linux', {}, home), [
    [path.join(appData, 'Mural'), path.join(appData, 'Uriel')],
    [path.join(home, '.cache', 'mural'), path.join(home, '.cache', 'uriel')],
    [path.join(appData, 'mural'), path.join(appData, 'uriel')],
  ]);
  assert.equal(migrate(appData, { platform: 'linux', env: {}, home }).length, 3);
  assert.equal(fs.readFileSync(path.join(appData, 'Uriel', 'Local Storage', 'leveldb', '000003.log'), 'utf8'), 'playlists');
  assert.equal(fs.readFileSync(path.join(appData, 'uriel', 'config.json'), 'utf8'), '{"downloadDir":"/music"}');
  const oldSong = fs.statSync(path.join(home, '.cache', 'mural', 'tracks', 'abc.opus'));
  assert.equal(fs.statSync(path.join(home, '.cache', 'uriel', 'tracks', 'abc.opus')).ino, oldSong.ino);
});
