## Muriel 1.4.0 (Esperant0s fork)

A fork of [Muriel](https://github.com/cloverscripts/riff-muriel) by cloverscripts, itself based on [Riff](https://github.com/rootscripts/riff) by rootscripts (MIT).

**Downloads**
- **Android:** [android-latest](https://github.com/Esperant0s/riff-muriel/releases/tag/android-latest) (`Muriel.apk`). Open it on your phone and allow installs from your browser if Android asks. If the original Muriel is installed, uninstall it first: this build is signed with a different key.
- **iPhone:** [ios-latest](https://github.com/Esperant0s/riff-muriel/releases/tag/ios-latest) (`Muriel.ipa`, install with SideStore, AltStore or Sideloadly). Needs iOS 16.2 or newer
- **Windows:** installer below, or the portable exe on [windows-latest](https://github.com/Esperant0s/riff-muriel/releases/tag/windows-latest). Windows SmartScreen may warn because the files are unsigned: More info → Run anyway.
- **macOS:** `.dmg` / `.zip` below, for Apple Silicon and Intel. The app is unsigned: if macOS blocks it, open System Settings → Privacy & Security → Open Anyway.
- **Linux:** `.AppImage` below (needs FUSE 2: `fuse2` / `libfuse2`)

**New**
- **In-app updates:** when a new version is out, "Update" downloads it inside Muriel with a progress bar, checks it against GitHub's checksum, and installs it on "Restart now" (or when you quit). Windows, macOS, Linux AppImage and Android; iPhone keeps the download link.

**Fixed**
- **Downloads:** Cancel stops a song download right away, and a playlist download left running in the background no longer takes over another song's download dialog. Cancelling no longer starts a hidden second download.
- **My Wave:** playing a playlist or another song turns My Wave off, so it stops adding its own songs to your queue and counting your skips. With Crossfade on, its last song no longer plays twice over itself.
- **Albums:** tracks longer than about 16 minutes (audiobooks, long mixes) are found again, and disc 2 of a double album no longer plays disc 1's songs.
- **Imports and matching:** songs like "Music" (Madonna), "From Me to You" and "Letter from America" are matched; "Song - Remastered 2011" no longer turns the song name into the artist; Hindi and Arabic titles no longer match different words; long Apple Music tracks keep their length.
- **Sync:** a linked device can only change the settings that sync; Recently played no longer shows a song twice after syncing.
- **Phones:** opening another profile no longer deletes the first profile's background and custom covers.
- **Security:** image downloads can't be redirected into your home network; a re-imported plugin starts switched off; the app's own links keep working when its usual port is busy.
- **Smaller fixes:** exports with HQ on keep their reverb and echo, translations stay on the right lyric lines after editing, a failed cache clear or offline delete is reported, Discord presence reconnects reliably, and the theme no longer takes a skipped song's colours.

Everything from Muriel 1.3.10 is included.
