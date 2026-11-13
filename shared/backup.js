// @ts-check
// Playlist files and profile backups, the part you see: "Export as JSON" on a playlist, Settings → Storage
// (export / import playlists, back up / restore this profile), Settings → Integrations → Playlist file and the
// JSON button under "Create playlist". What goes in and what is let back in is in backup-core.js.
// Files are saved with the desktop save dialog, or handed to the share sheet on phones (electronAPI.saveTextFile).
(function () {
  const B = window.UrielBackup;
  if (!B) return;
  /** @type {(id: string) => any} */
  const $ = (id) => document.getElementById(id);
  let core = null;
  const toast = (m, kind) => { try { core && core.toast(m, kind || 'info'); } catch (e) {} };
  const P = () => window.UrielProfiles || null;
  const isDevice = (k) => { const p = P(); return p && p.isDevice ? p.isDevice(k) : false; };

  async function appVersion() {
    try { return (window.electronAPI && window.electronAPI.getAppVersion && (await window.electronAPI.getAppVersion())) || ''; } catch (e) { return ''; }
  }

  // desktop: save dialog (main.js); phones: share sheet (mobile/electron-api.ts); a plain browser: a download
  async function saveFile(name, text, kind) {
    const api = window.electronAPI;
    if (api && typeof api.saveTextFile === 'function') {
      const r = await api.saveTextFile({ defaultName: name, content: text, kind });
      if (r && r.canceled) return 'canceled';
      if (r && (r.success || r.shared)) return 'saved';
      throw new Error((r && r.error) || "Couldn't save the file");
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return 'saved';
  }

  // ---------- playlist files ----------
  async function exportPlaylists(list, name) {
    const valid = (list || []).filter((p) => p && Array.isArray(p.tracks));
    if (!valid.length) { toast('No playlists to export', 'info'); return; }
    const text = JSON.stringify(B.playlistFile(valid, { appVersion: await appVersion() }), null, 2);
    try {
      if ((await saveFile(name, text, 'playlists')) === 'saved') toast(valid.length === 1 ? `Exported "${valid[0].name}"` : `Exported ${valid.length} playlists`, 'success');
    } catch (e) { toast(e.message || "Couldn't export", 'error'); }
  }

  function exportCurrent() {
    const s = core && core.state;
    const pl = s && s.playlists.find((p) => p.id === s.currentPlaylistId);
    if (pl) exportPlaylists([pl], B.fileName(pl.name || 'playlist', 'json'));
  }

  function exportAll() {
    const s = core && core.state;
    const me = P() ? P().current().name : '';
    exportPlaylists(s ? s.playlists : [], B.fileName(me && P().list().length > 1 ? `uriel-playlists-${me}` : 'uriel-playlists', 'json'));
  }

  function pickPlaylistFiles() {
    const input = $('json-playlist-file-input');
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function importPlaylistFiles(files) {
    if (!files.length || !core) return;
    const found = [];
    for (const f of files.slice(0, 20)) {
      if (f.size > B.LIMITS.fileBytes) { toast(`${f.name} is too big`, 'error'); continue; }
      try { found.push(...B.parsePlaylistFile(await f.text())); } catch (e) {}
    }
    const playlists = found.filter((p) => p.tracks.length);
    if (!playlists.length) { toast('No playlists with songs in that file', 'error'); return; }
    // songs known only by title and artist get looked up first
    const unmatched = playlists.flatMap((p) => p.tracks.filter((t) => t.needsMatch)).slice(0, 2000);
    const matched = new Map();
    if (unmatched.length) {
      toast(`Finding ${unmatched.length} song${unmatched.length === 1 ? '' : 's'} on YouTube…`, 'info');
      // one at a time per worker, so each answer stays with its song (and the playlist keeps its order)
      let next = 0;
      let failures = 0;
      const worker = async () => {
        while (next < unmatched.length && failures < 8) {
          const t = unmatched[next++];
          try {
            const [m] = await core.matchTracks([{ title: t.title, artist: t.artist, duration: t.duration }]);
            if (m) { matched.set(t, m); failures = 0; }
          } catch (e) { failures++; }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (failures >= 8) toast("Search isn't answering; songs without a link were left out", 'info');
    }
    let made = 0;
    let songs = 0;
    let missing = 0;
    for (const p of playlists) {
      const tracks = [];
      for (const t of p.tracks) {
        if (!t.needsMatch) { tracks.push(t); continue; }
        const m = matched.get(t);
        if (m) tracks.push(m); else missing++;
      }
      if (!tracks.length) continue;
      if (core.importPlaylist(p.name, tracks, { cover: p.cover, description: p.description })) { made++; songs += tracks.length; }
    }
    if (!made) { toast('None of those songs could be found', 'error'); return; }
    const create = $('create-playlist-modal');
    if (create && create.classList.contains('visible')) core.closeModal(create);
    toast(`Imported ${made} playlist${made === 1 ? '' : 's'} (${songs} songs)${missing ? `, ${missing} not found` : ''}`, 'success');
  }

  // ---------- backups ----------
  function ownEntries() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) out.push([k, localStorage.getItem(k)]);
      }
    } catch (e) {}
    return out;
  }

  // the lists couldn't be read (library-store.js): a backup would be missing them and a restore couldn't save them
  function libraryUnavailable() {
    const L = window.UrielLibraryStore;
    if (!L || !L.store || L.store.mode() !== 'unavailable') return false;
    toast("Your library couldn't be opened. Restart Uriel and try again", 'error');
    return true;
  }

  async function exportBackup() {
    if (!core || libraryUnavailable()) return;
    const me = P() ? P().current() : { name: '' };
    const data = B.makeBackup(ownEntries(), { profileName: me.name, appVersion: await appVersion(), isDevice });
    const day = new Date().toISOString().slice(0, 10);
    try {
      if ((await saveFile(B.fileName(`uriel-backup-${me.name || 'profile'}-${day}`, 'json'), JSON.stringify(data), 'backup')) === 'saved') toast('Backup saved', 'success');
    } catch (e) { toast(e.message || "Couldn't save the backup", 'error'); }
  }

  function pickBackupFile() {
    const input = $('account-file-input');
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function restoreBackup(file) {
    if (!file || !core || libraryUnavailable()) return;
    let backup;
    try {
      if (file.size > B.LIMITS.fileBytes) throw new Error('That file is too big');
      backup = B.readBackup(await B.parseBackupFile(new Uint8Array(await file.arrayBuffer())), { isDevice });
    } catch (e) { toast(e.message || "Couldn't read that file", 'error'); return; }
    restoreFrom(backup);
  }

  // asks, then replaces this profile with the backup and restarts. `autoDay`: one of the automatic backups, by its
  // day. Answers whether the restore went ahead.
  /** @param {any} backup @param {{ autoDay?: string, lead?: string }} [o] */
  function restoreFrom(backup, { autoDay = '', lead = '' } = {}) {
    if (!core || libraryUnavailable()) return false;
    const c = backup.counts;
    if (!c.keys) { toast('That backup has nothing Uriel can restore', 'error'); return false; }
    const me = P() ? P().current().name : '';
    const what = [`${c.playlists} playlist${c.playlists === 1 ? '' : 's'}`, `${c.favorites} favorite${c.favorites === 1 ? '' : 's'}`];
    const from = autoDay ? `the automatic backup of ${niceDay(autoDay)}`
      : backup.source === 'riff' ? 'this Riff account' : (backup.profileName ? `the backup of "${backup.profileName}"` : 'this backup');
    const linked = (() => { try { return !!localStorage.getItem('uriel_sync_group'); } catch (e) { return false; } })();
    const ok = window.confirm(`${lead}Restore ${from} (${what.join(', ')}) into ${me ? `the profile "${me}"` : 'Uriel'}?\n\nIts playlists, favorites, history and settings are replaced by the backup's.${linked ? ' Devices this profile syncs with get the restored ones too.' : ''} Uriel restarts afterwards.`);
    if (!ok) return false;
    // stop what would save over the restored keys while the page goes away
    try { if (core.state && core.state.isPlaying) core.togglePlay(); if (core.audio) core.audio.pause(); } catch (e) {}
    try { if (core.state) core.state._queueRestored = false; } catch (e) {}
    try { if (window.UrielSync && window.UrielSync.stop) window.UrielSync.stop(); } catch (e) {}
    const entries = backup.entries;
    const apply = () => {
      for (const [k] of ownEntries()) {
        if (!B.keepOnRestore(k, isDevice) && !(k in entries)) { try { localStorage.removeItem(k); } catch (e) {} }
      }
      for (const [k, v] of Object.entries(entries)) { try { localStorage.setItem(k, v); } catch (e) {} }
    };
    apply();
    const short = Object.entries(entries).filter(([k, v]) => { try { return localStorage.getItem(k) !== v; } catch (e) { return true; } });
    if (short.length) { toast("The storage is full: part of the backup couldn't be restored", 'error'); }
    else toast('Backup restored. Restarting…', 'success');
    // Encore and the queue save on the way out; this runs after them (added last), so the backup wins
    window.addEventListener('pagehide', apply);
    setTimeout(() => location.reload(), 700);
    return true;
  }

  // ---------- automatic backups ----------
  // Once a day the profile is saved to a file in the app's data folder (server.js keeps the newest few). The lists
  // live in the page's own storage; when that is lost, the files are still there, and Uriel offers the newest one.
  const AUTO_DAY = 'uriel_autobackup_day';
  const AUTO_DISMISSED = 'uriel_autobackup_dismissed';
  const niceDay = (day) => { try { return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return day; } };
  const profileId = () => { try { return (P() && P().current().id) || 'default'; } catch (e) { return 'default'; } };
  const autoUrl = (route, more = '') => `${core.base()}/api/${route}?profile=${encodeURIComponent(profileId())}${more}`;
  const libraryCounts = () => {
    const s = core.state || {};
    return { playlists: (s.playlists || []).length, favorites: (s.favorites || []).length, history: (s.history || []).length };
  };
  const stored = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };

  async function listAutoBackups() {
    try { return (await (await fetch(autoUrl('auto-backups'))).json()).backups || []; } catch (e) { return []; }
  }
  async function readAutoBackup(name) {
    const r = await fetch(autoUrl('auto-backup', `&name=${encodeURIComponent(name)}`));
    if (!r.ok) throw new Error("Couldn't read that backup");
    return B.readBackup(await r.json(), { isDevice });
  }

  async function saveAutoBackup() {
    const L = window.UrielLibraryStore;
    if (!core || (L && L.store && L.store.mode() === 'unavailable')) return;
    const today = B.dayOf(new Date());
    if (!B.autoBackupDue({ lastDay: stored(AUTO_DAY), today, counts: libraryCounts() })) return;
    const me = P() ? P().current() : { name: '' };
    const data = B.makeBackup(ownEntries(), { profileName: me.name, appVersion: await appVersion(), isDevice });
    try {
      const r = await fetch(autoUrl('auto-backup', `&day=${today}`), { method: 'POST', body: JSON.stringify(data) });
      if (!r.ok) return;
      try { localStorage.setItem(AUTO_DAY, today); } catch (e) {}
      showAutoBackupState();
    } catch (e) {}
  }

  // the library is empty and a backup isn't: offer the newest such backup, once
  async function offerAutoRestore() {
    if (!core || !B.libraryIsEmpty(libraryCounts())) return;
    const backups = [];
    for (const b of await listAutoBackups()) {
      try { const backup = await readAutoBackup(b.name); backups.push({ name: b.name, day: b.day, counts: backup.counts, backup }); } catch (e) {}
      if (backups.length && !B.libraryIsEmpty(backups[backups.length - 1].counts)) break;
    }
    const offer = B.restoreOffer({ counts: libraryCounts(), backups, dismissed: stored(AUTO_DISMISSED) });
    if (!offer) return;
    if (!restoreFrom(offer.backup, { autoDay: offer.day, lead: 'Your library is empty, and Uriel has a backup of it.\n\n' })) { try { localStorage.setItem(AUTO_DISMISSED, offer.name); } catch (e) {} }
  }

  async function showAutoBackupState() {
    const hint = $('auto-backup-hint');
    if (!hint) return;
    const list = await listAutoBackups();
    hint.textContent = list.length
      ? `Saved on this device once a day. Newest: ${niceDay(list[0].day)} (${list.length} kept)`
      : 'Saved on this device once a day, once there is something to save';
    const btn = $('btn-auto-backups');
    if (btn) btn.disabled = !list.length;
  }

  async function openAutoBackups() {
    const modal = $('auto-backup-modal');
    const box = $('auto-backup-list');
    if (!modal || !box) return;
    box.textContent = '';
    for (const b of await listAutoBackups()) {
      const row = document.createElement('div');
      row.className = 'auto-backup-row';
      const day = document.createElement('span');
      day.textContent = niceDay(b.day);
      const btn = document.createElement('button');
      btn.className = 'btn-outline-pill';
      btn.textContent = 'Restore';
      btn.addEventListener('click', async () => {
        try { if (restoreFrom(await readAutoBackup(b.name), { autoDay: b.day })) core.closeModal(modal); } catch (e) { toast(e.message || "Couldn't read that backup", 'error'); }
      });
      row.append(day, btn);
      box.appendChild(row);
    }
    core.openModal(modal);
  }

  function startAutoBackups() {
    const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
    on('btn-auto-backups', openAutoBackups);
    on('btn-close-auto-backups', () => core.closeModal($('auto-backup-modal')));
    showAutoBackupState();
    // after start-up has settled: the offer first (an empty library is never saved over a backup), then today's
    setTimeout(async () => { await offerAutoRestore(); saveAutoBackup(); }, 4000);
    // an app left open for days still saves each day
    setInterval(saveAutoBackup, 3 * 3600e3);
  }

  function hook() {
    core = window.UrielCore;
    if (!core) return;
    const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
    on('btn-export-playlist', exportCurrent);
    on('btn-export-all-playlists', exportAll);
    on('btn-import-json-playlists', pickPlaylistFiles);
    on('btn-open-json-import', pickPlaylistFiles);
    on('btn-cpm-json', pickPlaylistFiles);
    on('btn-export-account', exportBackup);
    on('btn-import-account', pickBackupFile);
    const files = $('json-playlist-file-input');
    if (files) files.addEventListener('change', () => { const list = [...(files.files || [])]; files.value = ''; importPlaylistFiles(list); });
    const acc = $('account-file-input');
    if (acc) acc.addEventListener('change', () => { const f = acc.files && acc.files[0]; acc.value = ''; restoreBackup(f); });
    // with several profiles, say whose backup this is
    const hint = $('export-account-hint');
    if (hint && P() && P().list().length > 1) hint.textContent = `${P().current().name}: playlists, favorites, history, Encore and settings in one file`;
    startAutoBackups();
  }

  if (window.UrielCore) hook();
  else window.addEventListener('uriel:ready', hook, { once: true });
})();
