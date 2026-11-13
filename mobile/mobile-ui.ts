// iOS layout behaviour on top of app.js: mini player <-> now-playing sheet, swipe to dismiss,
// and the progress line on the mini player.

// Background playback: iOS suspends Web Audio when the app is backgrounded or the screen locks,
// but keeps a plain <audio> element playing (and on the lock screen). So on iPhone the engine never
// routes the element through an AudioContext. Speed/pitch still work (they're element properties);
// EQ, reverb, distortion and the visualizer need the graph and are off. app.js builds the engine on
// DOMContentLoaded, which hasn't fired yet when this script runs.
// Android has no graph either, but its native player does the sound settings itself (EffectsProcessor.kt): the
// engine still keeps them, and mobile/native-audio.ts sends them on.
(() => {
  // desktop's default text scale (1.25x) is sized for a monitor; phones start at 1.0x unless the user picked one
  if (!localStorage.getItem('uriel_font_scale')) localStorage.setItem('uriel_font_scale', '80');
  const Engine = window.UrielAudioEngine;
  if (!Engine) return;
  Engine.prototype.init = function (audioElement) { this.__element = audioElement || this.__element; };
  // iOS ignores element.volume (hardware buttons own it); mute still works
  Engine.prototype._applyMasterVolume = function () {
    if (this.__element) this.__element.muted = !!this.isMuted || this.volume === 0;
  };
})();

// a message in the app's language (shared/i18n.js), or as written before that has loaded
const translate = (message: string): string => (window.UrielI18n ? window.UrielI18n.Tm(message) : message);
// presses a button of the page by its id, if it is there
const press = (id: string): void => { const b = document.getElementById(id); if (b) b.click(); };
// the element a tap landed on
const tapped = (e: Event): Element | null => (e.target instanceof Element ? e.target : null);

