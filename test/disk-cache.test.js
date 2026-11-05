'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { planEviction, enforceLimit } = require('../disk-cache.js');

const song = (id, size, used, temp = false) => ({ id, name: `${id}.opus`, size, used, temp });

test('under the limit, or with no limit, nothing goes', () => {
  assert.deepEqual(planEviction([song('a', 10, 1)], 100), []);
  assert.deepEqual(planEviction([song('a', 1000, 1)], 0), [], '0 means no limit');
});

test('the songs played longest ago go first, only until it fits', () => {
  const files = [song('new', 40, 300), song('old', 40, 100), song('mid', 40, 200)];
  assert.deepEqual(planEviction(files, 90, 0).map((f) => f.id), ['old']);
  assert.deepEqual(planEviction(files, 50, 0).map((f) => f.id), ['old', 'mid']);
});

test('the newest few always stay, even over the limit', () => {
  const files = [song('a', 100, 1), song('b', 100, 2), song('c', 100, 3)];
  assert.deepEqual(planEviction(files, 10, 2).map((f) => f.id), ['a']);
});

test('a download in progress counts towards the limit but is never removed', () => {
  const files = [song('old', 50, 1), song('x', 50, 2, true)];
  assert.deepEqual(planEviction(files, 60, 0).map((f) => f.id), ['old']);
  assert.deepEqual(planEviction([song('x', 500, 1, true)], 10, 0), []);
});

test('enforceLimit deletes real files and reports them; other files and recent plays are left alone', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-cache-'));
  try {
    const put = (name, ageSec) => {
      fs.writeFileSync(path.join(dir, name), Buffer.alloc(100));
      const t = new Date(Date.now() - ageSec * 1000);
      fs.utimesSync(path.join(dir, name), t, t);
    };
    put('oldest.opus', 500);
    put('played.m4a', 400); // an old file, but the index knows it was just played
    put('newer.opus', 100);
    put('notes.txt', 900);
    const removed = [];
    const n = await enforceLimit(dir, 200, { keepNewest: 0, lastPlayed: (id) => (id === 'played' ? Date.now() : 0), onRemoved: (id) => removed.push(id) });
    assert.equal(n, 1);
    assert.deepEqual(removed, ['oldest']);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['newer.opus', 'notes.txt', 'played.m4a']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('enforceLimit does nothing without a limit', async () => {
  assert.equal(await enforceLimit('/does/not/exist', 0), 0);
});
