// Lyrics on the iPhone lock screen and in the Dynamic Island (a Live Activity, drawn by the UrielWidgets
// extension). This sends the song, its synced lyrics and every play/pause/seek to the native side
// (ios/App/App/LyricsLiveActivity.swift), which times the lines itself while the app is in the background.
import { Capacitor, registerPlugin } from '@capacitor/core';

const KEY = 'uriel_live_activity';

// ios/App/App/LyricsLiveActivity.swift
interface LiveActivityPlugin {
  setTrack(o: { id: string; title: string; artist: string; artwork: string }): Promise<void>;
  setLyrics(o: { id: string; lines: string }): Promise<void>;
  setPlayback(o: { playing: boolean; position: number; rate: number; duration: number; shuffle: boolean }): Promise<void>;
  isAvailable(): Promise<{ available?: boolean }>;
  stop(): Promise<void>;
  addListener: AddListener<{ action: { action?: 'toggle' | 'next' | 'prev' | 'shuffle' } }>;
}
// a line of synced lyrics as app.js keeps them
interface LyricLine { time: number; text?: string }

function liveActivity(): void {
  if (Capacitor.getPlatform() !== 'ios') return;
  const plugin = registerPlugin<LiveActivityPlugin>('UrielLiveActivity');
  const enabled = () => localStorage.getItem(KEY) !== '0';
  // nothing goes to the native side while the switch is off
  const send = (call: () => Promise<void>) => { if (enabled()) call().catch(() => {}); };

  const core = () => window.UrielCore;
  const keyOf = (t: Track | null) => (t ? `${t.platform || ''}:${t.id || ''}:${t.title || ''}` : '');
  let lastSync = 0;

  function sendTrack() {
    const t = core() && core().state.currentTrack;
    if (!t) return;
    let art = '';
    try { art = (core().thumb && core().thumb(t)) || t.thumbnail || ''; } catch (e) { art = t.thumbnail || ''; }
    const info = { id: keyOf(t), title: t.title || '', artist: t.artist || '', artwork: /^https:\/\//.test(art) ? art : '' };
    send(() => plugin.setTrack(info));
  }

  function sendLyrics() {
    const c = core();
    const t = c && c.state.currentTrack;
    if (!t) return;
    const lines = ((c.state.syncedLyrics || []) as LyricLine[]).filter((l) => l.time >= 0 && l.text).map((l) => ({ t: l.time, x: l.text }));
    send(() => plugin.setLyrics({ id: keyOf(t), lines: JSON.stringify(lines) }));
  }

  function sendPlayback() {
    const a = core() && core().audio;
    if (!a) return;
    lastSync = Date.now();
    const t = core().state.currentTrack;
    const duration = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Number(t && t.duration) || 0;
    const playback = { playing: !a.paused && !a.ended, position: a.currentTime || 0, rate: a.playbackRate || 1, duration, shuffle: !!core().state.isShuffle };
    send(() => plugin.setPlayback(playback));
  }

  function hook() {
    const a = core() && core().audio;
    if (!a) return;
    window.addEventListener('uriel:track', () => sendTrack());
    window.addEventListener('uriel:lyrics', () => sendLyrics());
    ['playing', 'pause', 'seeked', 'ratechange', 'ended', 'durationchange'].forEach((ev) => a.addEventListener(ev, sendPlayback));
    window.addEventListener('uriel:modes', sendPlayback);
    // the buttons in the Dynamic Island (iOS 17+)
    plugin.addListener('action', ({ action }: { action?: string } = {}) => {
      const c = core();
      if (!c) return;
      if (action === 'toggle') c.togglePlay();
      else if (action === 'next') c.next();
      else if (action === 'prev') c.prev();
      else if (action === 'shuffle') c.toggleShuffle();
    });
    // the native clock drifts a little from the audio over a long song; line it up now and then
    a.addEventListener('timeupdate', () => { if (!a.paused && Date.now() - lastSync > 15000) sendPlayback(); });
  }
  if (window.UrielCore) hook(); else window.addEventListener('uriel:ready', hook, { once: true });

  // for the switch in Settings (mobile-ui.ts)
  window.UrielLiveActivity = {
    enabled,
    available: () => plugin.isAvailable().then((r) => !!(r && r.available)).catch(() => false),
    setEnabled(on: boolean) {
      localStorage.setItem(KEY, on ? '1' : '0');
      if (!on) { plugin.stop().catch(() => {}); return; }
      sendTrack();
      sendLyrics();
      sendPlayback();
    },
  };
}

export = liveActivity;
