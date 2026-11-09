package io.github.esperant0s.uriel

import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.mp4.FragmentedMp4Extractor
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Uriel's native player on Android. ExoPlayer plays the songs; Media3's session gives the notification, the lock
 * screen and quick-settings player, earbuds and Bluetooth buttons, audio focus, pausing when headphones go, and
 * keeping Uriel running in the background.
 *
 * The page (shared/app.js) still decides what plays: it talks to this through UrielPlayerPlugin, and
 * mobile/native-audio.js stands in for its <audio> element. While the page runs it is "attached": the system's
 * play, pause, next and previous go to the page, which drives the player, so its queue, shuffle, repeat and history
 * work as always.
 *
 * Without the page (earbuds started Uriel after it was closed, or it was swiped away while playing) the player goes
 * on by itself through the songs the page last said come next and are saved on the phone (ColdPlayer.remember keeps
 * them). When the page opens again it carries on from the song and place this got to (attachPage).
 */
@OptIn(UnstableApi::class)
class PlayerService : MediaSessionService() {

    interface Page {
        // a button the page answers: play, pause, next, prev, shuffle or repeat
        fun onAction(action: String)
        fun onState(state: JSONObject)
        fun onError(code: Int, message: String)
    }

    companion object {
        @Volatile
        var instance: PlayerService? = null

        private const val CMD_SHUFFLE = "io.github.esperant0s.uriel.SHUFFLE"
        private const val CMD_REPEAT = "io.github.esperant0s.uriel.REPEAT"
        // while playing the page hears where the song is this often; it counts the time in between itself
        private const val TICK_MS = 1000L
        // a song this short or less is a broken download (the same check as server.js findCachedFile)
        private const val MIN_FILE_BYTES = 60_000L

        // the songs to go on with (ColdPlayer.remember): what was playing, then the saved songs after it
        fun resumeItems(ctx: Context): Pair<List<MediaItem>, Long> {
            val p = ctx.getSharedPreferences(ColdPlayer.PREFS, Context.MODE_PRIVATE)
            val items = ArrayList<MediaItem>()
            val cur = runCatching { JSONObject(p.getString("current", null) ?: return Pair(items, 0L)) }.getOrNull()
                ?: return Pair(items, 0L)
            item(ctx, cur)?.let { items.add(it) } ?: return Pair(items, 0L)
            runCatching {
                val up = JSONArray(p.getString("upcoming", "[]"))
                for (i in 0 until up.length()) up.optJSONObject(i)?.let { o -> item(ctx, o)?.let { items.add(it) } }
            }
            var position = (p.getFloat("position", 0f) * 1000).toLong()
            val duration = (cur.optDouble("duration", 0.0) * 1000).toLong()
            // a song that had nearly finished starts over, as the page does
            if (duration > 0 && position > duration - 5000) position = 0
            return Pair(items, position)
        }

        // a song the page described ({ qi, title, artist, album, artwork, duration, cache | path, thumb }), if its
        // file is on the phone
        fun item(ctx: Context, o: JSONObject): MediaItem? {
            val file = songFile(ctx, o.optString("path", ""), o.optString("cache", "")) ?: return null
            if (!file.isFile || file.length() <= MIN_FILE_BYTES) return null
            return describe(ctx, Uri.fromFile(file), o)
        }

        fun describe(ctx: Context, uri: Uri, o: JSONObject): MediaItem {
            val thumb = cacheFile(ctx, "thumbnails", o.optString("thumb", ""))?.takeIf { it.isFile }
            val art = o.optString("artwork", "")
            val meta = MediaMetadata.Builder()
                .setTitle(o.optString("title", ""))
                .setArtist(o.optString("artist", ""))
                .setAlbumTitle(o.optString("album", "").ifEmpty { null })
                .setIsPlayable(true)
            if (thumb != null) meta.setArtworkUri(Uri.fromFile(thumb))
            else if (art.startsWith("https://")) meta.setArtworkUri(Uri.parse(art))
            return MediaItem.Builder().setMediaId(o.toString()).setUri(uri).setMediaMetadata(meta.build()).build()
        }

        private fun songFile(ctx: Context, path: String, cache: String): File? {
            if (path.startsWith("/")) return File(path)
            return cacheFile(ctx, "tracks", cache)
        }

        // a file in the app's storage (mobile/shims/store.js keeps /data/… in files/Mural/…)
        private fun cacheFile(ctx: Context, dir: String, name: String): File? {
            if (!name.matches(Regex("[A-Za-z0-9_-]+\\.[A-Za-z0-9]+"))) return null
            return File(ctx.filesDir, "Mural/$dir/$name")
        }
    }

