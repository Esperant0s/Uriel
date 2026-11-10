package io.github.esperant0s.uriel

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import org.json.JSONObject
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Uriel's sound settings for the native player: the Enhance (HQ), EQ and Effects tabs and "Normalize volume".
 *
 * On computers these run in the page's Web Audio graph (shared/audio-engine.js). The native player's sound never
 * passes through the page, so this does the same work on the samples ExoPlayer decodes, in the same order and with
 * the same numbers:
 *
 *   song → [HQ: compressor → bass shelf → vocal peak → air shelf → saturation → limiter]
 *        → [EQ: low shelf, mid peak, high shelf, ten bands] → bus
 *   bus → dry + distortion + echo + reverb → the song's own volume → [normalize: gain → limiter] → out
 *
 * Speed and pitch are ExoPlayer's own (PlayerService.setSpeed), and the volume slider is the player's volume.
 * With everything off the samples pass through untouched.
 */
@OptIn(UnstableApi::class)
class EffectsProcessor : BaseAudioProcessor() {

    // The settings as the page has them (mobile/native-audio.js sends audio-engine.js's audioSettings, hqEnabled,
    // hqSettings and the normalize switch).
    class Settings(o: JSONObject = JSONObject()) {
        val hq = o.optBoolean("hq", false)
        val hqEngine: String = o.optString("hqEngine", "hqmusic-3")
        val hqBass = o.optDouble("hqBass", 0.0)
        val hqVocal = o.optDouble("hqVocal", 0.0)
        val hqAir = o.optDouble("hqAir", 0.0)
        val eqLow = clampDb(o.optJSONObject("eq")?.optDouble("low", 0.0) ?: 0.0)
        val eqMid = clampDb(o.optJSONObject("eq")?.optDouble("mid", 0.0) ?: 0.0)
        val eqHigh = clampDb(o.optJSONObject("eq")?.optDouble("high", 0.0) ?: 0.0)
        val bands = DoubleArray(BAND_FREQS.size) { i -> clampDb(o.optJSONArray("eqBands")?.optDouble(i, 0.0) ?: 0.0) }
        val reverb = (o.optDouble("reverb", 0.0) / 100).coerceIn(0.0, 1.0)
        val echo = (o.optDouble("echo", 0.0) / 100).coerceIn(0.0, 1.0)
        val distortion = o.optDouble("distortion", 0.0).coerceIn(0.0, 100.0)
        val volume = o.optDouble("volume", 1.0).let { if (it.isNaN()) 1.0 else it.coerceIn(0.0, 4.0) }
        val normalize = o.optBoolean("normalize", false)

        val eqOn get() = eqLow != 0.0 || eqMid != 0.0 || eqHigh != 0.0 || bands.any { it != 0.0 }
        val anything get() = hq || eqOn || reverb > 0 || echo > 0 || distortion > 0 || abs(volume - 1.0) > 0.001 || normalize

        private companion object {
            fun clampDb(v: Double) = if (v.isNaN()) 0.0 else v.coerceIn(-12.0, 12.0)
        }
    }

    companion object {
        val BAND_FREQS = doubleArrayOf(32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0)
        private const val ECHO_SECONDS = 0.3
        private const val ECHO_FEEDBACK = 0.35f
        private const val REVERB_SECONDS = 0.6
        private const val REVERB_DECAY_SECONDS = 0.15
        private const val FFT = 1024
        private const val BLOCK = FFT / 2
        // "Normalize volume" (app.js): aims at this level, within these bounds, looking every tenth of a second
        private const val NORM_TARGET_DB = -17.0
        private const val NORM_MAX_DB = 9.0
        private const val NORM_WINDOW = 2048
    }

    @Volatile
    private var wanted = Settings()
    // what the audio thread has set itself up for
    private var applied: Settings? = null
    private var rate = 44100
    private var channels = 2

    fun setSettings(s: Settings) {
        wanted = s
    }

    // ---- the pieces ----

    // A Web Audio BiquadFilterNode: the same formulas (the Audio EQ Cookbook's), one state per channel
    private class Biquad(channels: Int) {
        var b0 = 1f; var b1 = 0f; var b2 = 0f; var a1 = 0f; var a2 = 0f
        var on = false
        private val z1 = FloatArray(channels)
        private val z2 = FloatArray(channels)

        fun run(c: Int, x: Float): Float {
            val y = b0 * x + z1[c]
            z1[c] = b1 * x - a1 * y + z2[c]
            z2[c] = b2 * x - a2 * y
            return y
        }

        fun reset() { z1.fill(0f); z2.fill(0f) }

