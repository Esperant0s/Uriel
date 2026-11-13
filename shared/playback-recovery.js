// @ts-check
'use strict';
// What happens when a song that was already playing loses its stream (an expired link, a dropped connection):
// it is looked up again and continues where it stopped, a few times per song. Offline it waits for the
// connection instead of using up its tries or skipping through the queue.

const MAX_TRIES = 3;
const CALM_MS = 60000; // this long after the last try, a new failure starts counting from the beginning

function createMidSongRecovery({ maxTries = MAX_TRIES, calmMs = CALM_MS, now = Date.now } = {}) {
  let song = null;
  let tries = 0;
  let last = 0;
  return {
    // song: anything that changes with the loaded song. Returns 'retry', 'wait-online' or 'give-up'.
    decide({ song: current, local = false, online = true }) {
      if (local) return 'give-up'; // a file doesn't come back by looking it up again
      if (!online) return 'wait-online';
      const t = now();
      if (current !== song || t - last >= calmMs) tries = 0;
      song = current;
      if (tries >= maxTries) return 'give-up';
      tries++;
      last = t;
      return 'retry';
    }
  };
}

// where to continue: the start says nothing was heard yet, and seeking to the very end would just end the song
function resumePosition(position, duration) {
  if (!(position > 1)) return 0;
  return !duration || position < duration - 2 ? position : 0;
}

const api = { createMidSongRecovery, resumePosition, MAX_TRIES, CALM_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.UrielPlaybackRecovery = api;