    lateinit var exo: ExoPlayer
        private set
    private var session: MediaSession? = null
    private var page: Page? = null
    private var shuffle = false
    private var repeat = "off"
    private val main = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            report()
            if (exo.isPlaying) main.postDelayed(this, TICK_MS)
        }
    }

    // What the system and earbuds act on. Attached to the page, play / pause / next / previous are the page's to
    // answer; without it they go to the player itself.
    private inner class SessionPlayer(player: Player, val attached: Boolean) : ForwardingPlayer(player) {
        private fun toPage(action: String): Boolean {
            val p = page ?: return false
            if (!attached) return false
            p.onAction(action)
            return true
        }

        override fun getAvailableCommands(): Player.Commands {
            val c = super.getAvailableCommands()
            if (!attached) return c
            // the page always has a next and a previous song, and something to play
            return c.buildUpon().addAll(
                Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
                Player.COMMAND_PLAY_PAUSE,
            ).build()
        }

        override fun isCommandAvailable(command: Int) = availableCommands.contains(command)
        override fun play() { if (!toPage("play")) super.play() }
        override fun pause() { if (!toPage("pause")) super.pause() }
        override fun setPlayWhenReady(playWhenReady: Boolean) {
            if (!toPage(if (playWhenReady) "play" else "pause")) super.setPlayWhenReady(playWhenReady)
        }
        override fun seekToNext() { if (!toPage("next")) { super.seekToNext(); revive() } }
        override fun seekToNextMediaItem() { if (!toPage("next")) { super.seekToNextMediaItem(); revive() } }
        override fun seekToPrevious() { if (!toPage("prev")) { super.seekToPrevious(); revive() } }
        override fun seekToPreviousMediaItem() { if (!toPage("prev")) { super.seekToPreviousMediaItem(); revive() } }

        // after a song failed the player waits: another song gets it going again
        private fun revive() {
            if (exo.playbackState == Player.STATE_IDLE && exo.mediaItemCount > 0) exo.prepare()
        }

        // Play on a finished song: the page decides what comes next (Media3 would start the same song over first)
        override fun seekToDefaultPosition() {
            if (attached && page != null && exo.playbackState == Player.STATE_ENDED) return
            super.seekToDefaultPosition()
        }
    }

    private inner class Callback : MediaSession.Callback {
        override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
            val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                .add(SessionCommand(CMD_SHUFFLE, Bundle.EMPTY))
                .add(SessionCommand(CMD_REPEAT, Bundle.EMPTY))
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session).setAvailableSessionCommands(commands).build()
        }

        override fun onCustomCommand(
            session: MediaSession, controller: MediaSession.ControllerInfo, command: SessionCommand, args: Bundle,
        ): ListenableFuture<SessionResult> {
            val action = when (command.customAction) {
                CMD_SHUFFLE -> "shuffle"
                CMD_REPEAT -> "repeat"
                else -> return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED))
            }
            val p = page
            if (p != null) p.onAction(action)
            else {
                // without the page: the player's own order through the saved songs
                if (action == "shuffle") setModes(!shuffle, repeat)
                else setModes(shuffle, when (repeat) { "off" -> "all"; "all" -> "one"; else -> "off" })
                applyModes()
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }

        // Earbuds or the quick-settings player asked for music while Uriel wasn't running: the last song, from where
        // it was, then the saved songs after it, with nothing opening on screen
        override fun onPlaybackResumption(
            mediaSession: MediaSession, controller: MediaSession.ControllerInfo,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val (items, position) = resumeItems(this@PlayerService)
            if (items.isEmpty()) return Futures.immediateFailedFuture(UnsupportedOperationException("nothing saved to play"))
            val p = getSharedPreferences(ColdPlayer.PREFS, Context.MODE_PRIVATE)
            setModes(p.getBoolean("shuffle", false), p.getString("repeat", "off") ?: "off")
            main.post { applyModes() }
            return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(items, 0, position))
        }
    }

    override fun onCreate() {
        super.onCreate()
        // Songs saved from YouTube are often its DASH pieces one after another, each with its own index: read as one,
        // ExoPlayer took the first piece's length (seconds) for the song's and couldn't seek past it. An MP3 without
        // an index seeks by its bitrate.
        val extractors = DefaultExtractorsFactory()
            .setFragmentedMp4ExtractorFlags(FragmentedMp4Extractor.FLAG_MERGE_FRAGMENTED_SIDX)
            .setConstantBitrateSeekingEnabled(true)
        exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(this, extractors))
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        exo.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                report()
                main.removeCallbacks(tick)
                if (player.isPlaying) main.postDelayed(tick, TICK_MS)
            }

            override fun onPlayerError(error: PlaybackException) {
                val p = page
                // the page fetches the song again (playback-recovery in app.js)
                if (p != null) { p.onError(error.errorCode, error.message ?: error.errorCodeName); return }
                // by itself: a song that won't play (a download cut short) is skipped
                if (exo.hasNextMediaItem()) {
                    exo.seekToNextMediaItem()
                    exo.prepare()
                    exo.play()
                }
            }
        })
        session = MediaSession.Builder(this, SessionPlayer(exo, false))
            .setSessionActivity(MediaControlsPlugin.openApp(this))
            .setCallback(Callback())
            .build()
        instance = this
        updateButtons()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onDestroy() {
        main.removeCallbacks(tick)
        instance = null
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }

    // ---- the page (UrielPlayerPlugin; main thread) ----

    // The page is running: it decides from now on. Answers with where the player is, for the page to carry on
    // from: { item (the song as the page described it), position, duration, playing, ended }, or {} with no song.
    fun attachPage(p: Page): JSONObject {
        page = p
        session?.player = SessionPlayer(exo, true)
        val out = JSONObject()
        val item = exo.currentMediaItem
        if (item != null) {
            runCatching { out.put("item", JSONObject(item.mediaId)) }
            out.put("position", exo.currentPosition / 1000.0)
            out.put("duration", if (exo.duration == C.TIME_UNSET) -1.0 else exo.duration / 1000.0)
            out.put("playing", exo.playWhenReady && exo.playbackState != Player.STATE_ENDED)
            out.put("ended", exo.playbackState == Player.STATE_ENDED)
            // the page plays one song at a time: the saved songs the player had queued go
            val index = exo.currentMediaItemIndex
            if (index + 1 < exo.mediaItemCount) exo.removeMediaItems(index + 1, exo.mediaItemCount)
            if (index > 0) exo.removeMediaItems(0, index)
        }
        exo.repeatMode = Player.REPEAT_MODE_OFF
        exo.shuffleModeEnabled = false
        return out
    }

    // The page is gone (the app was closed while this plays): the player goes on by itself through the saved songs.
    fun detachPage(p: Page) {
        if (page !== p) return
        page = null
        session?.player = SessionPlayer(exo, false)
        val current = exo.currentMediaItem ?: return
        val (items, _) = resumeItems(this)
        // the page told what comes after the song it played last; the first is that song
        if (items.size > 1 && items[0].mediaId == current.mediaId) exo.addMediaItems(items.subList(1, items.size))
        else if (items.size > 1 && sameSong(items[0], current)) exo.addMediaItems(items.subList(1, items.size))
        applyModes()
    }

    private fun sameSong(a: MediaItem, b: MediaItem): Boolean {
        val x = runCatching { JSONObject(a.mediaId) }.getOrNull() ?: return false
        val y = runCatching { JSONObject(b.mediaId) }.getOrNull() ?: return false
        return x.optString("title") == y.optString("title") && x.optString("artist") == y.optString("artist")
    }

    fun load(item: MediaItem, startMs: Long, play: Boolean) {
        exo.setMediaItem(item, startMs.coerceAtLeast(0))
        exo.prepare()
        exo.playWhenReady = play
    }

    // playing the page's songs stopped (it switched to its own player for the sound effects)
    fun clear() {
        exo.stop()
        exo.clearMediaItems()
    }

    fun setSpeed(speed: Float, pitch: Float) {
        exo.playbackParameters = PlaybackParameters(speed.coerceIn(0.1f, 8f), pitch.coerceIn(0.1f, 8f))
    }

    // shuffle and repeat as the page has them, for the buttons beside previous / next
    fun setModes(shuffle: Boolean, repeat: String) {
        this.shuffle = shuffle
        this.repeat = if (repeat == "all" || repeat == "one") repeat else "off"
        updateButtons()
    }

    // without the page, the player follows them itself
    private fun applyModes() {
        if (page != null) return
        exo.shuffleModeEnabled = shuffle
        exo.repeatMode = when (repeat) {
            "one" -> Player.REPEAT_MODE_ONE
            "all" -> Player.REPEAT_MODE_ALL
            else -> Player.REPEAT_MODE_OFF
        }
    }

    private fun updateButtons() {
        val s = session ?: return
        val shuffleButton = CommandButton.Builder(if (shuffle) CommandButton.ICON_SHUFFLE_ON else CommandButton.ICON_SHUFFLE_OFF)
            .setDisplayName(if (shuffle) "Shuffle on" else "Shuffle off")
            .setSessionCommand(SessionCommand(CMD_SHUFFLE, Bundle.EMPTY))
            .setSlots(CommandButton.SLOT_BACK_SECONDARY)
            .build()
        val repeatButton = CommandButton.Builder(
            when (repeat) { "one" -> CommandButton.ICON_REPEAT_ONE; "all" -> CommandButton.ICON_REPEAT_ALL; else -> CommandButton.ICON_REPEAT_OFF },
        )
            .setDisplayName(when (repeat) { "one" -> "Repeat this song"; "all" -> "Repeat playlist"; else -> "Repeat off" })
            .setSessionCommand(SessionCommand(CMD_REPEAT, Bundle.EMPTY))
            .setSlots(CommandButton.SLOT_FORWARD_SECONDARY)
            .build()
        s.setMediaButtonPreferences(ImmutableList.of(shuffleButton, repeatButton))
    }

    // where the player is, for the page: { item, state (1 idle, 2 loading, 3 ready, 4 ended), playWhenReady,
    // playing, position, duration (-1: not known yet), rate, at (when position was read) }
    private fun report() {
        val p = page ?: return
        val o = JSONObject()
        o.put("item", exo.currentMediaItem?.mediaId ?: "")
        o.put("state", exo.playbackState)
        o.put("playWhenReady", exo.playWhenReady)
        o.put("playing", exo.isPlaying)
        o.put("position", exo.currentPosition / 1000.0)
        o.put("duration", if (exo.duration == C.TIME_UNSET) -1.0 else exo.duration / 1000.0)
        o.put("rate", exo.playbackParameters.speed.toDouble())
        o.put("at", System.currentTimeMillis())
        p.onState(o)
    }
}
