// Environment variables that used to start with MURIEL_ (MURIEL_DATA_DIR, MURIEL_YTDLP, MURIEL_DEBUG...) are
// URIEL_ now; an old one still counts when the new one isn't set. Required first by main.js, cli.js and server.js.
if (typeof process !== 'undefined' && process.env) {
  for (const key of Object.keys(process.env)) {
    const now = key.startsWith('MURIEL_') ? `URIEL_${key.slice(7)}` : null;
    if (now && process.env[now] === undefined) process.env[now] = process.env[key];
  }
}
