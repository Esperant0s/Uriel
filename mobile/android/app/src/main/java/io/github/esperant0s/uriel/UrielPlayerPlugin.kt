package io.github.esperant0s.uriel

import android.content.ComponentName
import android.net.Uri
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject
import java.io.File

/**
 * The page's way to the native player (PlayerService), used by mobile/native-audio.ts in place of an <audio>
 * element. Calls run in the order the page makes them. Events: "state" (where the player is), "action" (a button
 * the page answers: play, pause, next, prev, shuffle, repeat) and "error".
 */
@OptIn(UnstableApi::class)
@CapacitorPlugin(name = "UrielPlayer")
class UrielPlayerPlugin : Plugin(), PlayerService.Page {
    // keeps the service running and its session known to the system while the page is open
    private var controller: ListenableFuture<MediaController>? = null

    override fun load() {
        connect()
    }

    private fun connect(): ListenableFuture<MediaController> {
        controller?.let { return it }
        val token = SessionToken(context, ComponentName(context, PlayerService::class.java))
        return MediaController.Builder(context, token).buildAsync().also { controller = it }
    }

    // runs on the main thread once the service is there, in the order the calls came
    private fun withPlayer(call: PluginCall, block: (PlayerService) -> Unit) {
        connect().addListener({
            val service = PlayerService.instance
            if (service == null) {
                call.reject("the player isn't running")
                return@addListener
            }
            try {
                block(service)
            } catch (e: Exception) {
                call.reject(e.message ?: e.toString())
            }
        }, ContextCompat.getMainExecutor(context))
    }

    // The page numbers what it asks (native-audio.ts _seq): the player's news says which request it has got to, so
    // the page can tell news read before its request from news after it.
    private fun done(call: PluginCall, s: PlayerService) {
        call.getInt("seq")?.let { s.pageSeq = it }
    }

    // The page is running and takes over: { item, position, duration, playing, ended } when the player has a song
    @PluginMethod
    fun attach(call: PluginCall) = withPlayer(call) { s -> call.resolve(JSObject.fromJSONObject(s.attachPage(this))) }

    // A song: path (a file on the phone) or url, with what the notification shows ({ title, artist, album, artwork,
    // thumb, duration, qi, ... }, given back as "item" in state events), from startAt seconds, playing or not.
    @PluginMethod
    fun load(call: PluginCall) = withPlayer(call) { s ->
        done(call, s)
        val path = call.getString("path", "") ?: ""
        val url = call.getString("url", "") ?: ""
        val uri = when {
            path.startsWith("/") -> Uri.fromFile(File(path))
            url.isNotEmpty() -> Uri.parse(url)
            else -> {
                call.reject("no song")
                return@withPlayer
            }
        }
        val info = call.getObject("item") ?: JSObject()
        val item = PlayerService.describe(context, uri, JSONObject(info.toString()))
        s.load(item, ((call.getDouble("startAt") ?: 0.0) * 1000).toLong(), call.getBoolean("play", false) == true)
        call.resolve()
    }

    @PluginMethod
    fun play(call: PluginCall) = withPlayer(call) { s ->
        done(call, s)
        // a finished song plays again from its top, like an <audio> element's play()
        if (s.exo.playbackState == androidx.media3.common.Player.STATE_ENDED) s.exo.seekTo(0)
        if (s.exo.playbackState == androidx.media3.common.Player.STATE_IDLE) s.exo.prepare()
        s.exo.play()
        call.resolve()
    }

    @PluginMethod
    fun pause(call: PluginCall) = withPlayer(call) { s ->
        done(call, s)
        // done: the page has moved on from this song (the next one is on its way)
        if (call.getBoolean("done", false) == true) s.parked = true
        s.exo.pause()
        call.resolve()
    }

