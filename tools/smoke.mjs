// Starts the desktop app on an empty data folder and checks that it loads: no script throws, app.js ran to its
// end, and every part it is split into set itself up. `npm run smoke`; CI runs it on every push (test.yml).
// What it can't see: whether songs play (that needs yt-dlp and the network), and the phone apps.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const electron = createRequire(import.meta.url)('electron');
const PORT = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), 'uriel-smoke-'));
// its own home, data and settings, so a run never reads or touches a real Uriel on this computer
const env = { ...process.env, HOME: tmp, USERPROFILE: tmp, URIEL_DATA_DIR: join(tmp, 'data'), XDG_CONFIG_HOME: join(tmp, 'config'), APPDATA: join(tmp, 'config'), LOCALAPPDATA: join(tmp, 'config') };
// as if the welcome screen had been seen: a first run opens welcome.html, and this is about the app itself
mkdirSync(env.URIEL_DATA_DIR, { recursive: true });
writeFileSync(join(env.URIEL_DATA_DIR, '.urieltutorial'), '');
const args = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profile')}`];
// CI has no user namespace sandbox for Chromium to use, and no graphics card
if (process.env.CI) args.push('--no-sandbox', '--disable-gpu');
const app = spawn(electron, [...args, root], { env, stdio: ['ignore', 'pipe', 'pipe'] });
// what the app itself printed, for when it never gets as far as a window
let said = '';
let exited = null;
for (const out of [app.stdout, app.stderr]) out.on('data', (d) => { said = (said + d).slice(-4000); });
app.on('exit', (code, signal) => { exited = signal || code; });

let failed = [];
try {
  let page = null;
  for (let i = 0; i < 120 && !page && exited === null; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((p) => p.type === 'page' && /index\.html/.test(p.url)); } catch (e) {}
    if (!page) await sleep(500);
  }
  if (!page) throw new Error(`the app's window never appeared${exited !== null ? ` (it quit: ${exited})` : ''}\n--- what the app printed ---\n${said.trim() || '(nothing)'}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let id = 0;
  const waiting = new Map();
  const thrown = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      thrown.push(((d.exception && d.exception.description) || d.text || 'error').split('\n').slice(0, 3).join(' | '));
    }
  });
  const call = (method, params = {}) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
  await call('Runtime.enable');
  await call('Page.enable');
  // again from the top, now that every thrown error is seen
  await call('Page.reload', { ignoreCache: true });

  const parts = readdirSync(join(root, 'shared', 'app')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).filter((n) => n !== 'boot');
  const check = `(() => {
    const missing = [];
    for (const g of ['UrielCore', 'UrielImportCore', 'UrielBackup', 'UrielSync', 'UrielI18n', 'UrielProfiles']) if (!window[g]) missing.push(g);
    for (const p of ${JSON.stringify(parts)}) if (!window.UrielApp || typeof window.UrielApp[p] !== 'function') missing.push('UrielApp.' + p);
    return JSON.stringify({ ready: !!window.UrielCore, missing, view: window.UrielCore ? window.UrielCore.state.currentView : '' });
  })()`;
  let state = { ready: false, missing: ['nothing loaded'] };
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const r = await call('Runtime.evaluate', { expression: check, returnByValue: true });
    try { state = JSON.parse(r.result.value); } catch (e) {}
    if (state.ready && !state.missing.length) break;
  }
  // a little longer: what start-up sets off (the home page, the saved queue) has its chance to throw too
  await sleep(4000);

  if (!state.ready) failed.push("app.js didn't finish starting (window.UrielCore is missing)");
  if (state.missing.length) failed.push(`not set up: ${state.missing.join(', ')}`);
  for (const t of thrown) failed.push(`a script threw: ${t}`);
  ws.close();
} catch (e) {
  failed.push(e.message);
} finally {
  app.kill();
  await sleep(500);
  try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

if (failed.length) {
  console.error(`smoke test failed:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
console.log('smoke test passed: the app starts, nothing throws, every part is set up');
