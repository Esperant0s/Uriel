## Mural 1.5.2

Mural is the new name of the Esperant0s fork of [Muriel](https://github.com/cloverscripts/riff-muriel) by cloverscripts, itself based on [Riff](https://github.com/rootscripts/riff) by rootscripts (MIT). It is its own app now and installs next to Muriel.

**Downloads**
- **Android:** [android-latest](https://github.com/Esperant0s/riff-muriel/releases/tag/android-latest) (`Mural.apk`). Open it on your phone and allow installs from your browser if Android asks.
- **iPhone:** [ios-latest](https://github.com/Esperant0s/riff-muriel/releases/tag/ios-latest) (`Mural.ipa`, install with SideStore, AltStore or Sideloadly). Needs iOS 16.2 or newer
- **Windows:** installer below, or the portable exe on [windows-latest](https://github.com/Esperant0s/riff-muriel/releases/tag/windows-latest). Windows SmartScreen may warn because the files are unsigned: More info → Run anyway.
- **macOS:** `.dmg` / `.zip` below, for Apple Silicon and Intel. The app is unsigned: if macOS blocks it, open System Settings → Privacy & Security → Open Anyway.
- **Linux:** `.AppImage` below (needs FUSE 2: `fuse2` / `libfuse2`)

**New in 1.5.2**
- **The app icon changes too:** picking an icon in Settings → Theme → App icon now changes Mural's own icon, not just the Home button: the phone's home-screen icon (one of the 12 styles; Android and iPhone can't use your own picture there) and, on computers, the window, taskbar and Dock icon (your own picture works too). iPhone shows a short "You have changed the icon" message; that's iOS.

**Fixed in 1.5.2**
- **Buttons are one size:** buttons in Settings no longer mix two sizes, and labels don't wrap or sit cramped inside them.
- **Toggles:** no thin coloured ring around the switch when it's on.

**New in 1.5.1**
- **Play with your YouTube sign-in** (computers): when YouTube answers "Sign in to confirm you're not a bot" and songs won't play, turn on Settings → Integrations → YouTube → Play with my YouTube sign-in. Your sign-in stays on this computer; a spare Google account is the safer choice, since YouTube can limit accounts used this way.
- **New themes:** 13 presets in Settings → Theme, with Halloween Glow as the default.
- **Finds yt-dlp and ffmpeg** you already have (package managers, Muriel's old folder) instead of downloading them again.

**Fixed in 1.5.1**
- **Songs that won't play fail in seconds, not half a minute:** while YouTube is blocking lookups, Mural stops retrying it and goes straight to SoundCloud.
- **Smoother animations** when switching pages and opening dialogs: far fewer GPU layers, no blur on closed dialogs.
- **The search bar** is no longer covered by messages or the update banner, and doesn't run under the YouTube / SoundCloud buttons in narrow windows.
- **The player bar** fits narrow windows; the volume no longer runs off the edge.
- **Faster start:** parts of the app load only when first needed.

**New in 1.5.0**
- **Mural:** a new name and its own app. On computers, the first start brings over your Muriel playlists, favorites, settings, library and offline songs (Muriel itself is left as it is). Phones start fresh.
- **Finds the music already on your device:** the Music and Downloads folders on computers (and keeps watching them), the phone's music library on Android, and Mural's folder in the Files app on iPhone. Songs play from where they are, nothing is copied, and removing one from My files never deletes the file. Settings → Storage → Music on this device.
- **"Available offline" mark:** a small arrow before the artist on every song that plays without internet (local files, downloads and songs kept from playing them).
- **Each app shows what works on it:** phones no longer show computer-only settings (visualizers, output device, Discord, plugins, keyboard shortcuts and more), and the Windows media-key option shows on Windows only.

**Updating from 1.4.0**
- **Computers:** install Mural; your Muriel library comes over on its first start. The 1.4.0 update button opens this page instead of installing, because the files have new names.
- **Android:** install `Mural.apk` as a new app, then uninstall the old one if you like.
