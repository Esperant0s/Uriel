## Uriel 1.5.8

Uriel is the new name of the Esperant0s fork of [Muriel](https://github.com/cloverscripts/riff-muriel) by cloverscripts, itself based on [Riff](https://github.com/rootscripts/riff) by rootscripts (MIT). It is its own app now and installs next to Muriel.

**Downloads**
- **Android:** [android-latest](https://github.com/Esperant0s/Uriel/releases/tag/android-latest) (`Uriel.apk`). Open it on your phone and allow installs from your browser if Android asks.
- **iPhone:** [ios-latest](https://github.com/Esperant0s/Uriel/releases/tag/ios-latest) (`Uriel.ipa`, install with SideStore, AltStore or Sideloadly). Needs iOS 16.2 or newer
- **Windows:** installer below, or the portable exe on [windows-latest](https://github.com/Esperant0s/Uriel/releases/tag/windows-latest). Windows SmartScreen may warn because the files are unsigned: More info → Run anyway.
- **macOS:** `.dmg` / `.zip` below, for Apple Silicon and Intel. The app is unsigned: if macOS blocks it, open System Settings → Privacy & Security → Open Anyway.
- **Linux:** `.AppImage` below (needs FUSE 2: `fuse2` / `libfuse2`)

**Fixed in 1.5.8**
- **Phones:** the error log you can share from Settings no longer gets two false errors every time Uriel starts.
- **Downloads:** a downloaded song's length is saved as a number, not as text.
- **Under the hood:** the app's biggest file is split into parts, and importing from Spotify and Apple Music has tests of its own. Nothing looks or works differently.

**New in 1.5.7**
- **Visualizer on Android:** Settings → Interface → Visualizer. Bars that move with the music behind the mini player, and in full-screen lyrics. Off unless you switch it on; it only runs while Uriel is on screen and a song plays.

**New in 1.5.6**
- **Mural is now Uriel:** same app with a new name. It updates in place and keeps everything.
- **Android plays through a native player:** the notification, lock screen, earbuds and Bluetooth buttons all work like in Spotify, even with Uriel closed: a tap on your earbuds plays the last song from where it stopped. EQ, effects, Enhance, Normalize volume and crossfade work in it too.
- **Play alongside other apps** (Android): Settings → Tracks → Playback. With it on, a game or video no longer pauses your music; calls still do.
- **Restore from downloads:** lost your playlists? Settings → Storage → Restore from downloads puts your offline songs back into a new or existing playlist.
- **Songs on your device play from the file:** a playlist song that's also in your Music or Downloads folder (or the phone's library) plays from there instead of streaming.
- **Songs pick up where they stopped** when the connection drops mid-song, instead of skipping or failing.

**Fixed in 1.5.6**
- **Music no longer stops after a song or two in the background** on phones.
- **Lyrics:** no more lyrics of another artist's song with the same name, and lyrics no longer run ahead of a music video that has an intro.
- **Covers:** music videos shot in widescreen lose their black bars, and covers no longer blink out while you scroll a long list.
- **Plugins** (computers): files with any name ending in .js show up now, like "plugin (1).js" or names with accents; a file Notepad saved as .js.txt gets a hint to rename it.
- **Sync:** when two devices find each other but can't connect, both say so and what to try, instead of "No device answered".
- **Phones:** downloads work and keep going in the background with a progress notification, swipes no longer light up buttons, and the queue no longer scrolls sideways.
- **Pauses when headphones or a speaker disconnect**, instead of playing out loud.
- **iPhone:** the lock screen's play button works again after another app's sound has played.
- **Computers:** fast mouse-wheel scrolling on Home goes the whole way, Ctrl and = zooms in, and the player bar's controls look like Spotify's.
- **Safer:** Electron updated past its security advisories.

**New in 1.5.5**
- **More song and playlist controls:** a song's menu can share it or copy its link, and every playlist has a ⋯ menu with Play next, Add to queue, Start radio, Edit details, Duplicate, Share, Export and Delete.
- **See what's downloaded:** playlists show how many of their songs are already on your device ("12 of 40 downloaded"), the Download button how many are left, and the download dialog how many it will skip.
- **Less waiting on Home:** My Wave and For you show your last recommendations right away while new ones load, and the first few songs are prepared ahead so they start quickly (on phones only on Wi-Fi, never with Data Saver).
- **Smarter shuffle:** songs you've already heard since opening Uriel wait until everything else in the queue has played.

**Fixed in 1.5.5**
- **One loading circle:** a song that's loading shows its spinner in the play button only, not a second one over the player bar.
- **No broken pictures:** a cover or photo that won't load tries other sizes, then steps aside instead of showing a broken-image icon.
- **Player bar:** the cover sits inside the bar, the buttons and seek bar are centred together, and the song title always has room.
- **Android:** pages have their titles back, the bottom bar's buttons are evenly spaced, the status and gesture bars take your theme's colours, and the now-playing controls are centred.
- **Faster with big libraries:** lists with many favourites draw much quicker, and a long queue no longer slows down saving.

**New in 1.5.4**
- **No size limit for your library:** playlists, favorites and history now live in the app's database instead of the browser storage that capped everything at about 5 MB. They move over by themselves the first time you open 1.5.4.
- **A smooth start:** the opening star stays until Uriel has finished loading and runs smoothly, then the app fades in. Start-up itself is also about a second shorter.

**Fixed in 1.5.4**
- **Your theme from the first moment:** Uriel no longer shows its default purple for a second or two before switching to the theme you picked.
- **Player bar:** the play button and the controls beside it sit in the middle of the bar instead of riding up to its top edge.
- **Mac and iPhone downloads:** they're built on machines GitHub can actually provide; 1.5.1 to 1.5.3 were missing them at first.

**New in 1.5.3**
- **Easier to read:** panels start 85% solid instead of see-through, and dialogs, menus and messages are always solid, whatever the opacity setting.
- **One way to find songs on every device:** computers and phones now share the same rules for finding a playable stream. When YouTube is turning lookups away, a song that can't play says so in under a second, songs that SoundCloud has start in about 2 seconds, and the message points to Play with my YouTube sign-in.

**Fixed in 1.5.3**
- **YouTube sign-in:** the file Uriel gives yt-dlp now holds only YouTube's cookies, not the rest of your Google account's.
- **Music folders:** rescanning your music no longer leaves old folder watchers running in the background.

**New in 1.5.2**
- **The app icon changes too:** picking an icon in Settings → Theme → App icon now changes Uriel's own icon, not just the Home button: the phone's home-screen icon (one of the 12 styles; Android and iPhone can't use your own picture there) and, on computers, the window, taskbar and Dock icon (your own picture works too). iPhone shows a short "You have changed the icon" message; that's iOS.

**Fixed in 1.5.2**
- **Buttons are one size:** buttons in Settings no longer mix two sizes, and labels don't wrap or sit cramped inside them.
- **Toggles:** no thin coloured ring around the switch when it's on.
- **Sync:** linking devices no longer tries PeerJS's old relay servers, which no longer exist and filled the log with errors.

**New in 1.5.1**
- **Play with your YouTube sign-in** (computers): when YouTube answers "Sign in to confirm you're not a bot" and songs won't play, turn on Settings → Integrations → YouTube → Play with my YouTube sign-in. Your sign-in stays on this computer; a spare Google account is the safer choice, since YouTube can limit accounts used this way.
- **New themes:** 13 presets in Settings → Theme, with Halloween Glow as the default.
- **Finds yt-dlp and ffmpeg** you already have (package managers, Muriel's old folder) instead of downloading them again.

**Fixed in 1.5.1**
- **Songs that won't play fail in seconds, not half a minute:** while YouTube is blocking lookups, Uriel stops retrying it and goes straight to SoundCloud.
- **Smoother animations** when switching pages and opening dialogs: far fewer GPU layers, no blur on closed dialogs.
- **The search bar** is no longer covered by messages or the update banner, and doesn't run under the YouTube / SoundCloud buttons in narrow windows.
- **The player bar** fits narrow windows; the volume no longer runs off the edge.
- **Faster start:** parts of the app load only when first needed.

**New in 1.5.0**
- **Uriel:** a new name and its own app. On computers, the first start brings over your Muriel playlists, favorites, settings, library and offline songs (Muriel itself is left as it is). Phones start fresh.
- **Finds the music already on your device:** the Music and Downloads folders on computers (and keeps watching them), the phone's music library on Android, and Uriel's folder in the Files app on iPhone. Songs play from where they are, nothing is copied, and removing one from My files never deletes the file. Settings → Storage → Music on this device.
- **"Available offline" mark:** a small arrow before the artist on every song that plays without internet (local files, downloads and songs kept from playing them).
- **Each app shows what works on it:** phones no longer show computer-only settings (visualizers, output device, Discord, plugins, keyboard shortcuts and more), and the Windows media-key option shows on Windows only.

**Updating from 1.4.0**
- **Computers:** install Uriel; your Muriel library comes over on its first start. The 1.4.0 update button opens this page instead of installing, because the files have new names.
- **Android:** install `Uriel.apk` as a new app, then uninstall the old one if you like.
