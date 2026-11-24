// @ts-check
// Per-song speed, pitch and volume, and the speed & pitch presets (issue #11; the rules are in track-audio.js).
// Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielTrackAudioPart} out */
window.UrielApp.trackAudio = function ({ applyAudioSettings, getTrackCanonicalId, initAudioContext, renderPresets, safeJson, showToast, state, syncSettingsSlidersToState, T, Tm }, out) {
  // state.audioSettings stays the global sound; a song's own tempo values (keyed by its canonical id) go over it
  /** @type {Record<string, Record<string, number>> | null} */
  var trackAudioStore = null;
  var trackAudioOnlyDraft = false; // "For this song only" switched on, nothing changed yet
  var trackAudioLastKey = '';
  function trackAudioLib() { return window.UrielTrackAudio || null; }
  function allTrackAudio() {
    if (!trackAudioStore) {
      const TA = trackAudioLib();
      const raw = safeJson('uriel_track_audio', {});
      trackAudioStore = /** @type {Record<string, Record<string, number>>} */ (TA ? TA.cleanStore(raw) : {});
    }
    return trackAudioStore;
  }
  function saveAllTrackAudio() {
    try { localStorage.setItem('uriel_track_audio', JSON.stringify(trackAudioStore || {})); } catch (e) { console.warn('Failed to save per-track audio', e); }
  }
  function trackAudioKey(/** @type {UrielTrack | null} */ track) { return track ? (getTrackCanonicalId(track) || '') : ''; }
  function ignoreTrackAudio() { try { return localStorage.getItem('uriel_ignore_track_audio') === '1'; } catch (e) { return false; } }
  function currentTrackAudio() {
    const key = trackAudioKey(state.currentTrack);
    return key ? allTrackAudio()[key] || null : null;
  }
  function effectiveAudioSettings() {
    const TA = trackAudioLib();
    if (!TA) return state.audioSettings;
    return TA.effectiveSettings(state.audioSettings, currentTrackAudio(), ignoreTrackAudio());
  }
  // a speed / pitch / volume change from a slider or a preset: the playing song's own, or the global one
  function setTempoValues(/** @type {Record<string, number>} */ values) {
    const TA = trackAudioLib();
    const key = trackAudioKey(state.currentTrack);
    const perTrack = TA && key && !ignoreTrackAudio() && (trackAudioOnlyDraft || currentTrackAudio());
    if (perTrack) {
      const base = TA.normalizeEntry(currentTrackAudio() || {}, TA.normalizeEntry(state.audioSettings));
      trackAudioStore = TA.setEntry(allTrackAudio(), key, { ...base, ...values });
      trackAudioOnlyDraft = false;
      saveAllTrackAudio();
    } else {
      Object.assign(state.audioSettings, values);
    }
    renderTrackAudioControls();
  }
  function renderTrackAudioControls() {
    const sw = /** @type {HTMLButtonElement} */ (document.getElementById('toggle-track-audio'));
    const ign = document.getElementById('toggle-ignore-track-audio');
    const hint = document.getElementById('track-audio-hint');
    const ignored = ignoreTrackAudio();
    const has = !!currentTrackAudio();
    if (sw) {
      sw.classList.toggle('active', !ignored && (has || trackAudioOnlyDraft));
      sw.disabled = ignored || !state.currentTrack;
      const row = sw.closest('.setting-item');
      if (row) row.classList.toggle('is-disabled', sw.disabled);
    }
    if (ign) ign.classList.toggle('active', ignored);
    if (hint) {
      hint.textContent = !state.currentTrack ? T('Play a song to give it its own speed, pitch and volume')
        : ignored ? T('Per-track settings are ignored: every song uses the global values')
        : has ? T('This song keeps its own speed, pitch and volume')
        : T('Speed, pitch and volume changes apply to the playing song only');
    }
    renderTempoPresets();
  }
  function onTrackAudioTrackChange() {
    const key = trackAudioKey(state.currentTrack);
    if (key === trackAudioLastKey) return;
    trackAudioLastKey = key;
    trackAudioOnlyDraft = false;
    applyAudioSettings();
    syncSettingsSlidersToState();
    renderTrackAudioControls();
  }
  function customTempoPresets() {
    const TA = trackAudioLib();
    return TA ? TA.cleanPresets(safeJson('uriel_tempo_presets', [])) : [];
  }
  function renderTempoPresets() {
    const wrap = document.getElementById('tempo-preset-chips');
    const TA = trackAudioLib();
    if (!wrap || !TA) return;
    const cur = effectiveAudioSettings();
    const custom = customTempoPresets();
    wrap.innerHTML = '';
    for (const p of [...TA.BUILTIN_PRESETS, ...custom]) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-btn tempo-preset-chip' + (TA.presetMatches(p, cur) ? ' active' : '');
      const label = document.createElement('span');
      if (p.builtin) { label.textContent = T(p.name); } else { label.textContent = p.name; label.setAttribute('data-no-i18n', ''); }
      chip.appendChild(label);
      chip.addEventListener('click', () => {
        initAudioContext();
        setTempoValues(p.values);
        state.activePresetId = null;
        applyAudioSettings();
        syncSettingsSlidersToState();
        renderPresets();
      });
      if (!p.builtin) {
        const del = document.createElement('span');
        del.className = 'tempo-preset-del';
        del.setAttribute('role', 'button');
        del.setAttribute('aria-label', T('Delete preset'));
        del.title = T('Delete preset');
        del.textContent = '×';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          const list = customTempoPresets().filter((/** @type {{ id: string }} */ x) => x.id !== p.id);
          try { localStorage.setItem('uriel_tempo_presets', JSON.stringify(list)); } catch (err) {}
          renderTempoPresets();
        });
        chip.appendChild(del);
      }
      wrap.appendChild(chip);
    }
  }
  (function setupTrackAudio() {
    const sw = /** @type {HTMLButtonElement} */ (document.getElementById('toggle-track-audio'));
    const ign = document.getElementById('toggle-ignore-track-audio');
    if (sw) sw.addEventListener('click', () => {
      if (sw.disabled) return;
      const key = trackAudioKey(state.currentTrack);
      if (!key) return;
      if (currentTrackAudio() || trackAudioOnlyDraft) {
        // off: the song goes back to the global values
        trackAudioStore = trackAudioLib().setEntry(allTrackAudio(), key, null);
        trackAudioOnlyDraft = false;
        saveAllTrackAudio();
      } else {
        trackAudioOnlyDraft = true;
      }
      applyAudioSettings();
      syncSettingsSlidersToState();
      renderTrackAudioControls();
    });
    if (ign) ign.addEventListener('click', () => {
      try { localStorage.setItem('uriel_ignore_track_audio', ignoreTrackAudio() ? '0' : '1'); } catch (e) {}
      trackAudioOnlyDraft = false;
      applyAudioSettings();
      syncSettingsSlidersToState();
      renderTrackAudioControls();
    });
    window.addEventListener('storage', (e) => { if (!e.key || /uriel_track_audio$/.test(e.key)) trackAudioStore = null; });

    const saveBtn = document.getElementById('btn-save-tempo-preset');
    const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('tempo-preset-name'));
    const save = () => {
      const TA = trackAudioLib();
      if (!TA || !nameInput) return;
      const p = TA.makePreset(nameInput.value, effectiveAudioSettings());
      if (!p) { nameInput.focus(); return; }
      const list = customTempoPresets();
      list.push(p);
      try { localStorage.setItem('uriel_tempo_presets', JSON.stringify(list)); } catch (e) {}
      nameInput.value = '';
      showToast(Tm('Preset saved'), 'info');
      renderTempoPresets();
    };
    if (saveBtn) saveBtn.addEventListener('click', save);
    if (nameInput) nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    renderTrackAudioControls();
  })();

  /** @type {UrielTrackAudioPart} */
  const api = { effectiveAudioSettings, setTempoValues, onTrackAudioTrackChange };
  Object.assign(out, api);
};
