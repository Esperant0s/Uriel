'use strict';

// child-procs.js: yt-dlp and ffmpeg runs, and whatever they started, stop when the app does
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const C = require('../child-procs.js');

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
const closed = (p) => new Promise((r) => { if (p.exitCode !== null || p.signalCode) r(); else p.once('close', r); });
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 20)); return fn(); };

test('the tree of a run is read from ps, however deep', () => {
  const table = ' 10 1\n 20 10\n 30 20\n 40 1\n 50 40\nnot a line\n';
  assert.deepEqual(C.descendants(table, 10).sort(), [20, 30]);
  assert.deepEqual(C.descendants(table, 30), []);
  assert.deepEqual(C.descendants('', 10), []);
});

test('a finished run is forgotten', async () => {
  const p = C.track(spawn(process.execPath, ['-e', '']));
  assert.ok(C.running.has(p));
  await closed(p);
  assert.equal(C.running.has(p), false);
});

test('a process that failed to start is not tracked', async () => {
  const p = spawn('/no/such/program');
  p.on('error', () => {});
  C.track(p);
  assert.equal(C.running.has(p), false);
});

test('stopping nothing runs nothing', () => {
  let ran = 0;
  assert.equal(C.stopAll({ exec: () => { ran++; return ''; } }), 0);
  assert.equal(ran, 0);
});

test('Windows stops the whole tree through taskkill', () => {
  const p = C.track(spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)']));
  const calls = [];
  C.stopAll({ platform: 'win32', exec: (cmd, args) => { calls.push([cmd, ...args]); return ''; } });
  assert.deepEqual(calls, [['taskkill', '/PID', String(p.pid), '/T', '/F']]);
  p.kill('SIGKILL');
  return closed(p);
});

test('a run and the process it started both stop', { skip: process.platform === 'win32' }, async () => {
  // the parent prints its child's pid, as yt-dlp's ffmpeg would be running under it
  const script = "const c=require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:'ignore'});console.log(c.pid);setTimeout(()=>{},60000)";
  const parent = C.track(spawn(process.execPath, ['-e', script]));
  const childPid = await new Promise((r) => parent.stdout.once('data', (d) => r(Number(String(d).trim()))));
  assert.ok(alive(childPid));
  assert.equal(C.stopAll(), 1);
  await closed(parent);
  assert.ok(await until(() => !alive(childPid)), 'the process it started is gone too');
});

test("the ffmpeg that copies a playing song to the cache stops too", { skip: process.platform === 'win32' }, async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { copyStreamToCache } = require('../cache-copy.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-procs-'));
  const fake = path.join(dir, 'ffmpeg');
  fs.writeFileSync(fake, '#!/bin/sh\nexec sleep 60\n');
  fs.chmodSync(fake, 0o755);
  let proc = null;
  const done = copyStreamToCache(fake, 'https://example.com/a.opus', path.join(dir, 'a.temp.opus'), { onChild: (p) => { proc = p; } });
  await until(() => proc);
  assert.ok(C.running.has(proc), 'a run the quit does not know about would outlive the app');
  assert.equal(C.stopAll(), 1);
  assert.equal(await done, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
