package io.github.esperant0s.uriel

import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The visualizer's bars for the native player: what the page's AnalyserNode gives on computers (64 bands from a
 * 128-sample FFT, -100 to -30 dB as 0..255, smoothed 0.8). It reads the samples EffectsProcessor sends out, on
 * ExoPlayer's playback thread, and keeps the last second and a half of snapshots, each marked with the sample it
 * was taken at. The sound is processed ahead of when it is heard, so PlayerService asks for the snapshot of the
 * sample playing now (see PlayerService.vizTick). No microphone permission is needed, unlike Android's Visualizer.
 */
class Spectrum {
    @Volatile var rate = 0
        private set
    // samples sent out since the last seek or new song, and how many flushes there were (both read by the main thread)
    @Volatile var sinceFlush = 0L
        private set
    @Volatile var flushes = 0
        private set
    private var total = 0L
    private var flushTotal = 0L

    private val window = FloatArray(N)
    private var filled = 0
    private var untilNext = 0

    private val at = LongArray(KEEP)
    private val bars = Array(KEEP) { FloatArray(BANDS) }
    private var head = 0
    private var count = 0

    private val re = FloatArray(N)
    private val im = FloatArray(N)
    private val smoothed = FloatArray(BANDS)

    fun flush() = synchronized(this) {
        flushTotal = total
        sinceFlush = 0
        count = 0
        filled = 0
        flushes++
    }

    fun feed(out: ByteBuffer, channels: Int, sampleRate: Int) {
        if (channels <= 0) return
        rate = sampleRate
        val b = out.duplicate().order(out.order()) // a copy starts out big-endian; the samples are in the device's order
        val frames = b.remaining() / (2 * channels)
        val every = maxOf(N, sampleRate / SNAPSHOTS_PER_SECOND)
        repeat(frames) {
            var m = 0f
            for (c in 0 until channels) m += b.short / 32768f
            window[filled % N] = m / channels
            filled++
            total++
            if (--untilNext <= 0 && filled >= N) {
                untilNext = every
                snapshot()
            }
        }
        sinceFlush = total - flushTotal
    }

    private fun snapshot() {
        // the last N samples, oldest first, through a Blackman window (as Web Audio's AnalyserNode does)
        for (i in 0 until N) {
            val x = window[(filled + i) % N]
            re[i] = x * BLACKMAN[i]
            im[i] = 0f
        }
        fft(re, im)
        synchronized(this) {
            val slot = bars[head]
            for (k in 0 until BANDS) slot[k] = sqrt(re[k] * re[k] + im[k] * im[k]) / N
            at[head] = total
            head = (head + 1) % KEEP
            if (count < KEEP) count++
        }
    }

    // the bars (0..255) for the sample `wanted` samples after the last flush, smoothed with the ones before
    fun barsAt(wanted: Long): ByteArray? = synchronized(this) {
        if (count == 0) return null
        val target = flushTotal + wanted
        var pick = -1
        for (n in 0 until count) {
            val i = (head - 1 - n + KEEP) % KEEP
            if (at[i] <= target) { pick = i; break }
        }
        if (pick < 0) pick = (head - count + KEEP) % KEEP
        val out = ByteArray(BANDS)
        for (k in 0 until BANDS) {
            smoothed[k] = SMOOTHING * smoothed[k] + (1 - SMOOTHING) * bars[pick][k]
            val db = if (smoothed[k] > 0f) 20 * log10(smoothed[k]) else MIN_DB
            out[k] = (255 * (db - MIN_DB) / (MAX_DB - MIN_DB)).coerceIn(0f, 255f).toInt().toByte()
        }
        out
    }

    private companion object {
        const val N = 128
        const val BANDS = N / 2
        const val SNAPSHOTS_PER_SECOND = 40
        const val KEEP = 60
        const val SMOOTHING = 0.8f
        const val MIN_DB = -100f
        const val MAX_DB = -30f
        val BLACKMAN = FloatArray(N) { i ->
            val a = 2 * PI * i / N
            (0.42 - 0.5 * cos(a) + 0.08 * cos(2 * a)).toFloat()
        }

        // in place, radix 2
        fun fft(re: FloatArray, im: FloatArray) {
            val n = re.size
            var j = 0
            for (i in 1 until n) {
                var bit = n shr 1
                while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
                j = j xor bit
                if (i < j) {
                    var t = re[i]; re[i] = re[j]; re[j] = t
                    t = im[i]; im[i] = im[j]; im[j] = t
                }
            }
            var len = 2
            while (len <= n) {
                val ang = -2 * PI / len
                for (i in 0 until n step len) {
                    for (k in 0 until len / 2) {
                        val wr = cos(ang * k).toFloat()
                        val wi = sin(ang * k).toFloat()
                        val ur = re[i + k]; val ui = im[i + k]
                        val xr = re[i + k + len / 2]; val xi = im[i + k + len / 2]
                        val vr = xr * wr - xi * wi
                        val vi = xr * wi + xi * wr
                        re[i + k] = ur + vr; im[i + k] = ui + vi
                        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
                    }
                }
                len = len shl 1
            }
        }
    }
}