        private fun set(nb0: Double, nb1: Double, nb2: Double, a0: Double, na1: Double, na2: Double) {
            b0 = (nb0 / a0).toFloat(); b1 = (nb1 / a0).toFloat(); b2 = (nb2 / a0).toFloat()
            a1 = (na1 / a0).toFloat(); a2 = (na2 / a0).toFloat()
        }

        // a filter at or above half the sample rate can't be made: it is left out, as is one that changes nothing
        private fun usable(freq: Double, gainDb: Double, rate: Int): Boolean {
            on = gainDb != 0.0 && freq < rate * 0.49
            if (!on) reset()
            return on
        }

        fun peaking(freq: Double, q: Double, gainDb: Double, rate: Int) {
            if (!usable(freq, gainDb, rate)) return
            val a = 10.0.pow(gainDb / 40)
            val w = 2 * PI * freq / rate
            val alpha = sin(w) / (2 * q)
            set(1 + alpha * a, -2 * cos(w), 1 - alpha * a, 1 + alpha / a, -2 * cos(w), 1 - alpha / a)
        }

        fun lowShelf(freq: Double, gainDb: Double, rate: Int) {
            if (!usable(freq, gainDb, rate)) return
            val a = 10.0.pow(gainDb / 40)
            val w = 2 * PI * freq / rate
            val k = 2 * sqrt(a) * (sin(w) / 2 * sqrt(2.0))
            val c = cos(w)
            set(a * ((a + 1) - (a - 1) * c + k), 2 * a * ((a - 1) - (a + 1) * c), a * ((a + 1) - (a - 1) * c - k),
                (a + 1) + (a - 1) * c + k, -2 * ((a - 1) + (a + 1) * c), (a + 1) + (a - 1) * c - k)
        }

        fun highShelf(freq: Double, gainDb: Double, rate: Int) {
            if (!usable(freq, gainDb, rate)) return
            val a = 10.0.pow(gainDb / 40)
            val w = 2 * PI * freq / rate
            val k = 2 * sqrt(a) * (sin(w) / 2 * sqrt(2.0))
            val c = cos(w)
            set(a * ((a + 1) + (a - 1) * c + k), -2 * a * ((a - 1) + (a + 1) * c), a * ((a + 1) + (a - 1) * c - k),
                (a + 1) - (a - 1) * c + k, 2 * ((a - 1) - (a + 1) * c), (a + 1) - (a - 1) * c - k)
        }
    }

    // A DynamicsCompressorNode: all channels turned down together by what the loudest one asks for, with the make-up
    // gain Web Audio adds (0.6 of what a full-level sound loses).
    private class Compressor {
        private var threshold = 0.0; private var knee = 0.0; private var slope = 0.0
        private var attack = 0f; private var release = 0f
        private var makeup = 1f
        private var gainDb = 0f

        fun set(thresholdDb: Double, kneeDb: Double, ratio: Double, attackSec: Double, releaseSec: Double, rate: Int) {
            threshold = thresholdDb; knee = kneeDb; slope = 1 / ratio - 1
            attack = exp(-1 / (attackSec * rate)).toFloat()
            release = exp(-1 / (releaseSec * rate)).toFloat()
            makeup = 10.0.pow(-0.6 * reduction(0.0) / 20).toFloat()
        }

        // how much (dB, 0 or less) a sound at this level is turned down
        private fun reduction(levelDb: Double): Double {
            val over = levelDb - threshold
            return when {
                2 * over < -knee -> 0.0
                knee > 0 && 2 * abs(over) <= knee -> slope * (over + knee / 2) * (over + knee / 2) / (2 * knee)
                else -> slope * over
            }
        }

        // the gain for this frame, from its loudest sample
        fun gain(peak: Float): Float {
            val target = if (peak < 1e-5f) 0f else reduction(20.0 * log10(peak.toDouble())).toFloat()
            val k = if (target < gainDb) attack else release
            gainDb = target + (gainDb - target) * k
            return makeup * 10f.pow(gainDb / 20f)
        }

        fun reset() { gainDb = 0f }
    }

    // The echo: a delay that feeds a part of itself back in
    private class Echo(samples: Int, channels: Int) {
        private val lines = Array(channels) { FloatArray(max(1, samples)) }
        private var at = 0
        fun read(c: Int) = lines[c][at]
        fun write(c: Int, x: Float) { lines[c][at] = x }
        fun step() { if (++at >= lines[0].size) at = 0 }
        fun reset() { lines.forEach { it.fill(0f) }; at = 0 }
    }

