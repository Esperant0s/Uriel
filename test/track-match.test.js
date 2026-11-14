const test = require('node:test');
const assert = require('node:assert');
const { pickBestMatch, splitArtists, cleanTitle, matchQueries } = require('../shared/track-match');

const r = (artist, title, duration = 0) => ({ artist, title, duration });

test('same title by another artist is not taken (#18)', () => {
  const sp = { title: 'Yellow', artist: 'Coldplay', duration: 269 };
  const results = [r('Tame Impala', 'Yellow', 250), r('Some Band', 'Yellow (Coldplay Cover)', 268), r('Coldplay - Topic', 'Yellow', 267)];
  assert.strictEqual(pickBestMatch(sp, results).artist, 'Coldplay - Topic');
  assert.strictEqual(pickBestMatch(sp, results.slice(0, 1)), null);
});

test('official channel, VEVO and "Artist - Title" uploads count as the artist', () => {
  const sp = { title: 'Holocene', artist: 'Bon Iver', duration: 336 };
  assert.ok(pickBestMatch(sp, [r('boniver', 'Bon Iver - Holocene (Official Video)', 337)]));
  assert.ok(pickBestMatch({ title: 'Shake It Off', artist: 'Taylor Swift' }, [r('TaylorSwiftVEVO', 'Taylor Swift - Shake It Off')]));
  assert.ok(pickBestMatch({ title: 'Paradise', artist: 'Coldplay' }, [r('Random Uploads', 'Coldplay - Paradise (Lyrics)')]));
});

test('the artist wins over a closer duration from another artist', () => {
  const sp = { title: 'Home', artist: 'Edward Sharpe & The Magnetic Zeros', duration: 303 };
  const results = [r('Daughtry', 'Home', 303), r('Edward Sharpe & The Magnetic Zeros', 'Home', 306)];
  assert.strictEqual(pickBestMatch(sp, results).artist, 'Edward Sharpe & The Magnetic Zeros');
});

test('covers, karaoke, sped up and live lose unless the source is one', () => {
  const sp = { title: 'Creep', artist: 'Radiohead', duration: 239 };
  const results = [r('Radiohead', 'Creep (Live at Glastonbury)', 250), r('Sing King', 'Creep - Radiohead (Karaoke Version)', 239), r('sped', 'Radiohead - Creep (sped up)', 190), r('Radiohead', 'Creep', 238)];
  assert.strictEqual(pickBestMatch(sp, results).title, 'Creep');
  const live = { title: 'Creep - Live at Glastonbury', artist: 'Radiohead', duration: 250 };
  assert.strictEqual(pickBestMatch(live, results).title, 'Creep (Live at Glastonbury)');
});

test('featured and several artists', () => {
  assert.deepStrictEqual(splitArtists('Taylor Swift, Bon Iver'), ['taylor swift', 'bon iver']);
  assert.deepStrictEqual(splitArtists('Calvin Harris feat. Rihanna'), ['calvin harris', 'rihanna']);
  const sp = { title: 'exile (feat. Bon Iver)', artist: 'Taylor Swift, Bon Iver', duration: 285 };
  assert.ok(pickBestMatch(sp, [r('Taylor Swift - Topic', 'exile (feat. Bon Iver)', 286)]));
  assert.strictEqual(cleanTitle('When Love Takes Over (feat. Kelly Rowland)'), 'when love takes over');
});

test('queries carry the artist', () => {
  assert.deepStrictEqual(matchQueries({ title: 'Yellow', artist: 'Coldplay' }), ['Coldplay Yellow']);
  assert.strictEqual(matchQueries({ title: 'Hey Jude - Remastered 2015', artist: 'The Beatles' })[0], 'The Beatles Hey Jude');
});

test('Cyrillic source meets a transliterated upload', () => {
  assert.ok(pickBestMatch({ title: 'Группа крови', artist: 'Кино' }, [r('Kino', 'Gruppa krovi')]));
});

test("Spotify's \" - From …\", \" - Remastered\" and \" - Radio Edit\" endings aren't part of the title", () => {
  assert.ok(pickBestMatch({ title: 'Lose Yourself - From "8 Mile" Soundtrack', artist: 'Eminem' }, [r('Eminem', 'Lose Yourself')]));
  assert.ok(pickBestMatch({ title: 'Hello - Radio Edit', artist: 'Adele' }, [r('AdeleVEVO', 'Adele - Hello')]));
  assert.deepEqual(matchQueries({ title: 'Here Comes the Sun - Remastered 2009', artist: 'The Beatles' }), ['The Beatles Here Comes the Sun']);
  assert.ok(pickBestMatch({ title: 'From Me to You', artist: 'The Beatles' }, [r('The Beatles', 'From Me To You')]), 'a title starting with From');
});

test('Arabic names meet their Latin spellings, and the spellings meet each other', () => {
  assert.ok(pickBestMatch({ title: 'Enta Omri', artist: 'Umm Kulthum' }, [r('Om Kolthoum', 'انت عمري')]));
  assert.ok(pickBestMatch({ title: 'سكة السلامة', artist: 'كاظم الساهر' }, [r('Kazem Al Saher', 'سكة السلامة')]));
  assert.ok(!pickBestMatch({ title: 'Enta Omri', artist: 'Umm Kulthum' }, [r('Lole y Manuel', 'Anta Oumri')]));
});

test("a tribute channel isn't the artist", () => {
  assert.ok(!pickBestMatch({ title: 'Yellow', artist: 'Coldplay' }, [r('Coldplay Tribute', 'Yellow')]));
});
