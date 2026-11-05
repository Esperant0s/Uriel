'use strict';
// yt-dlp and ffmpeg runs must not outlive the app: closing it during a download used to leave them running,
// using CPU and network with nobody listening. yt-dlp starts processes of its own (ffmpeg, a JavaScript runtime),
// so each run is stopped together with everything it started.
const { execFileSync } = require('child_process');

const running = new Set();

function track(proc) {
  if (proc && proc.pid) {
    running.add(proc);
    proc.once('close', () => running.delete(proc));
  }
  return proc;
}

// `ps -A -o pid=,ppid=` output -> the pids below root
function descendants(psOutput, root) {
  const kids = new Map();
  for (const line of String(psOutput).split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    if (!kids.has(m[2])) kids.set(m[2], []);
    kids.get(m[2]).push(m[1]);
  }
  const out = [];
  const todo = [String(root)];
  while (todo.length) {
    for (const k of kids.get(todo.pop()) || []) {
      if (out.includes(Number(k))) continue;
      out.push(Number(k));
      todo.push(k);
    }
  }
  return out;
}

// Synchronous: the app is about to exit, so nothing asynchronous would get to finish.
function stopAll({ platform = process.platform, exec = execFileSync, kill = process.kill } = {}) {
  const procs = [...running];
  if (!procs.length) return 0;
  if (platform === 'win32') {
    for (const p of procs) {
      try { exec('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 3000 }); } catch (e) {}
    }
    return procs.length;
  }
  let table = '';
  try { table = exec('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', timeout: 2000 }); } catch (e) {}
  for (const p of procs) {
    for (const pid of descendants(table, p.pid)) { try { kill(pid, 'SIGKILL'); } catch (e) {} }
    try { p.kill('SIGKILL'); } catch (e) {}
  }
  return procs.length;
}

module.exports = { track, stopAll, descendants, running };