    // The reverb: the bus convolved with a short burst of fading noise, as audio-engine.js's ConvolverNode does. In
    // blocks through an FFT, since doing it sample by sample would take thousands of times the work; the reverb
    // comes one block (12 ms) late, which is what a room does anyway.
    private class Reverb(private val rate: Int, private val channels: Int) {
        private val parts: Int
        // the noise's spectrum, block by block, per channel
        private val irRe: Array<Array<FloatArray>>
        private val irIm: Array<Array<FloatArray>>
        // the spectra of the last blocks of the song, newest at `head`
        private val inRe: Array<Array<FloatArray>>
        private val inIm: Array<Array<FloatArray>>
        private var head = 0
        private val prev = Array(channels) { FloatArray(BLOCK) }
        private val input = Array(channels) { FloatArray(BLOCK) }
        private val output = Array(channels) { FloatArray(BLOCK) }
        private var at = 0
        private val re = FloatArray(FFT)
        private val im = FloatArray(FFT)
        private val cosT = FloatArray(FFT / 2) { cos(2 * PI * it / FFT).toFloat() }
        private val sinT = FloatArray(FFT / 2) { sin(2 * PI * it / FFT).toFloat() }

        init {
            val length = (rate * REVERB_SECONDS).toInt()
            parts = (length + BLOCK - 1) / BLOCK
            val random = java.util.Random()
            val noise = Array(channels) { FloatArray(parts * BLOCK) }
            var power = 0.0
            for (c in 0 until channels) for (i in 0 until length) {
                val v = ((random.nextDouble() * 2 - 1) * exp(-i / (rate * REVERB_DECAY_SECONDS))).toFloat()
                noise[c][i] = v
                power += v * v
            }
            // a ConvolverNode evens out its burst's loudness (the Web Audio spec's "normalize")
            val rms = sqrt(power / (channels * length))
            val scale = (if (rms > 0) 0.00125 / rms else 0.0) * (44100.0 / rate)
            irRe = Array(channels) { Array(parts) { FloatArray(FFT) } }
            irIm = Array(channels) { Array(parts) { FloatArray(FFT) } }
            for (c in 0 until channels) for (p in 0 until parts) {
                re.fill(0f); im.fill(0f)
                for (i in 0 until BLOCK) re[i] = (noise[c][p * BLOCK + i] * scale).toFloat()
                fft(re, im, false)
                re.copyInto(irRe[c][p]); im.copyInto(irIm[c][p])
            }
            inRe = Array(channels) { Array(parts) { FloatArray(FFT) } }
            inIm = Array(channels) { Array(parts) { FloatArray(FFT) } }
        }

        // the reverb for this sample of the bus (a block behind)
        fun run(c: Int, x: Float): Float {
            val wet = output[c][at]
            input[c][at] = x
            return wet
        }

        // after every channel of a frame
        fun step() {
            if (++at < BLOCK) return
            at = 0
            head = (head + parts - 1) % parts
            for (c in 0 until channels) block(c)
        }

        private fun block(c: Int) {
            // the last block and this one, so each result is whole (overlap-save)
            prev[c].copyInto(re, 0)
            input[c].copyInto(re, BLOCK)
            im.fill(0f)
            input[c].copyInto(prev[c])
            fft(re, im, false)
            re.copyInto(inRe[c][head]); im.copyInto(inIm[c][head])
            re.fill(0f); im.fill(0f)
            for (p in 0 until parts) {
                val xr = inRe[c][(head + p) % parts]; val xi = inIm[c][(head + p) % parts]
                val hr = irRe[c][p]; val hi = irIm[c][p]
                // real sound: the upper half of a spectrum mirrors the lower, so only the lower is worked out
                for (k in 0..FFT / 2) {
                    re[k] += xr[k] * hr[k] - xi[k] * hi[k]
                    im[k] += xr[k] * hi[k] + xi[k] * hr[k]
                }
            }
            for (k in 1 until FFT / 2) { re[FFT - k] = re[k]; im[FFT - k] = -im[k] }
            fft(re, im, true)
            re.copyInto(output[c], 0, BLOCK, FFT)
        }