    @PluginMethod
    fun seek(call: PluginCall) = withPlayer(call) { s ->
        done(call, s)
        s.exo.seekTo(((call.getDouble("position") ?: 0.0) * 1000).toLong().coerceAtLeast(0))
        call.resolve()
    }

    // speed and pitch, as the page's sound settings ask (audio-engine.js playbackFor)
    @PluginMethod
    fun setSpeed(call: PluginCall) = withPlayer(call) { s ->
        val speed = (call.getDouble("speed") ?: 1.0).toFloat()
        val pitch = if (call.getBoolean("preservePitch", true) == true) 1f else speed
        s.setSpeed(speed, pitch)
        call.resolve()
    }

    @PluginMethod
    fun setVolume(call: PluginCall) = withPlayer(call) { s ->
        s.exo.volume = (call.getDouble("volume") ?: 1.0).toFloat().coerceIn(0f, 1f)
        call.resolve()
    }

    @PluginMethod
    fun setModes(call: PluginCall) = withPlayer(call) { s ->
        s.setModes(call.getBoolean("shuffle", false) == true, call.getString("repeat", "off") ?: "off")
        call.resolve()
    }

    // the sound settings: Enhance, EQ, Effects and Normalize volume (EffectsProcessor.Settings)
    @PluginMethod
    fun setEffects(call: PluginCall) = withPlayer(call) { s ->
        s.setEffects(JSONObject(call.data.toString()))
        call.resolve()
    }

    // ---- the crossfade's second player (mobile/native-audio.ts NativeTail); events: "tail" ----

    @PluginMethod
    fun tailLoad(call: PluginCall) = withPlayer(call) { s ->
        val id = call.getString("id") ?: ""
        val path = call.getString("path", "") ?: ""
        val url = call.getString("url", "") ?: ""
        val uri = if (path.startsWith("/")) Uri.fromFile(File(path)) else Uri.parse(url)
        s.tailLoad(id, uri, ((call.getDouble("startAt") ?: 0.0) * 1000).toLong()) { o -> notifyListeners("tail", JSObject.fromJSONObject(o)) }
        call.resolve()
    }

    // play, pause, seek (position), volume, speed (+ preservePitch): whichever are given
    @PluginMethod
    fun tailSet(call: PluginCall) = withPlayer(call) { s ->
        val t = s.tail(call.getString("id") ?: "")
        if (t != null) {
            call.getDouble("volume")?.let { t.volume = it.toFloat().coerceIn(0f, 1f) }
            call.getDouble("speed")?.let {
                val speed = it.toFloat().coerceIn(0.1f, 8f)
                t.playbackParameters = androidx.media3.common.PlaybackParameters(speed, if (call.getBoolean("preservePitch", true) == true) 1f else speed)
            }
            call.getDouble("position")?.let { t.seekTo((it * 1000).toLong().coerceAtLeast(0)) }
            call.getBoolean("play")?.let { if (it) t.play() else t.pause() }
        }
        call.resolve()
    }

    @PluginMethod
    fun tailStop(call: PluginCall) = withPlayer(call) { s ->
        s.tailStop(call.getString("id") ?: "")
        call.resolve()
    }

    // no song any more (the page plays this one through its own player: a stream only it can open)
    @PluginMethod
    fun clear(call: PluginCall) = withPlayer(call) { s ->
        s.clear()
        call.resolve()
    }

    // ---- PlayerService.Page (main thread) ----

    override fun onAction(action: String) {
        notifyListeners("action", JSObject().put("action", action))
    }

    override fun onState(state: JSONObject) {
        notifyListeners("state", JSObject.fromJSONObject(state))
    }

    override fun onError(code: Int, message: String) {
        notifyListeners("error", JSObject().put("code", code).put("message", message))
    }

    override fun handleOnDestroy() {
        // the app is closing: a song playing goes on without it
        PlayerService.instance?.detachPage(this)
        controller?.let { MediaController.releaseFuture(it) }
        controller = null
        super.handleOnDestroy()
    }
}
