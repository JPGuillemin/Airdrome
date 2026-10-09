package com.jpguillemin.airdrome;

import android.content.Context;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.extractor.DefaultExtractorsFactory;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ExoPlayer (Media3) backend for exo.ts.
 *
 * Two players are kept at most:
 *  - active : the track being played
 *  - buffer : the next track, prepared but paused (promoted by load() when the
 *             key matches, which removes the network round-trip between tracks)
 *
 * Audio focus and "becoming noisy" are NOT handled here: MediaSessionPlugin
 * already does it and the store reacts to its events, exactly as before.
 *
 * Final output level = volume * gain(ReplayGain) * fade
 *  - up to 1.0 : ExoPlayer.setVolume()
 *  - above 1.0 : LoudnessEnhancer (needed because of the +6 dB ReplayGain preamp)
 */
@CapacitorPlugin(name = "ExoPlayer")
public class ExoPlayerPlugin extends Plugin {

  private static final long TICK_MS = 250;

  private final Handler main = new Handler(Looper.getMainLooper());

  private static class Slot {
    final ExoPlayer player;
    final String key;
    String url; // playable URI this player was built with (file:// or remote)
    LoudnessEnhancer enhancer;
    Player.Listener listener;

    Slot(ExoPlayer player, String key) {
      this.player = player;
      this.key = key;
    }
  }

  // All fields below are only touched on the main thread.
  private Slot active;
  private Slot buffer;
  private float volume = 1f;
  private float gain = 1f;
  private float fade = 1f;
  private int fadeGen = 0; // bumped to cancel a running fade
  private int cmdGen = 0;  // bumped by load/play/pause/stop to cancel pending delayed pauses
  private int loadGen = 0; // bumped by load() to abandon superseded loads

  private final Runnable ticker = new Runnable() {
    @Override
    public void run() {
      Slot s = active;
      if (s != null && s.player.isPlaying()) emitTime(s);
      main.postDelayed(this, TICK_MS);
    }
  };

  private boolean tickerStarted = false;

  private void ensureTicker() {
    if (tickerStarted) return;
    tickerStarted = true;
    main.postDelayed(ticker, TICK_MS);
  }

  @Override
  protected void handleOnDestroy() {
    main.removeCallbacksAndMessages(null);
    releaseSlot(active);
    releaseSlot(buffer);
    active = null;
    buffer = null;
    super.handleOnDestroy();
  }

  // ── Plugin methods ────────────────────────────────────────────────────────

  @PluginMethod
  public void load(final PluginCall call) {
    final String url = call.getString("url");
    if (url == null) {
      call.reject("url is required");
      return;
    }
    final String key = call.getString("key", url);
    final boolean paused = Boolean.TRUE.equals(call.getBoolean("paused", false));
    final boolean doFade = Boolean.TRUE.equals(call.getBoolean("fade", false));
    final long fadeOutMs = call.getInt("fadeOutMs", 300);
    final Float vol = call.getFloat("volume");
    final Float g = call.getFloat("gain");
    final long startMs = (long) (call.getDouble("startPosition", 0.0) * 1000.0);

    main.post(() -> {
      final int gen = ++loadGen;
      cmdGen++;
      if (vol != null) volume = vol;
      if (g != null) gain = g;

      final Runnable swap = () -> {
        if (gen != loadGen) { // a newer load() took over
          call.resolve();
          return;
        }
        Slot next = takeBuffer(key, url);
        if (next == null) next = build(url, key);

        Slot old = active;
        active = next;
        fadeGen++;
        fade = 1f; // a new "pipeline" always starts fully open (as in audio.ts)

        attach(next);
        createEnhancer(next, next.player.getAudioSessionId());
        applyLevels();
        releaseSlot(old);

        if (startMs > 0) next.player.seekTo(startMs);

        if (!paused) {
          next.player.setPlayWhenReady(true);
          // audio.ts awaited a short fadeIn after play(); keep the same timing
          main.postDelayed(call::resolve, 150);
        } else {
          call.resolve();
        }
      };

      Slot cur = active;
      if (doFade && cur != null && cur.player.getPlayWhenReady()) {
        fadeTo(0f, fadeOutMs);
        main.postDelayed(swap, fadeOutMs);
      } else {
        swap.run();
      }
    });
  }

  @PluginMethod
  public void preload(final PluginCall call) {
    final String url = call.getString("url");
    if (url == null) {
      call.reject("url is required");
      return;
    }
    final String key = call.getString("key", url);

    main.post(() -> {
      if (buffer != null && key.equals(buffer.key) && url.equals(buffer.url) && buffer.player.getPlayerError() == null) {
        call.resolve();
        return;
      }
      releaseSlot(buffer);
      buffer = build(url, key);
      buffer.player.setVolume(0f);
      call.resolve();
    });
  }

