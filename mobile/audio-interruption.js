// iPhone: play again once another app's sound is over (#26). A call, Siri or a video in another app pauses
// Uriel; iOS then says when it's done and whether to start again, but by then Uriel sits paused in the
// background and WebKit didn't start the song again. The app (UrielAudioSessionPlugin in
// ios/App/App/AppDelegate.swift) passes on the start and end of each interruption, and this plays the song
// again when it was playing and nobody paused it meanwhile.
const { Capacitor, registerPlugin } = require('@capacitor/core');
const { wasPlayingAtInterruption, resumeAfterInterruption } = require('../now-playing');

module.exports = function audioInterruption() {
  if (Capacitor.getPlatform() !== 'ios') return;
  const plugin = registerPlugin('UrielAudioSession');
  const core = () => window.UrielCore;
  let lastPlayingAt = 0;
  let wasPlaying = false;

  function hook() {
    const c = core();
    if (!c || !c.audio) return;
    const a = c.audio;
    const heard = () => { if (!a.paused) lastPlayingAt = Date.now(); };
    ['playing', 'timeupdate'].forEach((ev) => a.addEventListener(ev, heard));
    plugin.addListener('interruption', ({ type, shouldResume } = {}) => {
      if (type === 'began') {
        wasPlaying = wasPlayingAtInterruption({ paused: a.paused, ended: a.ended, pausedByUser: !!c.state.pausedByUser, lastPlayingAt, now: Date.now() });
        return;
      }
      if (type !== 'ended') return;
      // the song plays through the effects chain, whose audio context the interruption left 'interrupted': start
      // it again first, or a play (ours or the lock screen's) stays silent until the app is opened (#26)
      if (c.resumeAudio) c.resumeAudio();
      const resume = resumeAfterInterruption({ wasPlaying, shouldResume: !!shouldResume, pausedByUser: !!c.state.pausedByUser, paused: a.paused, ended: a.ended, hasTrack: !!c.state.currentTrack });
      wasPlaying = false;
      if (!resume) return;
      // the 'pause' iOS caused left state.isPlaying false, so this is a play, not a pause
      if (c.state.isPlaying) a.play().catch(() => {});
      else c.togglePlay();
    });
  }
  if (window.UrielCore) hook(); else window.addEventListener('uriel:ready', hook, { once: true });
};
