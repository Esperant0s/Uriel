// @ts-check
// The app's colours: the Material 3 palette worked out from one accent colour, the palette styles, and the
// website themes laid over it. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielThemePalettePart} out */
window.UrielApp.themePalette = function ({ getAdv, hexToRgb, hslToHex, mixHex, relLuminance, rgbToHsl, state }, out) {
  /** @type {Record<string, { label: string, secHueShift: number, tertHueShift: number, priSatScale: number, surfSatScale: number, contSatScale: number }>} */
  const PALETTE_STYLES = {
    classic: {
      label: 'Classic',
      secHueShift: 0,
      tertHueShift: 0,
      priSatScale: 1.0,
      surfSatScale: 1.0,
      contSatScale: 1.0
    },
    'tonal-spot': {
      label: 'Tonal spot',
      secHueShift: 0,
      tertHueShift: 60,
      priSatScale: 1.0,
      surfSatScale: 0.8,
      contSatScale: 0.9
    },
    expressive: {
      label: 'Expressive',
      secHueShift: 60,
      tertHueShift: 120,
      priSatScale: 1.25,
      surfSatScale: 1.5,
      contSatScale: 1.3
    },
    vibrant: {
      label: 'Vibrant',
      secHueShift: 0,
      tertHueShift: 60,
      priSatScale: 1.4,
      surfSatScale: 1.2,
      contSatScale: 1.4
    },
    neutral: {
      label: 'Neutral',
      secHueShift: 0,
      tertHueShift: 0,
      priSatScale: 0.35,
      surfSatScale: 0.2,
      contSatScale: 0.25
    }
  };

  // Old Android WebViews (before Chrome 111) have no color-mix(): a color built with it was thrown away and all
  // text came out black. They get the plain color instead (the transparency sliders do nothing there).
  const hasColorMix = !!(window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)'));
  const tint = (/** @type {string} */ hex, /** @type {string} */ v) => (hasColorMix ? `color-mix(in srgb, ${hex} var(${v}), transparent)` : hex);
  const SURFACE_TOKENS = new Set([
    '--md-sys-color-background',
    '--md-sys-color-surface',
    '--md-sys-color-surface-dim',
    '--md-sys-color-surface-bright',
    '--md-sys-color-surface-container-lowest',
    '--md-sys-color-surface-container-low',
    '--md-sys-color-surface-container',
    '--md-sys-color-surface-container-high',
    '--md-sys-color-surface-container-highest'
  ]);
  const TEXT_TOKENS = new Set([
    '--md-sys-color-on-surface',
    '--md-sys-color-on-surface-variant'
  ]);

  // The preset themes of Majd's website (Esperant0s.github.io, js/themes.js and style.css): the same seven base
  // colors, and Uriel's surfaces, text and accents are worked out from them. All of them are dark themes.
  const SITE_THEMES = [
    { id: 'halloween', name: 'Halloween Glow', tag: 'Fall · default', bg: '#0A0A0A', bg2: '#1A121A', bg3: '#3D1A3D', text: '#F7EBDD', accent: '#FFB627', accent2: '#FF6700', pop: '#9B1D20' },
    { id: 'synthwave', name: 'Synthwave Night', tag: 'Neon', bg: '#240046', bg2: '#3C096C', bg3: '#7209B7', text: '#FCE7F3', accent: '#FFD60A', accent2: '#F72585', pop: '#B57BE8' },
    { id: 'luxury-gold', name: 'Luxury Gold', tag: 'Gold', bg: '#0B0B10', bg2: '#1A1A2E', bg3: '#16213E', text: '#F5E6C4', accent: '#C9A227', accent2: '#F5E6C4', pop: '#C9A227' },
    { id: 'midnight-jewel', name: 'Midnight Jewel', tag: 'Deep · moody', bg: '#03071E', bg2: '#1A0618', bg3: '#370617', text: '#F6E0D6', accent: '#DC2F02', accent2: '#9D0208', pop: '#EE9780', accentText: '#E35935' },
    { id: 'noir-neon', name: 'Noir Neon', tag: 'Neon · synthwave', bg: '#0D0C1D', bg2: '#1B1B3A', bg3: '#693668', text: '#F5E3F0', accent: '#F84AA7', accent2: '#A74482', pop: '#FBA4D3' },
    { id: 'devtool-dark', name: 'Devtool Dark', tag: 'Developer', bg: '#0A0E14', bg2: '#1F2430', bg3: '#2A3142', text: '#E6E1CF', accent: '#FFD580', accent2: '#5FB3B3', pop: '#BBE67E' },
    { id: 'github-dim', name: 'GitHub Dim', tag: 'Developer', bg: '#22272E', bg2: '#2D333B', bg3: '#373E47', text: '#CDD9E5', accent: '#539BF5', accent2: '#768390', pop: '#CDD9E5', accentText: '#6DABF7' },
    { id: 'midnight-violet', name: 'Midnight Violet', tag: 'Purple', bg: '#0B0B1A', bg2: '#1A1635', bg3: '#2D2456', text: '#EDE9FE', accent: '#C4B5FD', accent2: '#7C3AED', pop: '#A078F5' },
    { id: 'midnight-teal', name: 'Midnight Teal', tag: 'Green · cool', bg: '#021F25', bg2: '#053E44', bg3: '#0D6E6F', text: '#E6FBF5', accent: '#A7F0D4', accent2: '#22B8A3', pop: '#7FE3C9' },
    { id: 'midnight-rose', name: 'Midnight Rose', tag: 'Pink · moody', bg: '#190A17', bg2: '#3A132D', bg3: '#7A2348', text: '#FFE4E8', accent: '#FF9AA2', accent2: '#C44569', pop: '#E07A95' },
    { id: 'midnight-amber', name: 'Midnight Amber', tag: 'Amber · warm', bg: '#0C0A09', bg2: '#1C1917', bg3: '#451A03', text: '#FFF1E2', accent: '#FED7AA', accent2: '#EA580C', pop: '#FB923C' },
    { id: 'cyberpunk', name: 'Cyberpunk Glow', tag: 'Neon · cyberpunk', bg: '#0D0221', bg2: '#190B34', bg3: '#3A0F6E', text: '#EAFBFF', accent: '#04FFE6', accent2: '#FB04EB', pop: '#A64DFF' },
    { id: 'noir-cinema', name: 'Noir Cinema', tag: 'Monochrome', bg: '#000000', bg2: '#1A1A1A', bg3: '#4D4D4D', text: '#F0E6D2', accent: '#F0E6D2', accent2: '#999999', pop: '#F0E6D2' }
  ];
  // the chosen website theme, while it applies: not in auto (cover colors) or light mode
  function activeSiteTheme() {
    if (!state.siteTheme || state.themeMode === 'auto' || state.themeMode === 'light') return null;
    return SITE_THEMES.find((t) => t.id === state.siteTheme) || null;
  }

  // a website theme's colors over the generated palette: brightness 50% is the website as it is, lower is darker
  function applySiteThemeTokens(/** @type {typeof SITE_THEMES[number]} */ t, /** @type {number} */ br, /** @type {(prop: string, val: string) => void} */ setToken, /** @type {(prop: string, val: string) => void} */ setSurfaceToken) {
    const shade = (/** @type {string} */ c) => br < 0.5 ? mixHex(c, '#000000', (0.5 - br) * 1.2) : mixHex(c, '#FFFFFF', (br - 0.5) * 0.4);
    const primary = t.accentText || t.accent;
    const p = hexToRgb(primary);
    setToken('--md-sys-color-primary', primary);
    setToken('--md-sys-color-on-primary', relLuminance(primary) > 0.3 ? mixHex(t.bg, '#000000', 0.3) : '#FFFFFF');
    setToken('--md-sys-color-primary-container', `rgba(${p.r}, ${p.g}, ${p.b}, 0.18)`);
    setToken('--md-sys-color-on-primary-container', primary);
    setToken('--md-sys-color-secondary', t.accent2);
    setSurfaceToken('--md-sys-color-secondary-container', shade(mixHex(t.bg2, t.accent2, 0.25)));
    setToken('--md-sys-color-on-secondary-container', mixHex(t.text, t.accent2, 0.2));
    setToken('--md-sys-color-tertiary', t.pop);
    setSurfaceToken('--md-sys-color-tertiary-container', shade(mixHex(t.bg2, t.pop, 0.25)));
    setToken('--md-sys-color-background', shade(t.bg));
    setToken('--md-sys-color-surface', shade(mixHex(t.bg, t.bg2, 0.15)));
    setToken('--md-sys-color-surface-dim', shade(t.bg));
    setToken('--md-sys-color-surface-bright', shade(t.bg3));
    setToken('--md-sys-color-surface-container-lowest', shade(mixHex(t.bg, '#000000', 0.25)));
    setToken('--md-sys-color-surface-container-low', shade(mixHex(t.bg, t.bg2, 0.5)));
    setToken('--md-sys-color-surface-container', shade(t.bg2));
    setToken('--md-sys-color-surface-container-high', shade(mixHex(t.bg2, t.bg3, 0.3)));
    setToken('--md-sys-color-surface-container-highest', shade(mixHex(t.bg2, t.bg3, 0.55)));
    setToken('--md-sys-color-on-surface', t.text);
    setToken('--md-sys-color-on-surface-variant', mixHex(t.text, t.bg, 0.3));
    setToken('--md-sys-color-outline', mixHex(t.text, t.bg, 0.5));
    setSurfaceToken('--md-sys-color-outline-variant', mixHex(t.bg2, t.text, 0.15));
  }

  function generateM3Palette(/** @type {string} */ hexColor, /** @type {string} */ mode, /** @type {number} */ intensity, /** @type {number} */ brightness) {
    if (!hexColor) hexColor = '#6750A4';
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const h = hsl.h;
    const intensityFactor = (typeof intensity === 'number' ? intensity : 100) / 100;
    const root = document.documentElement;
    // Settings → "Apply intensity to background" (Riff 43): surfaces take on the accent as strongly as the
    // intensity slider says, instead of the faint tint they always have
    const tintSurfaces = getAdv('intensity_bg', false);
    const surfSat = (/** @type {number} */ n, /** @type {number} */ factor) => tintSurfaces ? Math.min(85, Math.round((hsl.s || 60) * factor * 2.4)) : Math.round(n * factor);

    const setToken = (/** @type {string} */ prop, /** @type {string} */ val) => {
      if (SURFACE_TOKENS.has(prop)) {
        root.style.setProperty(prop, tint(val, '--ui-alpha'));
        root.style.setProperty(`${prop}-solid`, val);
      } else if (TEXT_TOKENS.has(prop)) {
        root.style.setProperty(prop, tint(val, '--text-alpha'));
        root.style.setProperty(`${prop}-solid`, val);
      } else {
        root.style.setProperty(prop, val);
      }
    };

    const setSurfaceToken = (/** @type {string} */ prop, /** @type {string} */ val) => {
      root.style.setProperty(prop, tint(val, '--ui-alpha'));
      root.style.setProperty(`${prop}-solid`, val);
    };

    const styleKey = state.paletteStyle || 'classic';
    const style = PALETTE_STYLES[styleKey] || PALETTE_STYLES.classic;

    const hSec = (h + style.secHueShift) % 360;
    const hTert = (h + style.tertHueShift) % 360;

    const isMonochrome = intensityFactor < 0.08 || (styleKey === 'neutral' && intensityFactor < 0.05);
    const br = (typeof brightness === 'number' ? brightness : 50) / 100;

    if (mode === 'light') {
      const LB = (/** @type {number} */ v) => Math.max(0, Math.min(100, Math.round(v + (br - 0.5) * 24)));
      if (isMonochrome) {
        setToken('--md-sys-color-primary', '#111111');
        setToken('--md-sys-color-on-primary', '#FFFFFF');
        setSurfaceToken('--md-sys-color-primary-container', hslToHex(0, 0, LB(90)));
        setToken('--md-sys-color-on-primary-container', '#111111');
        setToken('--md-sys-color-secondary', '#444444');
        setSurfaceToken('--md-sys-color-secondary-container', hslToHex(0, 0, LB(90)));
        setToken('--md-sys-color-on-secondary-container', '#111111');
        setToken('--md-sys-color-tertiary', '#444444');
        setSurfaceToken('--md-sys-color-tertiary-container', hslToHex(0, 0, LB(90)));
        setToken('--md-sys-color-background', hslToHex(0, 0, LB(99)));
        setToken('--md-sys-color-surface', hslToHex(0, 0, LB(98)));
        setToken('--md-sys-color-surface-dim', hslToHex(0, 0, LB(87)));
        setToken('--md-sys-color-surface-bright', hslToHex(0, 0, LB(98)));
        setToken('--md-sys-color-surface-container-lowest', hslToHex(0, 0, LB(100)));
        setToken('--md-sys-color-surface-container-low', hslToHex(0, 0, LB(96)));
        setToken('--md-sys-color-surface-container', hslToHex(0, 0, LB(94)));
        setToken('--md-sys-color-surface-container-high', hslToHex(0, 0, LB(92)));
        setToken('--md-sys-color-surface-container-highest', hslToHex(0, 0, LB(90)));
        setToken('--md-sys-color-on-surface', '#111111');
        setToken('--md-sys-color-on-surface-variant', '#444444');
        setToken('--md-sys-color-outline', '#777777');
        setSurfaceToken('--md-sys-color-outline-variant', '#CFCFCF');
        setToken('--md-sys-color-error', '#777777');
        setToken('--md-sys-color-on-error', '#FFFFFF');
      } else {
        const sat = Math.min(100, Math.round(48 * intensityFactor * style.priSatScale));
        const satHi = Math.min(100, Math.round(80 * intensityFactor * style.contSatScale));
        const satMed = Math.min(100, Math.round(55 * intensityFactor * style.priSatScale));
        const satLow = Math.min(100, Math.round(30 * intensityFactor * style.contSatScale));
        const satLow2 = Math.min(100, Math.round(20 * intensityFactor * style.contSatScale));
        const surfFactor = intensityFactor * style.surfSatScale;

        setToken('--md-sys-color-primary', hslToHex(h, sat, 40));
        setToken('--md-sys-color-on-primary', '#FEFBFF');
        setToken('--md-sys-color-primary-container', hslToHex(h, satHi, LB(90)));
        setToken('--md-sys-color-on-primary-container', hslToHex(h, satMed, 18));
        setToken('--md-sys-color-secondary', hslToHex(hSec, satLow, 45));
        setToken('--md-sys-color-secondary-container', hslToHex(hSec, satLow, LB(90)));
        setToken('--md-sys-color-on-secondary-container', hslToHex(hSec, satLow2, 15));
        setToken('--md-sys-color-tertiary', hslToHex(hTert, satLow, 45));
        setToken('--md-sys-color-tertiary-container', hslToHex(hTert, satLow, LB(90)));
        setToken('--md-sys-color-background', hslToHex(h, surfSat(5, surfFactor), LB(99)));
        setToken('--md-sys-color-surface', hslToHex(h, surfSat(6, surfFactor), LB(98)));
        setToken('--md-sys-color-surface-dim', hslToHex(h, surfSat(5, surfFactor), LB(87)));
        setToken('--md-sys-color-surface-bright', hslToHex(h, surfSat(6, surfFactor), LB(98)));
        setToken('--md-sys-color-surface-container-lowest', hslToHex(h, surfSat(4, surfFactor), LB(100)));
        setToken('--md-sys-color-surface-container-low', hslToHex(h, surfSat(5, surfFactor), LB(96)));
        setToken('--md-sys-color-surface-container', hslToHex(h, surfSat(6, surfFactor), LB(94)));
        setToken('--md-sys-color-surface-container-high', hslToHex(h, surfSat(5, surfFactor), LB(92)));
        setToken('--md-sys-color-surface-container-highest', hslToHex(h, surfSat(5, surfFactor), LB(90)));
        setToken('--md-sys-color-on-surface', '#1C1B1F');
        setToken('--md-sys-color-on-surface-variant', '#49454F');
        setToken('--md-sys-color-outline', '#79747E');
        setToken('--md-sys-color-outline-variant', '#CAC4D0');
      }
    } else {
      if (isMonochrome) {
        const B = (/** @type {number} */ v) => Math.max(0, Math.min(100, Math.round(v * (br * 2))));
        setToken('--md-sys-color-primary', '#FFFFFF');
        setToken('--md-sys-color-on-primary', '#121212');
        setSurfaceToken('--md-sys-color-primary-container', hslToHex(0, 0, B(24)));
        setToken('--md-sys-color-on-primary-container', '#FFFFFF');
        setToken('--md-sys-color-secondary', '#D0D0D0');
        setSurfaceToken('--md-sys-color-secondary-container', hslToHex(0, 0, B(24)));
        setToken('--md-sys-color-on-secondary-container', '#FFFFFF');
        setToken('--md-sys-color-tertiary', '#D0D0D0');
        setSurfaceToken('--md-sys-color-tertiary-container', hslToHex(0, 0, B(24)));
        setToken('--md-sys-color-background', hslToHex(0, 0, B(7)));
        setToken('--md-sys-color-surface', hslToHex(0, 0, B(7)));
        setToken('--md-sys-color-surface-dim', hslToHex(0, 0, B(7)));
        setToken('--md-sys-color-surface-bright', hslToHex(0, 0, B(19)));
        setToken('--md-sys-color-surface-container-lowest', hslToHex(0, 0, B(5)));
        setToken('--md-sys-color-surface-container-low', hslToHex(0, 0, B(10)));
        setToken('--md-sys-color-surface-container', hslToHex(0, 0, B(13)));
        setToken('--md-sys-color-surface-container-high', hslToHex(0, 0, B(16)));
        setToken('--md-sys-color-surface-container-highest', hslToHex(0, 0, B(20)));
        setToken('--md-sys-color-on-surface', '#FFFFFF');
        setToken('--md-sys-color-on-surface-variant', '#CFCFCF');
        setToken('--md-sys-color-outline', '#8A8A8A');
        setSurfaceToken('--md-sys-color-outline-variant', '#3A3A3A');
        setToken('--md-sys-color-error', '#8A8A8A');
        setToken('--md-sys-color-on-error', '#121212');
      } else {
        const sat = Math.min(100, Math.round(60 * intensityFactor * style.priSatScale));
        const satHi = Math.min(100, Math.round(60 * intensityFactor * style.contSatScale));
        const satMed = Math.min(100, Math.round(50 * intensityFactor * style.priSatScale));
        const satLow = Math.min(100, Math.round(15 * intensityFactor * style.contSatScale));
        const satLow2 = Math.min(100, Math.round(30 * intensityFactor * style.contSatScale));
        const surfFactor = intensityFactor * style.surfSatScale;
        const priHex = hslToHex(h, sat, 75);
        const priRgb = hexToRgb(priHex);
        setToken('--md-sys-color-primary', priHex);
        setToken('--md-sys-color-on-primary', hslToHex(h, satMed, 20));
        setToken('--md-sys-color-primary-container', `rgba(${priRgb.r}, ${priRgb.g}, ${priRgb.b}, 0.18)`);
        setToken('--md-sys-color-on-primary-container', priHex);
        setToken('--md-sys-color-secondary', hslToHex(hSec, satLow2, 75));
        setToken('--md-sys-color-secondary-container', hslToHex(hSec, satLow, 22));
        setToken('--md-sys-color-on-secondary-container', hslToHex(hSec, satLow2, 85));
        setToken('--md-sys-color-tertiary', hslToHex(hTert, satLow2, 75));
        setToken('--md-sys-color-tertiary-container', hslToHex(hTert, satLow, 22));
        const B = (/** @type {number} */ v) => Math.max(0, Math.min(100, Math.round(v * (br * 2))));
        setToken('--md-sys-color-background', hslToHex(h, surfSat(5, surfFactor), B(7)));
        setToken('--md-sys-color-surface', hslToHex(h, surfSat(6, surfFactor), B(8)));
        setToken('--md-sys-color-surface-dim', hslToHex(h, surfSat(5, surfFactor), B(7)));
        setToken('--md-sys-color-surface-bright', hslToHex(h, surfSat(4, surfFactor), B(24)));
        setToken('--md-sys-color-surface-container-lowest', hslToHex(h, surfSat(5, surfFactor), B(5)));
        setToken('--md-sys-color-surface-container-low', hslToHex(h, surfSat(5, surfFactor), B(10)));
        setToken('--md-sys-color-surface-container', hslToHex(h, surfSat(6, surfFactor), B(13)));
        setToken('--md-sys-color-surface-container-high', hslToHex(h, surfSat(5, surfFactor), B(16)));
        setToken('--md-sys-color-surface-container-highest', hslToHex(h, surfSat(5, surfFactor), B(20)));
        setToken('--md-sys-color-on-surface', '#e2e2e9');
        setToken('--md-sys-color-on-surface-variant', '#c4c6d0');
        setToken('--md-sys-color-outline', '#8e9099');
        setToken('--md-sys-color-outline-variant', '#282a33');
      }
    }
    const site = mode === 'dark' && activeSiteTheme();
    if (site) applySiteThemeTokens(site, br, setToken, setSurfaceToken);
  }

  function extractDominantColor(/** @type {string} */ imgSrc) {
    return new Promise((resolve) => {
      if (!imgSrc) return resolve('#6750A4');
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        canvas.width = 10;
        canvas.height = 10;
        ctx.drawImage(img, 0, 0, 10, 10);
        const data = ctx.getImageData(0, 0, 10, 10).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i+1]; b += data[i+2];
        }
        const count = data.length / 4;
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        resolve(hex);
      };
      img.onerror = () => resolve('#6750A4');
      img.src = imgSrc;
    });
  }

  /** @type {UrielThemePalettePart} */
  const api = { PALETTE_STYLES, SITE_THEMES, activeSiteTheme, generateM3Palette };
  Object.assign(out, api);
};
