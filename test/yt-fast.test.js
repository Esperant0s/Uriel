const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ytFast = require('../shared/yt-fast');

test('fast lookup picks plain-link audio formats, Opus first', () => {
  const player = { streamingData: { adaptiveFormats: [
    { itag: 137, mimeType: 'video/mp4', url: 'v' },
    { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', url: 'a140' },
    { itag: 251, mimeType: 'audio/webm; codecs="opus"', url: 'a251' },
    { itag: 250, mimeType: 'audio/webm; codecs="opus"', signatureCipher: 's=...' },
  ] } };
  assert.deepEqual(ytFast.pickFormats(player).map((f) => f.itag), [251, 140]);
  assert.deepEqual(ytFast.pickFormats(null), []);
});

test('video ids come from links and bare ids only', () => {
  assert.equal(ytFast.videoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x'), 'dQw4w9WgXcQ');
  assert.equal(ytFast.videoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(ytFast.videoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(ytFast.videoId('soundcloud:123'), null);
});

test('song start, the next song and other uploads try the fast way before yt-dlp', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'shared/server.js'), 'utf8');
  const order = (list) => list.map((name) => server.indexOf(name, server.indexOf('const DESKTOP_STRATEGIES')));
  // the resolver's computer strategies, in this order
  const [fast, ytDlp, other, sc] = order(["name: 'fast'", "name: 'ytDlp'", "name: 'otherUploads'", "name: 'soundcloud'"]);
  assert.ok(fast > 0 && fast < ytDlp && ytDlp < other && other < sc);
  // other uploads: the fast lookup before yt-dlp
  assert.ok(server.indexOf('await fastYouTubeStream(alt, null)') < server.indexOf("'stream-alternative'"));
  // the next song (prefetch) too
  const pre = server.indexOf('async function prefetchTrack');
  assert.ok(server.indexOf('await fastYouTubeStream(trackUrl, cleanId)', pre) < server.indexOf("reason: 'prefetch'", pre));
});

test("YouTube's \"confirm you're not a bot\" is a block for the shared stream health, and a sign-in clears it", () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'shared/server.js'), 'utf8');
  assert.match(server, /const YT_BOT_RE = \/confirm you\.\?re not a bot\/i;/);
  assert.ok("ERROR: [youtube] sBzrzS1Ag_g: Sign in to confirm you’re not a bot.".match(/confirm you.?re not a bot/i));
  assert.match(server, /isBlocked: isStreamBlock/);
  assert.match(server, /streamHealth\.reset\('youtube-ytdlp'\)/);
});
