const test = require('node:test');
const assert = require('node:assert');
const { parseForLyrics, pickBest } = require('../shared/lyrics-match');

test('YouTube titles become song + artist the way lyrics sites list them', () => {
  const cases = [
    [["PinkPantheress, Ice Spice - Boy’s a liar Pt. 2 (Official Video)", 'Pinkpantheress'], "Boy's a liar Pt. 2", 'PinkPantheress'],
    [['PinkPantheress - Girl Like Me (Official Video)', 'Pinkpantheress'], 'Girl Like Me', 'PinkPantheress'],
    [['Get Lucky (feat. Pharrell Williams)', 'Daft Punk - Topic'], 'Get Lucky', 'Daft Punk'],
    [['Hotline Bling', 'DrakeVEVO'], 'Hotline Bling', 'Drake'],
    [['Hey Jude - Remastered 2015', 'The Beatles'], 'Hey Jude', 'The Beatles'],
    [['Song [Lyrics] | 2024', 'Someone'], 'Song', 'Someone'],
  ];
  for (const [[title, artist], wantTitle, wantArtist] of cases) {
    const p = parseForLyrics(title, artist);
    assert.strictEqual(p.titles[0], wantTitle, title);
    assert.ok(p.artists.includes(wantArtist), `${title}: ${p.artists.join(' / ')}`);
  }
});

test('multiple artists also try the lead artist alone', () => {
  const p = parseForLyrics("Boy's a liar Pt. 2", 'PinkPantheress, Ice Spice');
  assert.deepStrictEqual(p.artists.slice(0, 2), ['PinkPantheress, Ice Spice', 'PinkPantheress']);
});

test('channel names without spaces get a spaced variant', () => {
  assert.ok(parseForLyrics('Blinding Lights', 'TheWeekndVEVO').artists.includes('The Weeknd'));
});

test('keeps meaningful brackets and non-Latin titles', () => {
  assert.strictEqual(parseForLyrics('Song (Remix)', 'A').titles[0], 'Song (Remix)');
  assert.strictEqual(parseForLyrics('Song (Remix)', 'A').titles[1], 'Song');
  assert.strictEqual(parseForLyrics('夜に駆ける', 'YOASOBI').titles[0], '夜に駆ける');
  assert.strictEqual(parseForLyrics('أهواك', 'عبد الحليم حافظ').titles[0], 'أهواك');
});

test('pickBest takes the matching song, not just the first result', () => {
  const want = parseForLyrics("Boy's a liar Pt. 2", 'PinkPantheress');
  const list = [
    { trackName: 'Liar', artistName: 'Someone Else', duration: 180, syncedLyrics: '[00:01.00] wrong' },
    { trackName: "Boy's a liar Pt. 2", artistName: 'PinkPantheress & Ice Spice', duration: 131, syncedLyrics: '[00:00.06] right' },
  ];
  assert.strictEqual(pickBest(list, want, 131).syncedLyrics, '[00:00.06] right');
});

test('pickBest refuses a title match from the wrong artist unless the length matches', () => {
  const want = parseForLyrics('Hello', 'Wrong Artist Channel');
  const list = [{ trackName: 'Hello', artistName: 'Adele', duration: 295, syncedLyrics: '[00:01.00] Hello' }];
  assert.strictEqual(pickBest(list, want, 0), null);
  assert.ok(pickBest(list, want, 296));
  assert.strictEqual(pickBest(null, want, 0), null);
  assert.strictEqual(pickBest([{ trackName: 'Hello', artistName: 'Adele', instrumental: true }], parseForLyrics('Hello', 'Adele'), 0), null);
});

test('pickBest keeps another artist\'s song of the same name out when the artist is known (#47)', () => {
  // same title and length, but the artist is known: not the song
  const hello = [{ trackName: 'Hello', artistName: 'Lionel Richie', duration: 295, syncedLyrics: '[00:01.00] wrong' }];
  assert.strictEqual(pickBest(hello, parseForLyrics('Hello', 'Adele'), 295), null);
  assert.strictEqual(pickBest(hello, parseForLyrics('Adele - Hello (Official Video)', 'Some Uploader'), 295), null);
  // "the", "lil" and the like are in lots of artist names
  const love = [{ trackName: 'Love', artistName: 'The Kid LAROI', duration: 200, syncedLyrics: '[00:01.00] wrong' }];
  assert.strictEqual(pickBest(love, parseForLyrics('Love', 'The Weeknd'), 0), null);
  assert.strictEqual(pickBest([{ trackName: 'Drip', artistName: 'Lil Uzi Vert', duration: 150, syncedLyrics: 'x' }], parseForLyrics('Drip', 'Lil Baby'), 0), null);
  // the right artist still matches, with others on the song or without "the"
  assert.ok(pickBest([{ trackName: 'Love', artistName: 'The Weeknd & Someone', duration: 200, syncedLyrics: 'x' }], parseForLyrics('Love', 'Weeknd'), 0));
  assert.ok(pickBest([{ trackName: 'All The Stars', artistName: 'Kendrick Lamar & SZA', duration: 232, syncedLyrics: 'x' }], parseForLyrics('All The Stars', 'Kendrick Lamar'), 0));
});

test('pickBest wants the whole title, not a longer one that has it in it (#47)', () => {
  const drip = parseForLyrics('Drip', 'Lil Baby');
  assert.strictEqual(pickBest([{ trackName: 'My Drip', artistName: 'Lil Baby', duration: 150, syncedLyrics: 'x' }], drip, 0), null);
  assert.strictEqual(pickBest([{ trackName: 'Love Again', artistName: 'The Kid LAROI', syncedLyrics: 'x' }], parseForLyrics('Love', 'The Kid LAROI'), 0), null);
  assert.strictEqual(pickBest([{ trackName: "Boy's a liar", artistName: 'PinkPantheress', syncedLyrics: 'x' }], parseForLyrics("Boy's a liar Pt. 2", 'PinkPantheress'), 0), null);
  // what a result's title carries besides the song's name is fine
  for (const name of ['Drip (feat. Someone)', 'Drip - Remastered 2019', 'Drip (Official Video)', 'DRIP']) {
    assert.ok(pickBest([{ trackName: name, artistName: 'Lil Baby', syncedLyrics: 'x' }], drip, 0), name);
  }
});
