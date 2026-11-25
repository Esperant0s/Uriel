// @ts-check
// Plugins (computers: JavaScript files in the plugins folder, run with the Uriel API). Part of app.js, which calls
// this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.plugins = function ({ showToast, Tm, state, el, T }, /** @type {UrielPluginsPart} */ out) {
  /** @type {UrielPluginsPart} */
  const api = {
    emitPluginEvent, reloadPluginsList, stopAllPlugins, renderPluginCards, loadPlugins,
  };
  Object.assign(out, api);

  const loadedPlugins = new Map();
  /** @type {{ file: string, event: string, cb: (data: unknown) => void }[]} */
  const pluginListeners = [];
  function emitPluginEvent(/** @type {string} */ event, /** @type {unknown} */ data) {
    pluginListeners.filter((l) => l.event === event).forEach((l) => { try { l.cb(data); } catch (e) { reportPluginError(l.file, e); } });
  }
  function reportPluginError(/** @type {string} */ file, /** @type {unknown} */ e) {
    console.error('[plugin ' + file + ']', e);
    showToast(Tm('Plugin {0} failed: {1}', file, e instanceof Error && e.message ? e.message : e), 'error');
  }
  function createPluginApi(/** @type {UrielPluginInfo} */ p) {
    const prefix = `uriel_plugin_${p.file}_`;
    return {
      plugin: { file: p.file, name: p.name, author: p.author, version: p.version },
      on(/** @type {string} */ event, /** @type {(data: unknown) => void} */ cb) {
        const l = { event, cb, file: p.file };
        pluginListeners.push(l);
        return () => { const i = pluginListeners.indexOf(l); if (i >= 0) pluginListeners.splice(i, 1); };
      },
      toast: (/** @type {unknown} */ message, /** @type {string} */ type) => showToast(String(message), type || 'info'),
      addStyle(/** @type {string} */ css) {
        const s = document.createElement('style');
        s.dataset.urielCustom = 'plugin';
        s.dataset.plugin = p.file;
        s.textContent = css;
        document.head.appendChild(s);
        return () => s.remove();
      },
      storage: {
        get: (/** @type {string} */ k, /** @type {unknown} */ d) => { const v = localStorage.getItem(prefix + k); try { return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set: (/** @type {string} */ k, /** @type {unknown} */ v) => localStorage.setItem(prefix + k, JSON.stringify(v))
      },
      getTrack: () => state.currentTrack,
      isPlaying: () => state.isPlaying,
      audio: () => el.nativeAudio,
      query: (/** @type {string} */ sel) => document.querySelector(sel)
    };
  }
  function runPlugin(/** @type {UrielPluginInfo} */ p) {
    if (loadedPlugins.has(p.file)) return;
    try {
      const api = createPluginApi(p);
      const fn = new Function('Uriel', 'plugin', `${p.code}\n//# sourceURL=uriel-plugin-${p.file}`);
      const result = fn(api, api.plugin);
      loadedPlugins.set(p.file, { stop: result && typeof result.stop === 'function' ? result.stop : null });
    } catch (e) { reportPluginError(p.file, e); }
  }
  function stopPlugin(/** @type {UrielPluginInfo} */ p, /** @type {boolean} */ silent) {
    const entry = loadedPlugins.get(p.file);
    try { if (entry && entry.stop) entry.stop(); } catch (e) { reportPluginError(p.file, e); }
    for (let i = pluginListeners.length - 1; i >= 0; i--) if (pluginListeners[i].file === p.file) pluginListeners.splice(i, 1);
    document.querySelectorAll(`style[data-plugin="${p.file}"]`).forEach((n) => n.remove());
    const hadStop = !!(entry && entry.stop);
    loadedPlugins.delete(p.file);
    if (!silent && !hadStop) showToast(Tm('Restart Uriel to fully unload "{0}"', p.name), 'info');
  }
  /** @type {UrielPluginInfo[]} */
  let pluginsCache = [];
  function renderPluginCards() {
    const list = document.getElementById('plugins-list');
    if (!list) return;
    list.innerHTML = '';
    if (!pluginsCache.length) {
      const empty = document.createElement('div');
      empty.className = 'ct-empty';
      empty.textContent = 'No plugins. Put .js files into the plugins folder or click Add.';
      empty.dataset.i18n = '';
      list.appendChild(empty);
      return;
    }
    pluginsCache.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'ct-card plugin-card';
      card.innerHTML = '<div class="ct-info"><div class="ct-name"></div><div class="ct-meta"></div></div><button class="btn-icon-pill ct-remove" title="Delete file" data-i18n-attr="title"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button><button class="effect-switch-btn"><span class="thumb"></span></button>';
      (/** @type {HTMLElement} */ (card.querySelector('.ct-name'))).textContent = p.wrongExt ? p.file : `${p.name}${p.version ? ' v' + p.version : ''}`;
      (/** @type {HTMLElement} */ (card.querySelector('.ct-meta'))).textContent = p.wrongExt
        ? T('Rename it to end in .js')
        : [p.author && `by ${p.author}`, p.description, p.file].filter(Boolean).join(' · ');
      const toggle = /** @type {HTMLElement} */ (card.querySelector('.effect-switch-btn'));
      if (p.wrongExt) toggle.remove();
      toggle.classList.toggle('active', !!p.enabled);
      toggle.addEventListener('click', () => {
        p.enabled = !p.enabled;
        toggle.classList.toggle('active', p.enabled);
        pluginsApi.setPluginEnabled(p.file, p.enabled);
        if (p.enabled) runPlugin(p); else stopPlugin(p, false);
      });
      (/** @type {HTMLElement} */ (card.querySelector('.ct-remove'))).addEventListener('click', () => {
        stopPlugin(p, true);
        pluginsApi.removePlugin(p.file);
        pluginsCache = pluginsCache.filter((x) => x.file !== p.file);
        renderPluginCards();
        showToast(Tm('Plugin file deleted'), 'info');
      });
      list.appendChild(card);
    });
  }
  async function loadPlugins() {
    if (!window.electronAPI || !window.electronAPI.listPlugins) return;
    pluginsCache = await window.electronAPI.listPlugins();
    pluginsCache.filter((p) => p.enabled).forEach(runPlugin);
    renderPluginCards();
  }
  // the plugin calls are only on computers; the plugin cards and buttons only show when listPlugins is there
  const pluginsApi = /** @type {UrielDesktopApi} */ (window.electronAPI);
  async function reloadPluginsList() {
    if (pluginsApi && pluginsApi.listPlugins) {
      pluginsCache = await pluginsApi.listPlugins();
      const present = new Set(pluginsCache.map((x) => x.file));
      [...loadedPlugins.keys()].filter((f) => !present.has(f)).forEach((f) => stopPlugin({ file: f, name: f }, true));
    }
    renderPluginCards();
  }
  if (pluginsApi && pluginsApi.listPlugins) {
    (/** @type {HTMLElement} */ (document.getElementById('btn-plugins-folder'))).addEventListener('click', () => pluginsApi.openPluginsFolder());
    (/** @type {HTMLElement} */ (document.getElementById('btn-plugins-reload'))).addEventListener('click', reloadPluginsList);
    (/** @type {HTMLElement} */ (document.getElementById('btn-add-plugin'))).addEventListener('click', async () => {
      const added = await pluginsApi.importPlugins();
      if (!added) return;
      pluginsCache = await pluginsApi.listPlugins();
      renderPluginCards();
      showToast(added > 1 ? Tm('Added {0} plugins. Turn one on to run it', added) : Tm('Added 1 plugin. Turn it on to run it'), 'info');
    });
  }

  function stopAllPlugins() { pluginsCache.forEach((p) => { p.enabled = false; stopPlugin(p, true); }); }
};
