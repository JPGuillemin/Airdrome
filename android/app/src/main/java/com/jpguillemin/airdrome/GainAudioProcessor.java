package com.jpguillemin.airdrome;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.util.UnstableApi;

import java.nio.ByteBuffer;
import java.nio.FloatBuffer;
import java.nio.ShortBuffer;

/**
 * Applies the linear ReplayGain boost to decoded PCM.
 *
 * ExoPlayer clamps {@code setVolume()} to [0, 1], and the platform
 * {@code LoudnessEnhancer} effect is not available (or does not attach) on
 * every device. Quiet tracks need a gain above 1.0, so the boost is applied
 * here in the PCM chain, exactly like the Web Audio gain node:
 *
 * <pre>
 *   output = pcm * boost,  boost = max(1, volume * gain * fade * duck)
 *   player volume = min(1, volume * gain * fade * duck)
 * </pre>
 *
 * The product is unchanged; only the part that cannot be expressed as a
 * player volume is handled by this processor. Samples are hard-clamped to
 * the PCM range, but the ReplayGain peak clamp in the JS layer keeps the
 * signal below full scale for correctly tagged tracks.
 */
@UnstableApi
final class GainAudioProcessor extends BaseAudioProcessor {

  /** Linear boost; 1.0 means passthrough. Written on main, read on the audio thread. */
  private volatile float boost = 1f;

  /** Encoding seen by the last onConfigure() call. */
  private int encoding = C.ENCODING_INVALID;

  /**
   * Set the linear boost. Values below 1 are ignored: attenuation is handled
   * by the player volume so this processor stays a pure passthrough.
   *
   * @param value linear gain
   */
  void setBoost(float value) {
    boost = value > 1f ? value : 1f;
  }

  @Override
  protected AudioFormat onConfigure(AudioFormat inputAudioFormat)
      throws UnhandledAudioFormatException {
    if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT
        && inputAudioFormat.encoding != C.ENCODING_PCM_FLOAT) {
      // Unsupported encoding: stay inactive instead of breaking playback.
      return AudioFormat.NOT_SET;
    }

    encoding = inputAudioFormat.encoding;
    return inputAudioFormat;
  }

  @Override
  public void queueInput(ByteBuffer inputBuffer) {
    int remaining = inputBuffer.remaining();

    if (remaining == 0) {
      return;
    }

    float gain = boost;
    ByteBuffer outputBuffer = replaceOutputBuffer(remaining);

    if (gain <= 1.001f) {
      outputBuffer.put(inputBuffer);
    } else if (encoding == C.ENCODING_PCM_FLOAT) {
      FloatBuffer source = inputBuffer.asFloatBuffer();
      FloatBuffer target = outputBuffer.asFloatBuffer();

      while (source.hasRemaining()) {
        target.put(limit(source.get() * gain));
      }

      inputBuffer.position(inputBuffer.position() + remaining);
      outputBuffer.position(remaining);
    } else {
      ShortBuffer source = inputBuffer.asShortBuffer();
      ShortBuffer target = outputBuffer.asShortBuffer();

      while (source.hasRemaining()) {
        float sample = limit(source.get() * gain / 32768f) * 32767f;
        target.put((short) Math.round(sample));
      }

      inputBuffer.position(inputBuffer.position() + remaining);
      outputBuffer.position(remaining);
    }

    outputBuffer.flip();
  }

  /**
   * Soft limiter matching the Web Audio compressor: 2:1 above -3 dBFS,
   * hard-capped at full scale. Prevents clipping without cancelling the
   * ReplayGain boost.
   *
   * @param sample input sample in [-1, 1] (may exceed after gain)
   * @return limited sample in [-1, 1]
   */
  private static float limit(float sample) {
    float sign = sample < 0 ? -1f : 1f;
    float value = Math.abs(sample);

    if (value > 0.707f) {
      value = 0.707f + (value - 0.707f) / 2f;
    }

    return sign * Math.min(value, 1f);
  }
}
