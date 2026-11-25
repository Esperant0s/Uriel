// @ts-check
// Ctrl+Shift+R turns every plugin off, for when one breaks the app. Part of app.js, which calls this once as it
// starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.themes = function ({ Tm, showToast, stopAllPlugins, renderPluginCards }) {
  function resetPlugins() {
    if (window.electronAPI && window.electronAPI.disableAllPlugins) window.electronAPI.disableAllPlugins();
    stopAllPlugins();
    renderPluginCards();
    showToast(Tm('Plugins turned off (Ctrl+Shift+R)'), 'info');
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyR') {
      e.preventDefault();
      e.stopPropagation();
      resetPlugins();
    }
  }, true);
};
