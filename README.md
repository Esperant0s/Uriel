# Muriel

A lightweight desktop music player for Windows, Linux and macOS. Stream from YouTube, YouTube Music and SoundCloud, download for offline listening, and keep a local library — no account, no subscription.

This is a fork of [Muriel](https://github.com/cloverscripts/riff-muriel) by cloverscripts, which is based on
[Riff](https://github.com/rootscripts/riff) by rootscripts (MIT). It adds in-app updates and a round of bug fixes.

> Muriel is an independent, non-commercial open-source project and is not affiliated with YouTube, Google,
> SoundCloud, Spotify or Apple. It hosts no music. Use it for private listening and only download music you
> have the right to. See [LEGAL.md](LEGAL.md) (also for rights holders).

## Download

Get the latest version from the [Releases page](https://github.com/Esperant0s/riff-muriel/releases).

| Device | Download | How to install |
|---|---|---|
| **Android** | [Muriel.apk](https://github.com/Esperant0s/riff-muriel/releases/download/android-latest/Muriel.apk) | Open it on your phone and allow installs from your browser if asked. Uninstall the original Muriel first if you have it. |
| **iPhone** | [Muriel.ipa](https://github.com/Esperant0s/riff-muriel/releases/download/ios-latest/Muriel.ipa) | Install with SideStore, AltStore or Sideloadly (iOS 16.2 or newer). |
| **Windows** | [Muriel.exe](https://github.com/Esperant0s/riff-muriel/releases/download/windows-latest/Muriel.exe) (portable) or the installer on the [latest release](https://github.com/Esperant0s/riff-muriel/releases/latest) | If SmartScreen warns: More info → Run anyway. |
| **macOS** | `.dmg` on the [latest release](https://github.com/Esperant0s/riff-muriel/releases/latest) (Apple Silicon or Intel) | If macOS blocks it: System Settings → Privacy & Security → Open Anyway. |
| **Linux** | `.AppImage` on the [latest release](https://github.com/Esperant0s/riff-muriel/releases/latest) | Make it executable and run it (needs FUSE 2). |

Once installed, Muriel checks for updates when it opens and can download and install them itself.

## Features

- **Streaming & downloads** — YouTube, YouTube Music and SoundCloud via yt-dlp and ffmpeg (installed automatically on first run)
- **Local library** — reads tags and album art, folders and playlists, original files stay untouched
- **Lyrics** — online synced lyrics, LRC files, manual timing, fullscreen karaoke
- **Audio** — EQ, presets, real-time speed, reverb, and a small editor for trimming and exporting clips
- **Compact layout** — slim navigation rail, slide-over drawer for now playing, lyrics and the queue
- **Custom background** — image, GIF or video, with optional glass blur on the interface; pauses while Muriel is hidden
- **Performance settings** — lightweight thumbnails, blur on/off, visualizer frame-rate cap, memory trimming in the background, hardware acceleration toggle

## Getting started

Requires Node.js 18 or newer.

```bash
git clone https://github.com/Esperant0s/riff-muriel.git
cd riff-muriel
npm install
npm start
```

## Building

```bash
npm run dist
```

Installers land in `dist/`. Builds are unsigned: on macOS, right-click Muriel in Applications and choose Open; if macOS says the app is damaged, run `xattr -cr /Applications/Muriel.app`.

## Data

- Windows: `%LOCALAPPDATA%\Muriel`
- macOS: `~/Library/Application Support/Muriel`
- Linux: `~/.cache/muriel` (settings in `~/.config/muriel`)

## Legal

Muriel is a player: it doesn't host, upload or sell music, has no ads, accounts or tracking, and nobody earns
money from it. You're responsible for using it in line with copyright and the terms of the services you use.
Rights holders can reach us through a [rights holder request](https://github.com/cloverscripts/riff-muriel/issues/new?template=rights-holder-request.yml).
Details, also in German: [LEGAL.md](LEGAL.md).

## License

MIT. See [LICENSE](LICENSE). Original Riff code © rootscripts.
