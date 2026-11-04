// The phone's status bar and gesture bar in the theme's colours (Android: SystemBarsPlugin.java). The top one takes
// the page's background, the bottom one the navigation bar's, and their icons go dark on a light theme. Followed
// whenever the theme changes, the app comes back to the front, or the phone switches between light and dark.
const { Capacitor, registerPlugin } = require('@capacitor/core');

// any CSS colour (computed ones can be color(srgb ...) or carry alpha) as #rrggbb, laid over black like the page is
let ctx = null;
function hex(css) {
  if (!ctx) { const c = document.createElement('canvas'); c.width = c.height = 1; ctx = c.getContext('2d', { willReadFrequently: true }); }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = css || '#000';
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function colors() {
  const nav = document.getElementById('sidebar');
  return {
    top: hex(getComputedStyle(document.documentElement).backgroundColor),
    bottom: hex(nav ? getComputedStyle(nav).backgroundColor : getComputedStyle(document.documentElement).backgroundColor),
    light: document.body.classList.contains('theme-light'),
  };
}

module.exports = function systemBars() {
  if (Capacitor.getPlatform() !== 'android') return;
  const plugin = registerPlugin('UrielSystemBars');
  let last = '';
  let timer = null;
  const sync = (force) => {
    clearTimeout(timer);
    timer = null;
    if (!document.body) return;
    const c = colors();
    const key = JSON.stringify(c);
    if (key === last && !force) return;
    last = key;
    plugin.set(c).catch(() => {});
  };
  const soon = () => { if (!timer) timer = setTimeout(() => sync(false), 120); };
  const start = () => {
    sync(true);
    // the theme lands in body's classes and in the custom properties on <html>
    new MutationObserver(soon).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(soon).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    // Capacitor sets the bars' icons again when the phone changes between light and dark, or the app resumes
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(true); });
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => sync(true)); } catch (e) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  window.addEventListener('uriel:ready', () => sync(true), { once: true });
};
