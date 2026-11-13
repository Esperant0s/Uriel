'use strict';

// backup-core.js: playlist files (shared, so trusted for nothing) and profile backups (only Uriel's own data and
// settings keys get restored), plus upstream Riff's .rfacc account files.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const B = require('../shared/backup-core.js');
const P = require('../shared/profiles-core.js');

const YT = 'dQw4w9WgXcQ';

test('playlist files from Riff, from Uriel and bare song lists are read', () => {
  const riff = JSON.stringify({ app: 'Riff', appVersion: '43.0.0', playlists: [{ name: 'Mix', description: 'd', tracks: [
    { title: 'Song', artist: 'A', album: 'Al', duration: 212, source: 'youtube', id: YT, url: `https://www.youtube.com/watch?v=${YT}`, cover: 'https://i.ytimg.com/vi/x/hq.jpg' },
    { title: 'SC', artist: 'B', source: 'soundcloud', id: '123', url: 'https://soundcloud.com/b/sc' },
    { title: 'Mine', artist: 'C', source: 'local', id: 'local_abc123', url: 'C:\\Users\\me\\Music\\mine.mp3' },
    { title: 'Only a name', artist: 'D', durationMs: 180500 },
  ] }] });
  const [pl] = B.parsePlaylistFile(riff);
  assert.equal(pl.name, 'Mix');
  assert.equal(pl.description, 'd');
  assert.deepEqual(pl.tracks[0], { title: 'Song', artist: 'A', album: 'Al', duration: 212, id: YT, platform: 'youtube', url: `https://www.youtube.com/watch?v=${YT}`, thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg' });
  assert.equal(pl.tracks[1].platform, 'soundcloud');
  assert.equal(pl.tracks[1].url, 'https://soundcloud.com/b/sc');
  assert.deepEqual(pl.tracks[2], { title: 'Mine', artist: 'C', id: 'local_abc123', platform: 'local' }, 'the path of the original file stays out');
  assert.deepEqual(pl.tracks[3], { title: 'Only a name', artist: 'D', duration: 181, needsMatch: true });

  const bare = B.parsePlaylistFile(JSON.stringify([{ title: 'x', url: `https://youtu.be/${YT}` }]));
  assert.equal(bare.length, 1);
  assert.equal(bare[0].tracks[0].id, YT);
  assert.equal(B.parsePlaylistFile(JSON.stringify({ name: 'One', tracks: [{ title: 't', id: YT }] }))[0].name, 'One');
  assert.deepEqual(B.parsePlaylistFile('not json'), []);
  assert.deepEqual(B.parsePlaylistFile(JSON.stringify({ hello: 1 })), []);
  assert.deepEqual(B.parsePlaylistFile('\uFEFF' + JSON.stringify({ tracks: [] })), [{ name: 'Imported playlist', tracks: [] }]);
});

test('a shared playlist file cannot smuggle in links, scripts or odd objects', () => {
  const evil = JSON.stringify({ playlists: [{ name: '<img src=x onerror=alert(1)>', cover: 'javascript:alert(1)', __proto__: { polluted: true }, tracks: [
    { title: 'a', id: YT, url: 'javascript:alert(1)', thumbnail: 'javascript:alert(2)' },
    { title: 'b', url: 'https://evil.example/stream.m3u8' },
    { title: 'c', url: 'http://127.0.0.1:38472/api/clear-offline-library', id: 'x' },
    { title: 'd', platform: 'soundcloud', url: 'https://soundcloud.com.evil.example/x' },
    { title: 'e', id: 'local_../../etc/passwd' },
    { title: { toString: 1 }, artist: ['x'] },
    'not a track',
    null,
  ] }] });
  const [pl] = B.parsePlaylistFile(evil);
  assert.equal(pl.cover, undefined);
  assert.equal(pl.name, '<img src=x onerror=alert(1)>', 'kept as text: the app escapes names when it shows them');
  assert.equal({}.polluted, undefined);
  assert.equal(pl.tracks[0].url, `https://www.youtube.com/watch?v=${YT}`);
  assert.equal(pl.tracks[0].thumbnail, `https://i.ytimg.com/vi/${YT}/hqdefault.jpg`);
  // anything that isn't YouTube or SoundCloud is only a title to look up
  for (const t of pl.tracks.slice(1, 4)) { assert.equal(t.needsMatch, true); assert.equal(t.url, undefined); }
  assert.equal(pl.tracks[4].id, undefined);
  assert.equal(pl.tracks.length, 5, 'non-objects and nameless entries are dropped');
  for (const t of pl.tracks) for (const v of Object.values(t)) assert.ok(['string', 'number', 'boolean'].includes(typeof v));
});

test('playlist files are capped', () => {
  const many = { playlists: Array.from({ length: B.LIMITS.playlists + 50 }, (_, i) => ({ name: `p${i}`, tracks: [{ title: 't', id: YT }] })) };
  assert.equal(B.parsePlaylistFile(JSON.stringify(many)).length, B.LIMITS.playlists);
  const long = { tracks: Array.from({ length: B.LIMITS.tracksPerPlaylist + 10 }, () => ({ title: 'x', id: YT })) };
  assert.equal(B.parsePlaylistFile(JSON.stringify(long))[0].tracks.length, B.LIMITS.tracksPerPlaylist);
  assert.equal(B.parsePlaylistFile(JSON.stringify({ tracks: [{ title: 'x'.repeat(5000), id: YT }] }))[0].tracks[0].title.length, 300);
  assert.deepEqual(B.parsePlaylistFile(' '.repeat(B.LIMITS.fileBytes + 1)), []);
});

test('exported playlists read back the same, without local addresses or tokens', () => {
  const pls = [{ id: 'pl_1', name: 'Mine', description: 'desc', cover: 'file:///home/me/cover.png', tracks: [
    { id: YT, title: 'Song', artist: 'A', duration: 200, platform: 'youtube', url: `https://www.youtube.com/watch?v=${YT}`, thumbnail: 'https://i.ytimg.com/vi/a/hq.jpg', addedAt: 5 },
    { id: 'local_abc', title: 'Local', artist: 'B', platform: 'local', thumbnail: 'http://127.0.0.1:38472/api/local-cover?id=local_abc&t=SECRETTOKEN' },
  ] }];
  const file = B.playlistFile(pls, { appVersion: '1.2.9' });
  const text = JSON.stringify(file);
  assert.equal(file.app, 'Uriel');
  assert.ok(!text.includes('SECRETTOKEN') && !text.includes('127.0.0.1') && !text.includes('file:'));
  const [back] = B.parsePlaylistFile(text);
  assert.equal(back.name, 'Mine');
  assert.equal(back.description, 'desc');
  assert.deepEqual(back.tracks.map((t) => [t.id, t.title, t.platform]), [[YT, 'Song', 'youtube'], ['local_abc', 'Local', 'local']]);
  assert.equal(B.fileName('a/b:c*?.', 'json'), 'a_b_c_..json');
  assert.equal(B.fileName('..', 'json'), 'uriel.json');
});

test('a backup holds the open profile\'s own data and settings, nothing of the device', () => {
  const entries = [
    ['devsize_playlists', '[]'], ['uriel_theme_mode', 'light'], ['uriel_listens_v1', '{}'],
    ['uriel_perf_mode', 'true'], ['uriel_audio_analysis_x', '{}'], ['uriel_secret_lastfm', '{"default":{"sk":"x"}}'],
    ['uriel_sync_group', 'g'], ['uriel_profiles', '[]'], ['uriel_custom_css', 'body{}'], ['uriel_debug_log', '[]'],
    ['someplugin_state', '1'],
  ];
  const b = B.makeBackup(entries, { profileName: 'Kid', appVersion: '1.2.9', isDevice: P.isDevice });
  assert.equal(b.kind, 'uriel-backup');
  assert.equal(b.profile.name, 'Kid');
  assert.deepEqual(Object.keys(b.data).sort(), ['devsize_playlists', 'uriel_listens_v1', 'uriel_theme_mode']);
});

test('a restore only writes Uriel keys, checks the playlists through, and keeps the sync link', () => {
  const backup = { kind: 'uriel-backup', version: 1, profile: { name: 'Me' }, data: {
    devsize_playlists: JSON.stringify([{ id: 'pl_a', name: 'A', cover: 'javascript:alert(1)', tracks: [{ id: YT, title: 't', thumbnail: 'javascript:x', url: 'https://www.youtube.com/watch?v=' + YT, nested: { a: 1 }, addedAt: 3 }] }, { id: 'pl_a', name: 'dup id' }, 'junk']),
    devsize_favorites: JSON.stringify([{ id: 'x', title: 'f', platform: 'evilnet' }, 5]),
    devsize_history: 'not json',
    uriel_theme_mode: 'dark',
    uriel_volume: 0.5,
    uriel_sync_group: 'attacker-group',
    uriel_profile_active: 'x',
    'uriel_p:abcd:devsize_playlists': '[]',
    uriel_perf_mode: 'true',
    uriel_custom_css: 'body{background:url(https://evil/)}',
    uriel_lastfm_sk: 'leaked',
    uriel_lastfm_enabled: 'false',
    evil_key: 'x',
    '__proto__': 'x',
  } };
  const r = B.readBackup(backup, { isDevice: P.isDevice });
  assert.equal(r.source, 'uriel');
  assert.deepEqual(Object.keys(r.entries).sort(), ['devsize_favorites', 'devsize_playlists', 'uriel_lastfm_enabled', 'uriel_theme_mode', 'uriel_volume']);
  assert.equal(r.entries.uriel_volume, '0.5');
  const pls = JSON.parse(r.entries.devsize_playlists);
  assert.equal(pls.length, 2);
  assert.notEqual(pls[0].id, pls[1].id, 'a repeated id gets a new one');
  assert.equal(pls[0].cover, undefined);
  assert.deepEqual(pls[0].tracks[0], { id: YT, title: 't', url: 'https://www.youtube.com/watch?v=' + YT, addedAt: 3 });
  assert.deepEqual(JSON.parse(r.entries.devsize_favorites), [{ id: 'x', title: 'f', platform: 'youtube' }]);
  assert.ok(r.skipped.includes('devsize_history') && r.skipped.includes('uriel_sync_group') && r.skipped.includes('uriel_custom_css'));
  assert.deepEqual(r.counts, { playlists: 2, favorites: 1, history: 0, keys: 5 });
  // what a restore leaves alone in the profile it replaces
  assert.equal(B.keepOnRestore('uriel_sync_group', P.isDevice), true);
  assert.equal(B.keepOnRestore('uriel_custom_css', P.isDevice), true);
  assert.equal(B.keepOnRestore('uriel_perf_mode', P.isDevice), true);
  assert.equal(B.keepOnRestore('someplugin_state', P.isDevice), true);
  assert.equal(B.keepOnRestore('devsize_playlists', P.isDevice), false);
  assert.throws(() => B.readBackup({ hello: 1 }), /isn't a Uriel backup/);
  assert.throws(() => B.readBackup(null), /isn't a Uriel backup/);
  const big = 'x'.repeat(B.LIMITS.keyBytes - 10);
  assert.throws(() => B.readBackup({ kind: 'uriel-backup', data: { uriel_a: big, uriel_b: big, uriel_c: big, uriel_d: big } }), /too big/);
  assert.ok(B.readBackup({ kind: 'uriel-backup', data: { uriel_a: big + 'x'.repeat(20) } }).skipped.includes('uriel_a'), 'one key over the cap is left out');
});

// how upstream Riff's main.js writes an account file
function rfacc(obj) {
  const key = crypto.createHash('sha256').update('riff-account-key-v1').digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(zlib.deflateRawSync(Buffer.from(JSON.stringify(obj)))), c.final()]);
  return new Uint8Array(Buffer.concat([Buffer.from('RFAC'), iv, c.getAuthTag(), enc]));
}

test('Riff account files (.rfacc) open, and their riff_ keys become Uriel\'s', async () => {
  const file = rfacc({ app: 'Riff', version: '1.0', exportedAt: 1, localStorage: {
    devsize_playlists: JSON.stringify([{ id: 'pl_r', name: 'From Riff', tracks: [{ id: YT, title: 'x' }] }]),
    riff_theme_mode: 'light', riff_perf_mode: 'true', riff_lastfm_sk: 'secret', riff_lastfm_apisecret: 's', riff_lastfm_enabled: 'true',
    devsize_discord_rpc: 'true',
  } });
  assert.ok(B.isRiffAccount(file));
  const parsed = await B.parseBackupFile(file);
  const r = B.readBackup(parsed, { isDevice: P.isDevice });
  assert.equal(r.source, 'riff');
  assert.deepEqual(Object.keys(r.entries).sort(), ['devsize_discord_rpc', 'devsize_playlists', 'uriel_lastfm_enabled', 'uriel_theme_mode']);
  assert.equal(r.counts.playlists, 1);
  // a damaged file says so
  const broken = file.slice();
  broken[broken.length - 1] ^= 1;
  await assert.rejects(B.parseBackupFile(broken), /damaged/);
  await assert.rejects(B.parseBackupFile(new TextEncoder().encode('{nope')), /isn't a Uriel backup/);
  const own = await B.parseBackupFile(new TextEncoder().encode(JSON.stringify(B.makeBackup([['uriel_theme_mode', 'dark']]))));
  assert.equal(B.readBackup(own).entries.uriel_theme_mode, 'dark');
});

test('an .rfacc that inflates into something huge is refused', async () => {
  const key = crypto.createHash('sha256').update('riff-account-key-v1').digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const bomb = zlib.deflateRawSync(Buffer.alloc(B.LIMITS.totalBytes * 2 + 10, 0x20));
  const enc = Buffer.concat([c.update(bomb), c.final()]);
  const file = new Uint8Array(Buffer.concat([Buffer.from('RFAC'), iv, c.getAuthTag(), enc]));
  await assert.rejects(B.parseBackupFile(file), /too big/);
});

test('an automatic backup is due once a day, and never for an empty library', () => {
  const some = { playlists: 2, favorites: 0, history: 0 };
  assert.equal(B.autoBackupDue({ lastDay: '2026-11-12', today: '2026-11-13', counts: some }), true);
  assert.equal(B.autoBackupDue({ lastDay: '', today: '2026-11-13', counts: { playlists: 0, favorites: 0, history: 1 } }), true);
  assert.equal(B.autoBackupDue({ lastDay: '2026-11-13', today: '2026-11-13', counts: some }), false);
  // after a wipe the empty lists must not push the good backups out
  assert.equal(B.autoBackupDue({ lastDay: '', today: '2026-11-13', counts: { playlists: 0, favorites: 0, history: 0 } }), false);
  assert.equal(B.autoBackupDue({ lastDay: '', today: '2026-11-13' }), false);
});

test('the newest automatic backups are kept; other files in the folder are left alone', () => {
  const days = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((d) => B.autoBackupName(`2026-11-${d}`));
  assert.deepEqual(B.autoBackupsToDrop([...days].reverse().concat(['notes.txt', 'uriel-auto-x.json'])), [days[0], days[1]]);
  assert.deepEqual(B.autoBackupsToDrop(days.slice(0, B.AUTO_KEEP)), []);
  assert.deepEqual(B.autoBackupsToDrop([]), []);
  assert.equal(B.autoBackupDay('uriel-auto-2026-11-13.json'), '2026-11-13');
  assert.equal(B.autoBackupDay('../uriel-auto-2026-11-13.json'), '');
  assert.equal(B.dayOf(new Date(2026, 10, 3, 23, 59)), '2026-11-03');
});

test('a restore is offered when the library is empty and a backup is not, once', () => {
  const empty = { playlists: 0, favorites: 0, history: 0 };
  const backups = [
    { name: 'uriel-auto-2026-11-13.json', counts: empty },
    { name: 'uriel-auto-2026-11-12.json', counts: { playlists: 3, favorites: 40, history: 9 } },
    { name: 'uriel-auto-2026-11-11.json', counts: { playlists: 3, favorites: 39, history: 5 } },
  ];
  assert.equal(B.restoreOffer({ counts: empty, backups }).name, 'uriel-auto-2026-11-12.json', 'the newest one with something in it');
  assert.equal(B.restoreOffer({ counts: empty, backups, dismissed: 'uriel-auto-2026-11-12.json' }), null, 'said no to it already');
  assert.equal(B.restoreOffer({ counts: { playlists: 1, favorites: 0, history: 0 }, backups }), null, 'the library has something');
  assert.equal(B.restoreOffer({ counts: empty, backups: [backups[0]] }), null);
  assert.equal(B.restoreOffer({ counts: empty, backups: [] }), null);
});

test("an automatic backup's own bookkeeping is never part of a backup or a restore", () => {
  assert.equal(B.backupKeyAllowed('uriel_autobackup_day'), false);
  assert.equal(B.backupKeyAllowed('uriel_autobackup_dismissed'), false);
  assert.equal(B.keepOnRestore('uriel_autobackup_day'), true);
});