  @PluginMethod
  public void play(final PluginCall call) {
    final long fadeMs = call.getInt("fadeInMs", 150);
    main.post(() -> {
      Slot s = active;
      if (s == null) {
        call.resolve();
        return;
      }
      cmdGen++;
      if (s.player.getPlaybackState() == Player.STATE_ENDED) s.player.seekTo(0);
      s.player.setPlayWhenReady(true);
      fadeTo(1f, fadeMs);
      main.postDelayed(call::resolve, fadeMs);
    });
  }

  @PluginMethod
  public void pause(final PluginCall call) {
    final long fadeMs = call.getInt("fadeOutMs", 300);
    main.post(() -> {
      final Slot s = active;
      if (s == null || !s.player.getPlayWhenReady()) {
        call.resolve();
        return;
      }
      final int gen = ++cmdGen;
      fadeTo(0f, fadeMs);
      main.postDelayed(() -> {
        // Ignore if a play()/load()/stop() happened during the fade
        if (gen == cmdGen && active == s) s.player.setPlayWhenReady(false);
        call.resolve();
      }, fadeMs);
    });
  }

  @PluginMethod
  public void stop(final PluginCall call) {
    main.post(() -> {
      cmdGen++;
      loadGen++;
      fadeGen++;
      Slot s = active;
      boolean wasPlaying = s != null && s.player.getPlayWhenReady();
      active = null; // detaches events from the old player
      releaseSlot(s);
      releaseSlot(buffer);
      buffer = null;
      if (wasPlaying) emit("pause");
      call.resolve();
    });
  }

  @PluginMethod
  public void seek(final PluginCall call) {
    final long posMs = (long) (call.getDouble("position", 0.0) * 1000.0);
    final long fadeMs = call.getInt("fadeMs", 150);
    main.post(() -> {
      Slot s = active;
      if (s == null) {
        call.resolve();
        return;
      }
      boolean playing = s.player.getPlayWhenReady();
      if (playing) { // brief dip to avoid a click at the seek point
        fadeGen++;
        fade = 0f;
        applyLevels();
      }
      Log.d("ExoPlayerPlugin", "seek to=" + posMs + "ms seekable=" + s.player.isCurrentMediaItemSeekable()
        + " state=" + s.player.getPlaybackState() + " duration=" + s.player.getDuration()
        + " url=" + s.url);
      s.player.seekTo(posMs);
      if (playing) fadeTo(1f, fadeMs);
      emitTime(s);
      call.resolve();
    });
  }

  @PluginMethod
  public void setLevels(final PluginCall call) {
    final Float vol = call.getFloat("volume");
    final Float g = call.getFloat("gain");
    main.post(() -> {
      if (vol != null) volume = vol;
      if (g != null) gain = g;
      applyLevels();
      call.resolve();
    });
  }

  // ── Player management ─────────────────────────────────────────────────────

  private Slot build(String url, String key) {
    ensureTicker();
    Context ctx = getContext();
    // Approximate (constant-bitrate) seeking, enabled even when the stream length
    // is unknown (transcoded / chunked Subsonic responses). This is what makes
    // seeking work on remote tracks that are not cached yet: ExoPlayer maps
    // time -> byte offset from the bitrate and re-requests the stream from there
    // (or skips bytes when the server ignores HTTP Range).
    DefaultExtractorsFactory extractors = new DefaultExtractorsFactory()
      .setConstantBitrateSeekingEnabled(true)
      .setConstantBitrateSeekingAlwaysEnabled(true);
    ExoPlayer p = new ExoPlayer.Builder(ctx, new DefaultMediaSourceFactory(ctx, extractors))
      .setAudioAttributes(
        new AudioAttributes.Builder()
          .setUsage(C.USAGE_MEDIA)
          .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
          .build(),
        /* handleAudioFocus= */ false
      )
      .setHandleAudioBecomingNoisy(false)
      .setWakeMode(C.WAKE_MODE_NETWORK) // keep CPU + Wi-Fi awake while playing
      .build();
    p.setMediaItem(MediaItem.fromUri(url));
    p.setPlayWhenReady(false);
    p.prepare();
    Slot slot = new Slot(p, key);
    slot.url = url;
    return slot;
  }

  /**
   * Returns the preloaded slot if it matches `key` AND was built from the same
   * URI; drops it otherwise. A buffer preloaded from the remote URL is discarded
   * once the track has been cached: the local file is instant to open and, unlike
   * a (possibly transcoded) HTTP stream, reliably seekable.
   */
  private Slot takeBuffer(String key, String url) {
    Slot b = buffer;
    buffer = null;
    if (b == null) return null;
    if (key.equals(b.key) && url.equals(b.url) && b.player.getPlayerError() == null) return b;
    releaseSlot(b);
    return null;
  }

