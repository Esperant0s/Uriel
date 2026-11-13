// @ts-check
// Lyrics around the player: the fullscreen karaoke (seek bar, the cover's colors moving behind the lyrics, its
// settings), lyrics under the mini player on computers, which site is asked first (LRCLIB or Genius) and word
// timings for word-by-word karaoke. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
window.UrielApp.lyrics = function ({ state, formatDuration, el, updateMediaPositionState, rgbToHsl, hexToRgb, hslToHex, getTrackThumbUrl, isPhoneApp, resetTvIdleTimer, getAdv, getLineStartTime, getLineEndTime, escapeHtml, fetchAndApplyTranslation, renderLyricsView, updateSyncedLyricsHighlight, loadSyncedLyrics, wireSettingDropdown, getTvIdleTimer }, out) {
  Object.assign(out, {
    miniLyricsShown, updateMiniLyricsHighlight, renderMiniLyrics, lyricsSourcePref, fetchAndUpgradeWords, lyricWordSpans, lineTimedWords, timedWordIndex, setTvkAmbient, syncTvkAmbientPlayback, syncTvkProgress,
  });

  // ---- fullscreen karaoke: seek bar, moving cover colors behind the lyrics, settings from the top edge ----
  var tvkSeekDragging = false;
  function syncTvkProgress(cur, dur) {
    const slider = /** @type {HTMLInputElement | null} */ (document.getElementById('tvk-seek-slider'));
    const curEl = document.getElementById('tvk-time-current');
    const durEl = document.getElementById('tvk-time-duration');
    if (!dur || !Number.isFinite(dur)) dur = (state.currentTrack && Number(state.currentTrack.duration)) || 0;
    if (curEl && !tvkSeekDragging) { const t = formatDuration(cur || 0); if (curEl.textContent !== t) curEl.textContent = t; }
    if (durEl) { const d = formatDuration(dur || 0); if (durEl.textContent !== d) durEl.textContent = d; }
    if (slider && !tvkSeekDragging && dur > 0) {
      const v = String(Math.round(Math.max(0, Math.min(1, (cur || 0) / dur)) * 1000));
      if (slider.value !== v) slider.value = v;
    }
  }
  (function setupTvkSeek() {
    const slider = /** @type {HTMLInputElement | null} */ (document.getElementById('tvk-seek-slider'));
    if (!slider) return;
    const durNow = () => {
      const a = el.nativeAudio;
      return a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : ((state.currentTrack && Number(state.currentTrack.duration)) || 0);
    };
    slider.addEventListener('pointerdown', () => { tvkSeekDragging = true; });
    slider.addEventListener('input', () => {
      tvkSeekDragging = true;
      const t = (Number(slider.value) / 1000) * durNow();
      const curEl = document.getElementById('tvk-time-current');
      if (curEl) curEl.textContent = formatDuration(t);
    });
    slider.addEventListener('change', () => {
      const dur = durNow();
      const t = (Number(slider.value) / 1000) * dur;
      if (el.nativeAudio && dur > 0 && Number.isFinite(t)) {
        el.nativeAudio.currentTime = t;
        updateMediaPositionState();
      }
      tvkSeekDragging = false;
    });
    slider.addEventListener('pointerup', () => { setTimeout(() => { tvkSeekDragging = false; }, 0); });
    // the slider must not start a lyrics drag or hide the controls
    slider.addEventListener('mousemove', (e) => e.stopPropagation());
  })();

  var tvkAmbientCover = null;
  var tvkPaletteCache = new Map();
  function extractCoverPalette(src) {
    const mono = [[22, 22, 26], [34, 34, 40], [48, 48, 56], [28, 28, 34], [42, 42, 50], [18, 18, 22], [58, 58, 68], [30, 30, 36], [40, 40, 46], [25, 25, 30]];
    if (!src) return Promise.resolve(mono);
    if (tvkPaletteCache.has(src)) return Promise.resolve(tvkPaletteCache.get(src));
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        let out = mono;
        try {
          const c = document.createElement('canvas');
          c.width = 40;
          c.height = 40;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, 40, 40);
          const data = ctx.getImageData(0, 0, 40, 40).data;
          const colorful = [];
          for (let i = 0; i < data.length; i += 8) {
            const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
            if (hsl.l >= 12 && hsl.l <= 88 && hsl.s >= 18) colorful.push({ h: hsl.h, s: hsl.s, l: hsl.l, weight: (hsl.s / 100) * (1 - Math.abs(hsl.l - 50) / 55) });
          }
          if (colorful.length < 12) {
            out = [];
            for (let k = 0; k < 10; k++) { const v = 18 + Math.round((k / 9) * 52); out.push([v, v, Math.min(255, v + 3)]); }
          } else {
            colorful.sort((a, b) => b.weight - a.weight);
            const picked = [];
            for (let minHue = 22; picked.length < 6 && minHue >= 4; minHue -= 6) {
              for (const p of colorful) {
                if (picked.length >= 6) break;
                if (!picked.some((q) => Math.min(Math.abs(q.h - p.h), 360 - Math.abs(q.h - p.h)) < minHue && Math.abs(q.l - p.l) < 15)) picked.push(p);
              }
            }
            out = [];
            for (let i = 0; i < 10; i++) {
              const base = picked[i % picked.length];
              const shift = i >= picked.length ? (i % 2 === 0 ? 10 : -10) : 0;
              const rgb = hexToRgb(hslToHex(base.h, Math.max(35, Math.min(88, base.s)), Math.max(22, Math.min(56, base.l + shift))));
              out.push([rgb.r, rgb.g, rgb.b]);
            }
          }
        } catch (e) { out = mono; }
        if (tvkPaletteCache.size >= 80) tvkPaletteCache.delete(tvkPaletteCache.keys().next().value);
        tvkPaletteCache.set(src, out);
        resolve(out);
      };
      img.onerror = () => resolve(mono);
      img.src = src;
    });
  }
  function paintTvkLayer(canvas, colors, seed) {
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const rgb = (c) => `${c[0]}, ${c[1]}, ${c[2]}`;
    const c0 = colors[0];
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, `rgb(${rgb(c0)})`);
    base.addColorStop(0.5, `rgb(${rgb(colors[1] || c0)})`);
    base.addColorStop(1, `rgb(${rgb(colors[2] || c0)})`);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const spots = [[0.12, 0.18], [0.85, 0.15], [0.22, 0.82], [0.82, 0.78], [0.48, 0.32], [0.55, 0.68], [0.18, 0.48], [0.88, 0.46], [0.36, 0.14], [0.66, 0.88]];
    for (let i = 0; i < 10; i++) {
      const [px, py] = spots[(i + seed) % spots.length];
      const col = colors[(i + seed) % colors.length] || c0;
      const r = (0.48 + (i % 3) * 0.12) * Math.max(w, h);
      const g = ctx.createRadialGradient(px * w, py * h, 0, px * w, py * h, r);
      g.addColorStop(0, `rgba(${rgb(col)}, 0.92)`);
      g.addColorStop(0.45, `rgba(${rgb(col)}, 0.48)`);
      g.addColorStop(1, `rgba(${rgb(col)}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(0, 0, w, h);
  }
  async function syncTvkAmbientBg() {
    const host = document.getElementById('tvk-ambient-bg');
    if (!host) return;
    if (!host.firstElementChild) host.innerHTML = '<canvas class="tvk-liquid-layer" width="96" height="54"></canvas><canvas class="tvk-liquid-layer tvk-liquid-layer-b" width="96" height="54"></canvas>';
    const thumb = state.currentTrack ? getTrackThumbUrl(state.currentTrack) : '';
    if (thumb === tvkAmbientCover) return;
    tvkAmbientCover = thumb;
    const colors = await extractCoverPalette(thumb);
    if (tvkAmbientCover !== thumb) return;
    const [a, b] = host.querySelectorAll('canvas');
    paintTvkLayer(a, colors, 0);
    paintTvkLayer(b, colors, 5);
  }
  function setTvkAmbient(on) {
    const tv = el.tvKaraoke || document.getElementById('tv-karaoke');
    if (!tv) return;
    tv.classList.toggle('tvk-ambient-on', !!on);
    if (on) syncTvkAmbientBg();
  }
  // the drifting layers only move while fullscreen karaoke is on screen
  function syncTvkAmbientPlayback() {
    const tv = el.tvKaraoke || document.getElementById('tv-karaoke');
    if (!tv) return;
    tv.classList.toggle('tvk-bg-paused', !state.isTvKaraokeOpen || tv.classList.contains('hidden') || document.hidden || isPhoneApp);
  }
  document.addEventListener('visibilitychange', syncTvkAmbientPlayback);

  (function setupTvkTopHover() {
    const zone = document.getElementById('tvk-top-hover-zone');
    const panel = document.getElementById('tvk-panel');
    const btnSettings = document.getElementById('btn-tvk-settings');
    if (!zone || !panel || isPhoneApp) return;
    let closeTimer = null;
    const open = () => {
      clearTimeout(closeTimer);
      if (panel.classList.contains('open')) return;
      panel.classList.add('open');
      panel.dataset.hoverOpened = '1';
      if (btnSettings) btnSettings.classList.add('open');
      if (el.tvKaraoke) el.tvKaraoke.classList.remove('tv-idle');
      clearTimeout(getTvIdleTimer());
    };
    const scheduleClose = () => {
      clearTimeout(closeTimer);
      if (panel.dataset.hoverOpened !== '1') return;
      closeTimer = setTimeout(() => {
        const font = document.getElementById('tvk-font-dropdown');
        if (font && font.classList.contains('open')) return;
        panel.classList.remove('open');
        delete panel.dataset.hoverOpened;
        if (btnSettings) btnSettings.classList.remove('open');
        resetTvIdleTimer();
      }, 320);
    };
    zone.addEventListener('mouseenter', open);
    zone.addEventListener('mouseleave', scheduleClose);
    panel.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    panel.addEventListener('mouseleave', scheduleClose);
    // opened by the gear: stays until closed the usual way
    if (btnSettings) btnSettings.addEventListener('click', () => { delete panel.dataset.hoverOpened; });
  })();

  // ---- lyrics under the mini player (desktop) ----
  var miniLyricsLastIdx = -2;
  function miniLyricsShown() {
    return document.body.classList.contains('mini') && document.body.classList.contains('mini-lyrics-on');
  }
  function renderMiniLyrics() {
    const box = document.getElementById('mini-lyrics-container');
    if (!box) return;
    miniLyricsLastIdx = -2;
    const lines = state.syncedLyrics || [];
    if (!lines.length) { box.innerHTML = '<div class="mini-lyrics-empty">No lyrics</div>'; return; }
    box.innerHTML = '';
    const words = getAdv('karaoke_words', true) && state.lyricsMode === 'word';
    lines.forEach((line, index) => {
      const div = document.createElement('div');
      div.className = 'mini-lyric-line';
      div.id = `mini-lyric-line-${index}`;
      div.setAttribute('dir', 'auto');
      if (words) div.innerHTML = lyricWordSpans(line);
      else div.textContent = line.text || '';
      if (line.time >= 0) div.addEventListener('click', () => { const t = getLineStartTime(index); if (el.nativeAudio && t >= 0) el.nativeAudio.currentTime = t; });
      box.appendChild(div);
    });
    if (miniLyricsShown() && el.nativeAudio) updateMiniLyricsHighlight(el.nativeAudio.currentTime || 0);
  }
  function updateMiniLyricsHighlight(currentTime) {
    const lines = state.syncedLyrics || [];
    const box = document.getElementById('mini-lyrics-container');
    if (!box || !lines.length || !state.isWindowVisible || !miniLyricsShown()) return;
    const t = currentTime + (state.isCustomLyrics ? 0.25 : 0);
    let active = -1;
    for (let i = 0; i < lines.length; i++) {
      const start = getLineStartTime(i);
      if (start >= 0 && start <= t) active = i;
      else if (start > t) break;
    }
    if (active !== miniLyricsLastIdx) {
      const prev = box.querySelector('.mini-lyric-line.active');
      if (prev) {
        prev.classList.remove('active');
        prev.querySelectorAll('.lyric-word').forEach((w) => { w.className = 'lyric-word past-word'; });
      }
      const cur = active >= 0 ? document.getElementById(`mini-lyric-line-${active}`) : null;
      if (cur) {
        cur.classList.add('active');
        const top = box.scrollTop + cur.getBoundingClientRect().top - box.getBoundingClientRect().top;
        box.scrollTo({ top: Math.max(0, top - box.clientHeight / 2 + cur.clientHeight / 2), behavior: document.body.classList.contains('perf') ? 'auto' : 'smooth' });
      }
      miniLyricsLastIdx = active;
    }
    if (active < 0) return;
    const cur = document.getElementById(`mini-lyric-line-${active}`);
    const spans = cur ? cur.querySelectorAll('.lyric-word') : [];
    if (!spans.length) return;
    const timed = lineTimedWords(lines[active]);
    let idx;
    if (timed && timed.length === spans.length) idx = timedWordIndex(timed, t);
    else {
      const start = getLineStartTime(active);
      const p = Math.min(0.999, Math.max(0, (t - start) / Math.max(0.5, getLineEndTime(active) - start)));
      idx = Math.floor(p * spans.length);
    }
    spans.forEach((w, i) => { w.className = i < idx ? 'lyric-word past-word' : i === idx ? 'lyric-word active-word' : 'lyric-word'; });
  }
  (function setupMiniLyrics() {
    const btn = document.getElementById('btn-mini-lyrics');
    const wanted = () => localStorage.getItem('uriel_mini_lyrics') === '1';
    const sync = () => {
      const on = document.body.classList.contains('mini') && wanted();
      document.body.classList.toggle('mini-lyrics-on', on);
      if (btn) btn.classList.toggle('active', on);
      if (on) renderMiniLyrics();
    };
    // the mini window is a body class set on resize (checkCompactLayout); follow it
    new MutationObserver(() => {
      const on = document.body.classList.contains('mini') && wanted();
      if (on !== document.body.classList.contains('mini-lyrics-on')) sync();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    sync();
    if (btn) btn.addEventListener('click', async () => {
      const next = !wanted();
      localStorage.setItem('uriel_mini_lyrics', next ? '1' : '0');
      if (window.electronAPI && window.electronAPI.setMiniLyrics) {
        try { await window.electronAPI.setMiniLyrics(next); } catch (e) {}
      }
      sync();
    });
  })();


  // ---- lyrics source (LRCLIB or Genius first) and word timings for word-by-word karaoke ----
  function lyricsSourcePref() { return localStorage.getItem('uriel_lyrics_source') === 'genius' ? 'genius' : 'lrclib'; }
  var CJK_WORD = /[぀-ヿ㐀-䶿一-鿿가-힯]/;
  // the words to show for a line, with their times when the line has them (null: no times)
  function lineTimedWords(line) {
    if (!line || !Array.isArray(line.words) || !line.words.length || !window.UrielLyricsSources) return null;
    if (line._timedFor !== line.words) {
      line._timed = window.UrielLyricsSources.timedWords(line.text, line.words);
      line._timedFor = line.words;
    }
    return line._timed;
  }
  // the word being sung at time t: the first one that hasn't finished yet
  function timedWordIndex(timed, t) {
    for (let i = 0; i < timed.length; i++) if (t < timed[i].end) return i;
    return timed.length;
  }
  function lyricWordSpans(line) {
    const timed = lineTimedWords(line);
    const words = timed ? timed.map((w) => w.text) : String(line.text || '').replace(/<[^>]+>/g, '').trim().split(/\s+/).filter(Boolean);
    return words.map((w, i) => {
      const sep = i === 0 || (CJK_WORD.test(w) && CJK_WORD.test(words[i - 1])) ? '' : ' ';
      return `${sep}<span class="lyric-word" data-word-idx="${i}">${escapeHtml(w)}</span>`;
    }).join('');
  }
  var wordsSessionCache = new Map();
  async function fetchAndUpgradeWords(title, artist, token) {
    const source = localStorage.getItem('uriel_word_source') || 'auto';
    const S = window.UrielLyricsSources;
    if (source === 'estimate' || !S || state.isCustomLyrics || !getAdv('online_lyrics', true)) return;
    // only word-by-word karaoke uses them: no lookup for line mode
    if (state.lyricsMode !== 'word' || !getAdv('karaoke_words', true)) return;
    const lines = state.syncedLyrics;
    if (!lines.length) return;
    // "Auto" keeps word times the lyrics brought themselves
    if (source === 'auto' && lines.some((l) => Array.isArray(l.words) && l.words.length)) return;
    const dur = Math.round(Number(state.currentTrack && state.currentTrack.duration) || (el.nativeAudio && el.nativeAudio.duration) || 0);
    const key = `${artist}\u0000${title}`;
    let data = wordsSessionCache.get(key);
    if (!data || (data.failed && Date.now() - data.at > 10 * 60 * 1000)) {
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/lyrics-words?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}${dur ? `&duration=${dur}` : ''}`);
        const json = await res.json();
        data = json && json.success && Array.isArray(json.lines) && json.lines.length ? { lines: json.lines } : { failed: true, at: Date.now() };
      } catch (e) {
        data = { failed: true, at: Date.now() };
      }
      wordsSessionCache.set(key, data);
      if (wordsSessionCache.size > 100) wordsSessionCache.delete(wordsSessionCache.keys().next().value);
    }
    if (token !== state.loadToken || state.syncedLyrics !== lines || !data.lines) return;
    if (lines.some((l) => l.time >= 0)) {
      const aligned = S.alignWordTimings(lines, data.lines);
      if (!aligned) return;
      aligned.forEach((words, i) => { if (words) lines[i].words = words; });
    } else {
      // plain lyrics: NetEase's timed lines take their place, when they are the same lyrics
      const ok = data.lines.filter((wl) => lines.some((l) => S.lineSimilarity(l.text, wl.text) >= 0.6)).length / data.lines.length >= 0.6;
      if (!ok) return;
      state.syncedLyrics = data.lines.map((l) => ({ time: l.start, text: l.text, words: l.words }));
      window.dispatchEvent(new Event('uriel:lyrics'));
      if (el.lyricsStatus) el.lyricsStatus.textContent = 'Synced';
      if (state.trActive) fetchAndApplyTranslation();
    }
    renderLyricsView();
    renderMiniLyrics();
    if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
  }
  var reloadLyrics = () => { if (state.currentTrack) loadSyncedLyrics(state.currentTrack.title, state.currentTrack.artist, state.loadToken); };
  wireSettingDropdown('lyrics-source', 'uriel_lyrics_source', 'lrclib', reloadLyrics);
  wireSettingDropdown('word-source', 'uriel_word_source', 'auto', reloadLyrics);

};