(() => {
  const panel = document.getElementById('right-panel');
  const playbar = document.getElementById('playbar');
  const lyricsBtn = document.getElementById('btn-toggle-lyrics-panel');
  if (!panel || !playbar || !lyricsBtn) return;

  // app.js owns the drawer state; mirror it onto <body> so the player bar can restyle itself
  const sync = () => document.body.classList.toggle('np-open', !panel.classList.contains('hidden'));
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
  sync();

  const openSheet = () => { if (panel.classList.contains('hidden')) lyricsBtn.click(); };
  const closeSheet = () => { if (!panel.classList.contains('hidden')) press('btn-close-right-panel'); };

  // tapping the mini player (but not its buttons) opens the sheet
  playbar.addEventListener('click', (e) => {
    if (document.body.classList.contains('np-open')) return;
    const on = tapped(e);
    if (on && on.closest('button, input, .scrubber-track-container')) return;
    openSheet();
  });

  // swipe down on the sheet's top area to close it
  let startY: number | null = null;
  panel.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const lyrics = document.getElementById('lyrics-container');
    // a finger on a seek bar or slider is seeking, not closing the sheet (#21)
    const on = tapped(e);
    if (on && on.closest('input[type="range"], .scrubber-track-container, [role="slider"]')) { startY = null; return; }
    startY = (lyrics && on && lyrics.contains(on) && lyrics.scrollTop > 0) ? null : t.clientY;
  }, { passive: true });
  // one transform write per frame, and no CSS transition while the finger drags (it lagged behind)
  let dragY = 0, dragRaf = 0;
  panel.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    dragY = Math.max(0, e.touches[0].clientY - startY);
    if (dragY > 0 && !panel.classList.contains('is-dragging')) panel.classList.add('is-dragging');
    if (!dragRaf) dragRaf = requestAnimationFrame(() => { dragRaf = 0; if (startY !== null) panel.style.transform = dragY > 0 ? `translateY(${dragY}px)` : ''; });
  }, { passive: true });
  panel.addEventListener('touchend', (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
    panel.classList.remove('is-dragging');
    panel.style.transform = '';
    startY = null;
    if (dy > 110) closeSheet();
  });

  // Picked images and videos (background, banner, song covers) are saved as file URLs, and those change when
  // iOS moves the app container (every update or reinstall). Rebuild each saved one from its file name, then
  // delete picks nothing uses any more (every pick is a new copy). Only the background was repaired before,
  // and picking a song cover made even that repair forget the background.
  const fixPickedMedia = async () => {
    const api = window.electronAPI;
    if (!api.fileUrl) return;
    const nameOf = (u: unknown): string | null => { const m = typeof u === 'string' && !u.startsWith('blob:') && u.match(/\/backgrounds\/(bg_[\w.-]+)$/); return m ? m[1] : null; };
    const keep = new Set<string>();
    const fresh = async (u: string): Promise<string> => {
      const name = nameOf(u);
      if (!name) return u;
      const url = await api.fileUrl(`/data/backgrounds/${name}`);
      if (url) keep.add(name);
      return url || u;
    };
    let bgChanged = false;
    for (const key of ['uriel_bg_url', 'uriel_banner_media', 'uriel_app_icon']) {
      const cur = localStorage.getItem(key);
      if (!cur) continue;
      const next = await fresh(cur);
      if (next !== cur) { localStorage.setItem(key, next); if (key === 'uriel_bg_url') bgChanged = true; }
    }
    let artOk = true;
    try {
      // a song's own cover and banner, by song
      const art: Record<string, Record<string, string> | null> = JSON.parse(localStorage.getItem('uriel_track_art') || '{}');
      let dirty = false;
      for (const v of Object.values(art)) {
        for (const f of ['cover', 'banner']) {
          if (!v || !v[f]) continue;
          const next = await fresh(v[f]);
          if (next !== v[f]) { v[f] = next; dirty = true; }
        }
      }
      if (dirty) localStorage.setItem('uriel_track_art', JSON.stringify(art));
    } catch (e) { artOk = false; }
    localStorage.removeItem('uriel_bg_vpath');
    if (bgChanged) (window.UrielCore.refreshBackground as () => void)();
    // these settings are per profile but the files are shared: keep every profile's picks, not only this one's
    // (switching to a profile without a background used to delete the other profile's)
    let othersOk = true;
    const P = window.UrielProfiles;
    if (P) {
      for (const p of P.list()) {
        for (const key of ['uriel_bg_url', 'uriel_banner_media', 'uriel_app_icon']) {
          const name = nameOf(P.peek(p.id, key));
          if (name) keep.add(name);
        }
        try {
          for (const v of Object.values(JSON.parse(P.peek(p.id, 'uriel_track_art') || '{}') as Record<string, Record<string, string> | null>)) {
            for (const f of ['cover', 'banner']) { const name = v && nameOf(v[f]); if (name) keep.add(name); }
          }
        } catch (e) { othersOk = false; }
      }
    }
    if (artOk && othersOk && api.pruneMedia) api.pruneMedia(keep);
  };
  if (window.UrielCore) fixPickedMedia(); else window.addEventListener('uriel:ready', fixPickedMedia, { once: true });

  // phones default to word-by-word karaoke (the Line/Word button still switches)
  const preferWordLyrics = () => {
    const st = window.UrielCore && window.UrielCore.state;
    const btn = document.getElementById('btn-lyrics-mode');
    if (st && btn && st.lyricsMode === 'line' && localStorage.getItem('uriel_adv_karaoke_words') !== 'false') btn.click();
  };
  if (window.UrielCore) preferWordLyrics(); else window.addEventListener('uriel:ready', preferWordLyrics, { once: true });

  // lyrics tools (edit / sync / translate / fullscreen) move up next to the Line/Word button,
  // so the lyrics get that row back; same buttons, so their handlers keep working
  const tools = panel.querySelector('.lyrics-header-actions');
  const topRow = panel.querySelector('.right-panel-header-actions');
  if (tools && topRow) { topRow.prepend(tools); tools.classList.add('np-tools-moved'); }

  // ...and that row (the tools and Line/Word) stays out of sight until the lyrics button in the tab row is
  // tapped, so the cover and the song have the screen to themselves
  const tabsRow = panel.querySelector('.drawer-tabs');
  const toolsHeader = panel.querySelector('.right-panel-header');
  if (tabsRow && toolsHeader) {
    const toggle = document.createElement('button');
    toggle.id = 'np-tools-toggle';
    toggle.type = 'button';
    toggle.className = 'btn-icon-pill';
    toggle.setAttribute('aria-label', 'Lyrics settings');
    toggle.setAttribute('data-i18n-attr', 'aria-label');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/></svg>';
    const setOpen = (open: boolean) => {
      panel.classList.toggle('np-tools-open', open);
      toggle.classList.toggle('active', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', () => setOpen(!panel.classList.contains('np-tools-open')));
    tabsRow.prepend(toggle);
    // closed again each time the sheet closes
    new MutationObserver(() => { if (panel.classList.contains('hidden')) setOpen(false); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  // like button next to the title in Now Playing (the player bar's heart is hidden on phones);
  // it presses the real one and mirrors its state
  const realFav = document.getElementById('btn-toggle-fav');
  const favIcon = document.getElementById('fav-icon');
  const titleRow = panel.querySelector('.right-panel-title-row');
  if (realFav && favIcon && titleRow) {
    const like = document.createElement('button');
    like.id = 'np-like';
    like.type = 'button';
    like.setAttribute('data-i18n-attr', 'aria-label');
    like.setAttribute('aria-label', 'Like');
    like.innerHTML = favIcon.outerHTML.replace('id="fav-icon"', '');
    const mirror = () => { const on = favIcon.getAttribute('fill') === 'currentColor'; like.classList.toggle('on', on); const svg = like.querySelector('svg'); if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none'); };
    like.addEventListener('click', () => {
      realFav.click();
      like.classList.remove('pop'); void like.offsetWidth; like.classList.add('pop');
      if (navigator.vibrate) navigator.vibrate(12);
    });
    new MutationObserver(mirror).observe(favIcon, { attributes: true, attributeFilter: ['fill'] });
    titleRow.appendChild(like);
    mirror();
  }

  // slowly drifting colour glow behind Now Playing (cover colours, plain gradients: cheap to draw)
  const ambient = document.createElement('div');
  ambient.className = 'np-ambient';
  ambient.innerHTML = '<i></i><i></i><i></i>';
  panel.prepend(ambient);

  // swipe the cover left/right to skip, with the cover following your finger
  const cover = document.getElementById('cover-container');
  if (cover) {
    let x0: number | null = null, y0 = 0, dx = 0, horizontal: boolean | null = null;
    cover.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; horizontal = null; cover.style.transition = 'none'; }, { passive: true });
    cover.addEventListener('touchmove', (e) => {
      if (x0 === null) return;
      dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;
      if (horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horizontal = Math.abs(dx) > Math.abs(dy);
      if (horizontal) cover.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    }, { passive: true });
    cover.addEventListener('touchend', () => {
      if (x0 === null) return;
      x0 = null;
      cover.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1), opacity .32s';
      if (horizontal && Math.abs(dx) > 70) {
        const dir = dx < 0 ? -1 : 1;
        cover.style.transform = `translateX(${dir * window.innerWidth}px) rotate(${dir * 12}deg)`;
        cover.style.opacity = '0';
        if (navigator.vibrate) navigator.vibrate(10);
        setTimeout(() => {
          press(dir < 0 ? 'btn-next' : 'btn-prev');
          cover.style.transition = 'none';
          cover.style.transform = `translateX(${-dir * 60}px)`;
          requestAnimationFrame(() => { cover.style.transition = 'transform .38s cubic-bezier(.2,.8,.2,1), opacity .38s'; cover.style.transform = ''; cover.style.opacity = ''; });
        }, 220);
      } else {
        cover.style.transform = '';
      }
    });
  }

  // mini player progress line. From the app's player, which on Android is the native one's stand-in
  // (mobile/native-audio.ts): the <audio> element itself plays nothing there, and the line stood still.
  const followProgress = () => {
    const audio = window.UrielCore && window.UrielCore.audio;
    if (!audio) return;
    const tick = () => {
      if (document.hidden) return;
      const p = audio.duration ? audio.currentTime / audio.duration : 0;
      playbar.style.setProperty('--mini-progress', String(Math.max(0, Math.min(1, p))));
    };
    audio.addEventListener('timeupdate', tick);
    audio.addEventListener('emptied', tick);
    document.addEventListener('visibilitychange', tick);
  };
  if (window.UrielCore) followProgress(); else window.addEventListener('uriel:ready', followProgress, { once: true });

  // phone-only settings: the song storage limit (Storage → Offline songs) and sharing the error log (About)
  const storageGroup = document.querySelector('.settings-section[data-cat="storage"] .m3-group[data-group="offline"]') || document.querySelector('.settings-section[data-cat="storage"] .m3-group');
  const aboutGroup = document.querySelector('.settings-section[data-cat="about"] .m3-group');
  if (storageGroup) {
    const limits = [['1024', '1 GB'], ['2048', '2 GB'], ['5120', '5 GB'], ['10240', '10 GB']];
    const current = localStorage.getItem('uriel_cache_limit_mb') || '2048';
    const limitRow = document.createElement('div');
    limitRow.className = 'setting-item';
    limitRow.innerHTML = `
      <div class="setting-item-top" style="align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span class="setting-name" data-i18n>Song storage limit</span>
          <span style="font-size: calc(12px * var(--font-scale, 1)); color: var(--md-sys-color-outline);" data-i18n>Songs you play are kept for offline use. Over this limit, the ones played longest ago are removed.</span>
        </div>
      </div>
      <div class="theme-mode-toggle" style="margin-top: 10px;">
        ${limits.map(([v, l]) => `<button class="fps-cap-btn${v === current ? ' active' : ''}" data-limit="${v}">${l}</button>`).join('')}
      </div>`;
    limitRow.querySelectorAll<HTMLElement>('[data-limit]').forEach((b) => b.addEventListener('click', () => {
      localStorage.setItem('uriel_cache_limit_mb', b.dataset.limit || '2048');
      limitRow.querySelectorAll('[data-limit]').forEach((x) => x.classList.toggle('active', x === b));
      // a lower limit applies now, not only after the next download
      if (window.UrielCache) window.UrielCache.enforceLimit();
    }));
    const logRow = document.createElement('div');
    logRow.className = 'setting-item';
    logRow.innerHTML = `
      <div class="setting-item-top" style="align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span class="setting-name" data-i18n>Share error log</span>
          <span style="font-size: calc(12px * var(--font-scale, 1)); color: var(--md-sys-color-outline);" data-i18n>If something breaks, send this so it can be fixed.</span>
        </div>
        <button class="btn-pill-primary" type="button" data-i18n>Share</button>
      </div>`;
    logRow.querySelector('button')!.addEventListener('click', async () => {
      const res = await window.electronAPI.shareText('Uriel error log', window.UrielLog ? window.UrielLog.text() : 'no log');
      if (res === 'copied' && window.UrielCore) window.UrielCore.toast(translate('Log copied to clipboard'), 'info');
    });
    storageGroup.append(limitRow);
    if (aboutGroup) aboutGroup.insertBefore(logRow, aboutGroup.lastElementChild); else storageGroup.append(logRow);
  }

  // the desktop placeholder doesn't fit beside the source buttons on a phone
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  if (searchInput) { searchInput.setAttribute('data-i18n-attr', 'placeholder'); searchInput.placeholder = 'Search songs, artists…'; }

  // iPhone: lyrics on the lock screen and in the Dynamic Island (mobile/live-activity.ts)
  const trButton = document.getElementById('btn-tr-enabled');
  const trRow = trButton && trButton.closest('.setting-item');
  // the phone's own playback rows go to Tracks → Playback
  const playbackGroup = document.querySelector('.m3-group[data-group="playback"]');
  const addPlaybackRow = (row: HTMLElement) => { if (playbackGroup) playbackGroup.append(row); else if (trRow && trRow.parentElement) trRow.parentElement.insertBefore(row, trRow); };
  if (window.UrielLiveActivity && trRow) {
    const la = window.UrielLiveActivity;
    const row = document.createElement('div');
    row.className = 'setting-item';
    row.innerHTML = `
      <div class="setting-item-top" style="align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span class="setting-name" data-i18n>Lock screen &amp; Dynamic Island</span>
          <span class="la-hint" style="font-size: calc(12px * var(--font-scale, 1)); color: var(--md-sys-color-outline);" data-i18n>The song, its progress and the line being sung. Long-press the Dynamic Island for play, skip and shuffle (iOS 17).</span>
        </div>
        <button class="effect-switch-btn${la.enabled() ? ' active' : ''}" type="button" aria-label="Lock screen and Dynamic Island" data-i18n-attr="aria-label"><span class="thumb"></span></button>
      </div>`;
    // (the row's own markup, just above)
    const sw = row.querySelector('button')!;
    sw.addEventListener('click', () => {
      const on = !sw.classList.contains('active');
      sw.classList.toggle('active', on);
      la.setEnabled(on);
    });
    la.available().then((ok: boolean) => {
      if (!ok) row.querySelector('.la-hint')!.textContent = 'Turn on Live Activities for Uriel in the iPhone Settings app first (needs iOS 16.2 or newer).';
    });
    addPlaybackRow(row);
  }

  // Android: keep playing when a game or a video starts (#45). Calls still pause it (PlayerService.setMixing)
  if (document.documentElement.classList.contains('is-android') && trRow) {
    const MIX = 'uriel_mix_audio';
    const row = document.createElement('div');
    row.className = 'setting-item';
    row.innerHTML = `
      <div class="setting-item-top" style="align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span class="setting-name" data-i18n>Play alongside other apps</span>
          <span style="font-size: calc(12px * var(--font-scale, 1)); color: var(--md-sys-color-outline);" data-i18n>Keep the music going when a game or a video starts. Calls still pause it.</span>
        </div>
        <button class="effect-switch-btn${localStorage.getItem(MIX) === '1' ? ' active' : ''}" type="button" aria-label="Play alongside other apps" data-i18n-attr="aria-label"><span class="thumb"></span></button>
      </div>`;
    const sw = row.querySelector('button')!;
    sw.addEventListener('click', () => {
      const on = !sw.classList.contains('active');
      sw.classList.toggle('active', on);
      localStorage.setItem(MIX, on ? '1' : '0');
    });
    addPlaybackRow(row);
  }

  // Android: the visualizer, off unless switched on here. The native player sends its bars (PlayerService.setVisualizer):
  // a wave behind the mini player, and the one in full-screen lyrics
  if (document.documentElement.classList.contains('is-android')) {
    const VIZ = 'uriel_phone_viz';
    const on = localStorage.getItem(VIZ) === '1';
    document.body.classList.toggle('phone-viz', on);
    const row = document.createElement('div');
    row.className = 'setting-item';
    row.innerHTML = `
      <div class="setting-item-top" style="align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span class="setting-name" data-i18n>Visualizer</span>
          <span style="font-size: calc(12px * var(--font-scale, 1)); color: var(--md-sys-color-outline);" data-i18n>Bars that move with the music behind the mini player and in full-screen lyrics. Uses a little more battery.</span>
        </div>
        <button class="effect-switch-btn${on ? ' active' : ''}" type="button" aria-label="Visualizer" data-i18n-attr="aria-label"><span class="thumb"></span></button>
      </div>`;
    const sw = row.querySelector('button')!;
    sw.addEventListener('click', () => {
      const next = !sw.classList.contains('active');
      sw.classList.toggle('active', next);
      localStorage.setItem(VIZ, next ? '1' : '0');
      document.body.classList.toggle('phone-viz', next);
      window.dispatchEvent(new Event('uriel:phone-viz'));
    });
    // beside the computer's own visualizer setting, which phones don't show
    const desktopRow = document.getElementById('btn-bar-wave')?.closest('.setting-item');
    if (desktopRow && desktopRow.parentElement) desktopRow.after(row);
    else addPlaybackRow(row);
  }

  // Android: let Uriel off battery optimization so the phone doesn't stop it in the background (media-controls.ts)
  if (window.UrielBackground && trRow) {
    const bg = window.UrielBackground;
    const row = document.createElement('div');
    row.className = 'setting-item';
    row.innerHTML = `
      <div class="setting-item-top" style="align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span class="setting-name" data-i18n>Play in the background</span>
          <span style="font-size: calc(12px * var(--font-scale, 1)); color: var(--md-sys-color-outline);" data-i18n>Some phones stop apps to save battery, even while music plays. Allow Uriel to keep running.</span>
        </div>
        <button class="btn-pill-primary" type="button" data-i18n>Allow</button>
      </div>`;
    const btn = row.querySelector('button')!;
    const refresh = () => bg.allowed().then((ok) => { btn.textContent = ok ? 'Allowed' : 'Allow'; btn.disabled = ok; });
    btn.addEventListener('click', () => bg.allow().then(refresh));
    // some phones send you to the battery list in Settings instead of asking
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    refresh();
    addPlaybackRow(row);
  }

  // Android: the song in the island at the top of the screen, as an Android 16 live update (media-controls.ts).
  // vivo's Origin Island and OPPO's Fluid Cloud only take music apps on their maker's list; a live update they take
  // from any app. Xiaomi's Super Island and Samsung's Now Bar show the playback notification already: no row there.
  if (window.UrielIsland && trRow) {
    const isl = window.UrielIsland;
    isl.status().then((s) => {
      if (!s.vendor || s.vendor === 'xiaomi' || s.vendor === 'samsung' || (!s.supported && s.vendor !== 'vivo')) return;
      const names: Record<string, string> = { vivo: 'Origin Island', oplus: 'Fluid Cloud' };
      const name = names[s.vendor] || 'Song in the status bar';
      const abouts: Record<string, string> = {
        vivo: 'The song in the Origin Island at the top of the screen. vivo’s music capsule only takes apps on vivo’s list, so Uriel shows there as a live update.',
        oplus: 'The song in Fluid Cloud at the top of the screen, as a live update.',
      };
      const about = abouts[s.vendor] || 'The song as a live update in the status bar.';
      const row = document.createElement('div');
      row.className = 'setting-item';
      row.innerHTML = `
        <div class="setting-item-top" style="align-items: center;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span class="setting-name">${name}</span>
            <span class="island-hint" style="font-size: calc(12px * var(--font-scale, 1)); color: var(--md-sys-color-outline);"></span>
            <button class="btn-pill-primary island-fix" type="button" style="align-self: flex-start; margin-top: 6px; display: none;"></button>
          </div>
          <button class="effect-switch-btn" type="button" aria-label="${name}"><span class="thumb"></span></button>
        </div>`;
      // (the row's own markup, just above)
      const hint = row.querySelector<HTMLElement>('.island-hint')!;
      const fix = row.querySelector<HTMLElement>('.island-fix')!;
      const sw = row.querySelector<HTMLElement>('.effect-switch-btn')!;
      const show = (st: IslandStatus) => {
        if (!st.supported) {
          // OriginOS 5 and older: no live updates yet
          hint.textContent = 'Needs OriginOS 6 (Android 16). vivo’s own music capsule only takes apps on vivo’s list.';
          sw.style.display = 'none';
          return;
        }
        const on = isl.enabled(st);
        sw.classList.toggle('active', on);
        let need = '';
        if (on && !st.notifications) { need = ' Allow Uriel’s notifications for it.'; fix.textContent = 'Allow'; }
        else if (on && !st.promoted) {
          need = st.vendor === 'oplus' ? ' Turn on “Show Live Updates on Live Alerts” for Uriel in the phone’s settings.'
            : ' Live updates are turned off for Uriel in the phone’s settings.';
          fix.textContent = 'Settings';
        }
        hint.textContent = about + need;
        fix.style.display = need ? '' : 'none';
      };
      const refresh = () => isl.status().then(show);
      sw.addEventListener('click', () => {
        const on = !sw.classList.contains('active');
        isl.setEnabled(on);
        // turning it on asks for what's missing right away
        (on ? isl.allow() : isl.status()).then(show);
      });
      fix.addEventListener('click', () => isl.allow().then(show));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); isl.refresh(); } });
      show(s);
      addPlaybackRow(row);
    });
  }

})();

// a write to the phone's storage failed (usually: storage full); say so instead of losing it silently
(() => {
  let last = 0;
  window.addEventListener('uriel:storage-error', () => {
    if (Date.now() - last < 30000 || !window.UrielCore || !window.UrielCore.toast) return;
    last = Date.now();
    window.UrielCore.toast(translate('Could not save to storage. Is your phone full?'), 'error');
  });
})();