  private void releaseSlot(Slot s) {
    if (s == null) return;
    try {
      if (s.listener != null) s.player.removeListener(s.listener);
      if (s.enhancer != null) s.enhancer.release();
      s.player.release();
    } catch (Exception ignored) {
    }
  }

  private void attach(final Slot s) {
    s.listener = new Player.Listener() {
      @Override
      public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
        if (s != active) return;
        emit(playWhenReady ? "play" : "pause");
      }

      @Override
      public void onIsPlayingChanged(boolean isPlaying) {
        if (s != active) return;
        if (isPlaying) emit("playing");
      }

      @Override
      public void onPlaybackStateChanged(int state) {
        if (s != active) return;
        if (state == Player.STATE_READY) {
          emitDuration(s);
          emitTime(s); // report the real position right after a seek/buffering
        } else if (state == Player.STATE_BUFFERING && s.player.getPlayWhenReady()) {
          emit("waiting");
        } else if (state == Player.STATE_ENDED) {
          emit("pause"); // HTMLAudioElement fires pause, then ended
          emit("ended");
        }
      }

      @Override
      public void onPositionDiscontinuity(Player.PositionInfo oldPos, Player.PositionInfo newPos, int reason) {
        if (s != active) return;
        if (reason == Player.DISCONTINUITY_REASON_SEEK) emitTime(s);
      }

      @Override
      public void onPlayerError(PlaybackException error) {
        if (s != active) return;
        JSObject o = new JSObject();
        o.put("code", error.errorCode);
        o.put("message", error.getErrorCodeName());
        notifyListeners("error", o);
      }

      @Override
      public void onAudioSessionIdChanged(int audioSessionId) {
        createEnhancer(s, audioSessionId);
        if (s == active) applyLevels();
      }
    };
    s.player.addListener(s.listener);
  }

  // ── Levels & fades ────────────────────────────────────────────────────────

  private void createEnhancer(Slot s, int sessionId) {
    try {
      if (s.enhancer != null) s.enhancer.release();
      s.enhancer = null;
      if (sessionId == C.AUDIO_SESSION_ID_UNSET) return;
      LoudnessEnhancer e = new LoudnessEnhancer(sessionId);
      e.setTargetGain(0);
      e.setEnabled(true);
      s.enhancer = e;
    } catch (Exception ignored) {
      s.enhancer = null; // device without the effect: gain is then clamped to 1.0
    }
  }

  private void applyLevels() {
    Slot s = active;
    if (s == null) return;
    float total = volume * gain * fade;
    s.player.setVolume(Math.min(1f, Math.max(0f, total)));
    if (s.enhancer != null) {
      try {
        int mB = total > 1f ? (int) Math.round(2000.0 * Math.log10(total)) : 0; // 100 mB per dB
        s.enhancer.setTargetGain(mB);
      } catch (Exception ignored) {
      }
    }
  }

  /**
   * Linear ramp of the fade factor. Driven by a Handler (not ValueAnimator,
   * which stops ticking when the app is in the background).
   */
  private void fadeTo(final float target, final long durationMs) {
    final int gen = ++fadeGen;
    final float start = fade;
    if (durationMs <= 0) {
      fade = target;
      applyLevels();
      return;
    }
    final long t0 = SystemClock.uptimeMillis();
    main.post(new Runnable() {
      @Override
      public void run() {
        if (gen != fadeGen) return; // superseded, like cancelScheduledValues()
        float k = Math.min(1f, (SystemClock.uptimeMillis() - t0) / (float) durationMs);
        fade = start + (target - start) * k;
        applyLevels();
        if (k < 1f) main.postDelayed(this, 16);
      }
    });
  }

  // ── Events to JS ──────────────────────────────────────────────────────────

  private void emit(String name) {
    notifyListeners(name, new JSObject());
  }

  private void emitTime(Slot s) {
    JSObject o = new JSObject();
    o.put("position", s.player.getCurrentPosition() / 1000.0);
    long d = s.player.getDuration();
    o.put("duration", d == C.TIME_UNSET ? 0.0 : d / 1000.0);
    notifyListeners("time", o);
  }

  private void emitDuration(Slot s) {
    long d = s.player.getDuration();
    if (d == C.TIME_UNSET || d <= 0) return;
    JSObject o = new JSObject();
    o.put("duration", d / 1000.0);
    notifyListeners("duration", o);
  }
}
