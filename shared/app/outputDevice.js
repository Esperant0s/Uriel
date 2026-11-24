// @ts-check
// Settings > Tracks > Output device (from Riff 43.1; computers). The song plays through the Web Audio graph when
// it is set up and through the <audio> element before that, so both get the device. A device that disappears
// while it plays (headphones unplugged) pauses the song instead of letting it go on from the speakers.
// Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.outputDevice = function ({ audioEngine, el, isPhoneApp, showToast, state, T, Tf, Tm, updateTvkOutput }) {
  const OUTPUT_DEVICE_KEY = 'uriel_audio_output_device';
  const canPickOutput = !isPhoneApp && !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) && !!el.nativeAudio && typeof el.nativeAudio.setSinkId === 'function';
  let outputDeviceId = (() => { try { return localStorage.getItem(OUTPUT_DEVICE_KEY) || ''; } catch (e) { return ''; } })();
  /** @type {Set<string> | null} */
  let knownOutputIds = null;
  async function applyOutputDevice() {
    if (!canPickOutput) return;
    const id = outputDeviceId === 'default' ? '' : outputDeviceId;
    try { if (el.nativeAudio.sinkId !== id) await el.nativeAudio.setSinkId(id); } catch (e) { console.warn('Output device:', e instanceof Error ? e.message : e); }
    const ctx = audioEngine && audioEngine.ctx;
    try { if (ctx && typeof ctx.setSinkId === 'function' && (ctx.sinkId || '') !== id) await ctx.setSinkId(id); } catch (e) {}
  }
  async function listOutputDevices() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput'); } catch (e) { return []; }
  }
  async function renderOutputDevices() {
    const menu = document.getElementById('audio-output-menu');
    const label = document.getElementById('audio-output-label');
    if (!canPickOutput || !menu) return;
    const devices = (await listOutputDevices()).filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
    knownOutputIds = new Set(devices.map((d) => d.deviceId));
    menu.textContent = '';
    const add = (/** @type {string} */ value, /** @type {string} */ text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm3-dropdown-option' + ((outputDeviceId || '') === value ? ' selected' : '');
      b.dataset.value = value;
      b.textContent = text;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        outputDeviceId = value;
        try { if (value) localStorage.setItem(OUTPUT_DEVICE_KEY, value); else localStorage.removeItem(OUTPUT_DEVICE_KEY); } catch (_) {}
        document.getElementById('audio-output-dropdown')?.classList.remove('open');
        renderOutputDevices();
        applyOutputDevice().then(() => updateTvkOutput());
      });
      menu.appendChild(b);
      if ((outputDeviceId || '') === value && label) label.textContent = text;
    };
    add('', T('System default'));
    devices.forEach((d, i) => add(d.deviceId, (d.label || '').replace(/^Default\s*[-–—:]\s*/i, '').trim() || Tf('Output {0}', i + 1)));
    // the saved device is not connected now: shown as itself, played on the system default until it is back
    if (outputDeviceId && !knownOutputIds.has(outputDeviceId)) add(outputDeviceId, T('Saved device (not connected)'));
  }
  if (canPickOutput) {
    const row = document.getElementById('setting-audio-output-row');
    if (row) row.hidden = false;
    const dd = document.getElementById('audio-output-dropdown');
    const trigger = document.getElementById('audio-output-trigger');
    if (dd && trigger) {
      trigger.addEventListener('click', (e) => { e.stopPropagation(); renderOutputDevices(); dd.classList.toggle('open'); });
      document.addEventListener('click', () => dd.classList.remove('open'));
    }
    renderOutputDevices();
    if (outputDeviceId) applyOutputDevice();
    // the Web Audio graph is made on the first play: it gets the device then
    el.nativeAudio.addEventListener('playing', () => { if (outputDeviceId) applyOutputDevice(); });
  }

  // Following the system's output, headphones going away must pause too, not carry on out loud from the speakers (#32).
  // On Windows and macOS the "default" entry shares a groupId with the real device it stands for. On Linux its groupId
  // is just "default", so which device was in use is unknown and any device going away pauses: pausing needlessly when
  // another device is unplugged beats suddenly playing out loud.
  /** @type {MediaDeviceInfo[] | null} */
  let lastOutputs = null;
  if (canPickOutput) listOutputDevices().then((list) => { lastOutputs = list; });
  function defaultOutputLost(/** @type {MediaDeviceInfo[] | null} */ before, /** @type {MediaDeviceInfo[]} */ after) {
    if (!before) return false;
    const realOf = (/** @type {MediaDeviceInfo[]} */ list) => list.filter((/** @type {MediaDeviceInfo} */ d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
    const was = realOf(before);
    const now = realOf(after);
    const def = before.find((/** @type {MediaDeviceInfo} */ d) => d.deviceId === 'default');
    const group = def && def.groupId;
    if (group && was.some((/** @type {MediaDeviceInfo} */ d) => d.groupId === group)) return !now.some((/** @type {MediaDeviceInfo} */ d) => d.groupId === group);
    return was.some((/** @type {MediaDeviceInfo} */ d) => !now.some((/** @type {MediaDeviceInfo} */ n) => n.deviceId === d.deviceId));
  }
  if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      updateTvkOutput();
      if (!canPickOutput) return;
      const before = knownOutputIds;
      const outputs = await listOutputDevices();
      const now = new Set(outputs.map((d) => d.deviceId).filter((id) => id && id !== 'default' && id !== 'communications'));
      const lostChosen = !!outputDeviceId && !!before && before.has(outputDeviceId) && !now.has(outputDeviceId);
      const lostDefault = !outputDeviceId && defaultOutputLost(lastOutputs, outputs);
      lastOutputs = outputs;
      if (state.isPlaying && (lostChosen || lostDefault) && el.nativeAudio && !el.nativeAudio.paused) {
        el.nativeAudio.pause();
        showToast(Tm('Paused: the output device was disconnected'), 'info');
      }
      renderOutputDevices();
      if (outputDeviceId && now.has(outputDeviceId)) applyOutputDevice();
    });
  }
};
