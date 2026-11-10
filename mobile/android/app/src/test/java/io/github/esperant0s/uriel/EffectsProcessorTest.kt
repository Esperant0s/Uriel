package io.github.esperant0s.uriel

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

// The native player's sound settings (EffectsProcessor): tones in, and what comes out measured.
class EffectsProcessorTest {
    private val rate = 44100

    private fun run(settings: String, left: FloatArray): FloatArray {
        val p = EffectsProcessor()
        p.setSettings(EffectsProcessor.Settings(JSONObject(settings)))
        p.configure(AudioProcessor.AudioFormat(rate, 2, C.ENCODING_PCM_16BIT))
        p.flush()
        val out = FloatArray(left.size)
        var done = 0
        // in pieces, as ExoPlayer hands them over
        for (start in left.indices step 4096) {
            val n = minOf(4096, left.size - start)
            val b = ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder())
            for (i in 0 until n) { val v = (left[start + i] * 32767).toInt().toShort(); b.putShort(v); b.putShort(v) }
            b.flip()
            p.queueInput(b)
            val o = p.output
            while (o.hasRemaining()) { out[done++] = o.short / 32768f; o.short }
        }
        assertEquals(left.size, done)
        return out
    }

    private fun tone(freq: Double, level: Double, seconds: Double) =
        FloatArray((rate * seconds).toInt()) { (level * sin(2 * PI * freq * it / rate)).toFloat() }

    // the level of the second half, once filters have settled
    private fun db(x: FloatArray): Double {
        var sum = 0.0
        for (i in x.size / 2 until x.size) sum += x[i] * x[i]
        return 10 * log10(sum / (x.size - x.size / 2))
    }

    private fun gain(settings: String, freq: Double): Double {
        val x = tone(freq, 0.1, 1.0)
        return db(run(settings, x)) - db(x)
    }

    @Test
    fun withEverythingOffTheSongIsUntouched() {
        val x = tone(440.0, 0.5, 0.2)
        val quantized = FloatArray(x.size) { (x[it] * 32767).toInt().toShort() / 32768f }
        assertArrayEquals(quantized, run("{}", x), 0f)
    }

    @Test
    fun anEqBandLiftsItsOwnPitchAndLeavesTheRest() {
        val eq = """{"eqBands":[0,0,0,0,0,6,0,0,0,0]}"""
        assertEquals(6.0, gain(eq, 1000.0), 0.2)
        assertEquals(0.0, gain(eq, 60.0), 0.2)
        assertEquals(0.0, gain(eq, 12000.0), 0.2)
        assertEquals(-12.0, gain("""{"eqBands":[0,0,0,0,0,-12,0,0,0,0]}""", 1000.0), 0.2)
    }

    @Test
    fun theThreeBandEqIsShelvesAndAPeak() {
        assertEquals(6.0, gain("""{"eq":{"low":6,"mid":0,"high":0}}""", 30.0), 0.5)
        assertEquals(0.0, gain("""{"eq":{"low":6,"mid":0,"high":0}}""", 5000.0), 0.3)
        assertEquals(-5.0, gain("""{"eq":{"low":0,"mid":-5,"high":0}}""", 1000.0), 0.2)
        assertEquals(8.0, gain("""{"eq":{"low":0,"mid":0,"high":8}}""", 16000.0), 0.5)
    }

    @Test
    fun aSongsOwnVolumeGoesAboveFull() {
        assertEquals(6.02, gain("""{"volume":2}""", 440.0), 0.1)
        assertEquals(-6.02, gain("""{"volume":0.5}""", 440.0), 0.1)
    }

    @Test
    fun theEchoComesBackAThirdOfASecondLaterAndAgainQuieter() {
        val x = FloatArray(rate)
        x[100] = 0.5f
        val y = run("""{"echo":50}""", x)
        val d = (rate * 0.3).toInt()
        assertEquals(0.5f, y[100], 0.001f)
        assertEquals(0.25f, y[100 + d], 0.001f)
        assertEquals(0.25f * 0.35f, y[100 + 2 * d], 0.001f)
        assertEquals(0f, y[100 + d / 2], 0.0001f)
    }

    @Test
    fun theReverbRingsForAboutHalfASecondAndStops() {
        val x = FloatArray(rate * 2)
        for (i in 0 until 2000) x[i] = (0.5 * sin(2 * PI * 440 * i / rate)).toFloat()
        val y = run("""{"reverb":100}""", x)
        fun energy(from: Double, to: Double): Double {
            var s = 0.0
            for (i in (from * rate).toInt() until (to * rate).toInt()) s += y[i] * y[i]
            return s
        }
        // after the sound itself: a tail that fades
        assertTrue(energy(0.1, 0.2) > 0)
        assertTrue(energy(0.1, 0.2) > 4 * energy(0.4, 0.5))
        assertEquals(0.0, energy(0.8, 2.0), 1e-9)
        // and no louder than Web Audio's evened-out convolver makes it: well under the song
        assertTrue(sqrt(energy(0.1, 0.2) / (0.1 * rate)) < 0.1)
    }

    @Test
    fun distortionAndEnhanceStayInBounds() {
        val x = tone(220.0, 0.9, 0.5)
        for (s in listOf("""{"distortion":100}""", """{"hq":true,"hqEngine":"fyro1.1","hqBass":50,"hqVocal":50,"hqAir":50}""")) {
            val y = run(s, x)
            assertTrue(y.all { !it.isNaN() && abs(it) <= 1f })
            assertTrue(db(y) > -20)
        }
    }

    @Test
    fun normalizeBringsQuietAndLoudSongsTowardsTheSameLevel() {
        val quiet = tone(440.0, 0.01, 12.0)
        val loud = tone(440.0, 0.9, 12.0)
        fun tail(x: FloatArray) = x.copyOfRange(x.size - rate, x.size)
        val q = db(tail(run("""{"normalize":true}""", quiet))) - db(tail(quiet))
        val l = db(tail(run("""{"normalize":true}""", loud))) - db(tail(loud))
        // as far up as it goes (9 dB), and the loud one down
        assertTrue("quiet +$q", q > 7.5)
        assertTrue("loud $l", l < -6)
    }
}