        private fun fft(re: FloatArray, im: FloatArray, inverse: Boolean) {
            val n = FFT
            var j = 0
            for (i in 1 until n) {
                var bit = n shr 1
                while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
                j = j xor bit
                if (i < j) {
                    val tr = re[i]; re[i] = re[j]; re[j] = tr
                    val ti = im[i]; im[i] = im[j]; im[j] = ti
                }
            }
            var len = 2
            while (len <= n) {
                val step = n / len
                var i = 0
                while (i < n) {
                    for (k in 0 until len / 2) {
                        val wr = cosT[k * step]
                        val wi = if (inverse) sinT[k * step] else -sinT[k * step]
                        val a = i + k; val b = a + len / 2
                        val tr = re[b] * wr - im[b] * wi
                        val ti = re[b] * wi + im[b] * wr
                        re[b] = re[a] - tr; im[b] = im[a] - ti
                        re[a] += tr; im[a] += ti
                    }
                    i += len
                }
                len = len shl 1
            }
            if (inverse) for (i in 0 until n) { re[i] /= n; im[i] /= n }
        }

        fun reset() {
            for (c in 0 until channels) {
                prev[c].fill(0f); input[c].fill(0f); output[c].fill(0f)
                inRe[c].forEach { it.fill(0f) }; inIm[c].forEach { it.fill(0f) }
            }
            at = 0
        }
    }

    private var hqCompressor = Compressor()
    private var hqLimiter = Compressor()
    private var normLimiter = Compressor()
    private var hqFilters = emptyArray<Biquad>()
    private var eqFilters = emptyArray<Biquad>()
    private var hqSaturation = 0f
    private var distortionK = 0f
    private var dryGain = 1f
    private var distortionGain = 0f
    private var echo: Echo? = null
    private var reverb: Reverb? = null
    private var frame = FloatArray(2)
    private var bus = FloatArray(2)
    // normalize: the level of the bus lately, and the gain that follows it
    private var normSum = 0.0
    private var normCount = 0
    private var normEvery = 4410
    private var normAvgDb = -120.0
    private var normGainTarget = 1f
    private var normGain = 1f
    private var normSmooth = 0f

    // ---- AudioProcessor ----

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        // ExoPlayer hands 16-bit samples to its processors; anything else passes by untouched
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) return AudioProcessor.AudioFormat.NOT_SET
        return inputAudioFormat
    }

    override fun onFlush() {
        // a new song or a seek: nothing of the old sound rings on
        applied = null
    }

    override fun onReset() {
        applied = null
        echo = null
        reverb = null
    }

    private fun setUp(s: Settings) {
        val newFormat = rate != inputAudioFormat.sampleRate || channels != inputAudioFormat.channelCount
        rate = inputAudioFormat.sampleRate
        channels = inputAudioFormat.channelCount
        if (frame.size != channels) { frame = FloatArray(channels); bus = FloatArray(channels) }

        // Enhance (audio-engine.js _applyHqParams)
        var baseBass = 0.0; var baseAir = 0.0; var ratio = 1.5
        hqSaturation = 0f
        when (s.hqEngine) {
            "hqmusic-3" -> hqSaturation = 0.5f * 0.02f
            "glyphs-7B" -> { hqSaturation = 0.2f * 0.02f; baseAir = 2.5 }
            "fyro1.1" -> { hqSaturation = 0.2f * 0.02f; baseBass = 3.0; ratio = 2.0 }
        }
        hqCompressor = Compressor().also { it.set(-12.0, 10.0, ratio, 0.01, 0.1, rate) }
        hqLimiter = Compressor().also { it.set(-1.0, 0.0, 20.0, 0.005, 0.05, rate) }
        hqFilters = Array(3) { Biquad(channels) }
        hqFilters[0].lowShelf(80.0, (baseBass + s.hqBass * 0.08).coerceIn(-4.0, 4.0), rate)
        hqFilters[1].peaking(2500.0, 1.2, (s.hqVocal * 0.08).coerceIn(-4.0, 4.0), rate)
        hqFilters[2].highShelf(9000.0, (baseAir + s.hqAir * 0.08).coerceIn(-4.0, 4.0), rate)

        // EQ
        eqFilters = Array(3 + BAND_FREQS.size) { Biquad(channels) }
        eqFilters[0].lowShelf(200.0, s.eqLow, rate)
        eqFilters[1].peaking(1000.0, 0.9, s.eqMid, rate)
        eqFilters[2].highShelf(4000.0, s.eqHigh, rate)
        for (i in BAND_FREQS.indices) eqFilters[3 + i].peaking(BAND_FREQS[i], 1.1, s.bands[i], rate)

        // Effects (audio-engine.js applySettings)
        distortionK = (s.distortion * 2.5).toFloat()
        distortionGain = (s.distortion / 100 * 0.75).toFloat()
        dryGain = (1.0 - s.distortion / 100 * 0.4).toFloat()
        if (s.echo > 0) { if (echo == null || newFormat) echo = Echo((rate * ECHO_SECONDS).toInt(), channels) else echo?.reset() } else echo = null
        if (s.reverb > 0) { if (reverb == null || newFormat) reverb = Reverb(rate, channels) else reverb?.reset() } else reverb = null

        // Normalize volume
        normLimiter = Compressor().also { it.set(-2.0, 0.0, 20.0, 0.003, 0.1, rate) }
        normEvery = rate / 10
        normSmooth = exp(-1 / (0.8 * rate)).toFloat()
        // the level it has measured carries over seeks and songs; only switching it off forgets it (as app.js does)
        if (!s.normalize) { normAvgDb = -120.0; normGain = 1f; normGainTarget = 1f }
        normSum = 0.0
        normCount = 0
        applied = s
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        // ExoPlayer also calls with nothing (its shared empty buffer), to move sound along the chain
        if (!inputBuffer.hasRemaining()) return
        val s = wanted
        val bytes = inputBuffer.remaining()
        val out = replaceOutputBuffer(bytes)
        if (!s.anything) {
            applied = null
            normAvgDb = -120.0; normGain = 1f; normGainTarget = 1f
            out.put(inputBuffer)
            out.flip()
            return
        }
        if (applied !== s) setUp(s)
        val channels = channels
        val frames = bytes / (2 * channels)
        val echoGain = s.echo.toFloat()
        val reverbGain = s.reverb.toFloat()
        val volume = s.volume.toFloat()
        val echo = echo
        val reverb = reverb
        repeat(frames) {
            for (c in 0 until channels) frame[c] = inputBuffer.short / 32768f

            if (s.hq) {
                var peak = 0f
                for (c in 0 until channels) peak = max(peak, abs(frame[c]))
                val g = hqCompressor.gain(peak)
                peak = 0f
                for (c in 0 until channels) {
                    var x = frame[c] * g
                    for (f in hqFilters) if (f.on) x = f.run(c, x)
                    // the saturation: a touch of the third harmonic (audio-engine.js _makeHarmonicCurve)
                    val v = x.coerceIn(-1f, 1f)
                    x = v - hqSaturation * v * v * v
                    frame[c] = x
                    peak = max(peak, abs(x))
                }
                val limit = hqLimiter.gain(peak)
                for (c in 0 until channels) frame[c] *= limit
            }

            var level = 0f
            for (c in 0 until channels) {
                var x = frame[c]
                if (s.eqOn) for (f in eqFilters) if (f.on) x = f.run(c, x)
                bus[c] = x
                level += x
                var y = x * dryGain
                if (distortionGain > 0f) {
                    // audio-engine.js _makeDistortionCurve
                    val v = x.coerceIn(-1f, 1f)
                    y += (3 + distortionK) * v * 20 * (PI.toFloat() / 180) / (PI.toFloat() + distortionK * abs(v)) * distortionGain
                }
                if (echo != null) {
                    val d = echo.read(c)
                    echo.write(c, x + ECHO_FEEDBACK * d)
                    y += d * echoGain
                }
                if (reverb != null) y += reverb.run(c, x) * reverbGain
                frame[c] = y * volume
            }
            echo?.step()
            reverb?.step()

            if (s.normalize) {
                // the bus's level over the last 2048 samples, every tenth of a second (app.js's level watcher)
                normCount++
                if (normCount > normEvery - NORM_WINDOW) { val m = level / channels; normSum += m * m }
                if (normCount >= normEvery) {
                    val rms = sqrt(normSum / min(NORM_WINDOW, normEvery))
                    val db = if (rms > 0) 20 * log10(rms) else -120.0
                    if (db > -50) {
                        normAvgDb = if (normAvgDb <= -120) db else normAvgDb + (db - normAvgDb) * 0.05
                        normGainTarget = 10.0.pow((NORM_TARGET_DB - normAvgDb).coerceIn(-NORM_MAX_DB, NORM_MAX_DB) / 20).toFloat()
                    }
                    normSum = 0.0
                    normCount = 0
                }
                normGain = normGainTarget + (normGain - normGainTarget) * normSmooth
                var peak = 0f
                for (c in 0 until channels) { frame[c] *= normGain; peak = max(peak, abs(frame[c])) }
                val limit = normLimiter.gain(peak)
                for (c in 0 until channels) frame[c] *= limit
            }

            for (c in 0 until channels) out.putShort((frame[c] * 32767f).coerceIn(-32768f, 32767f).toInt().toShort())
        }
        // half a frame left over would be a broken stream: ExoPlayer only hands over whole ones
        inputBuffer.position(inputBuffer.limit())
        out.flip()
    }
}
