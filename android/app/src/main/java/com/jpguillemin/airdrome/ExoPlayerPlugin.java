package com.jpguillemin.airdrome;

import android.content.Context;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.extractor.DefaultExtractorsFactory;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

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
 * Routing policy (the WebView can be frozen for a long time, e.g. after a phone
 * call, so nothing a user can do from the lock screen may depend on JS):
 *  - JS pushes a small "window" of the queue around the current track
 *    (setWindow): previous track, current, next tracks, with their metadata.
 *  - Transport actions coming from the media session (next / previous / play /
 *    pause / stop) are executed natively whenever possible (handleTransport).
 *    Only what native cannot decide (end of queue, radio, ...) goes to JS.
 *  - End of track: the next track of the window is started natively. JS only
 *    gets "ended" when the window is exhausted.
 *  - Whenever native changes track by itself it emits "trackChanged"; JS then
 *    just follows (queue index, UI) without reloading anything.
 *  - The media session metadata / state are published from here too.
 *  - Audio focus changes (phone call, other app) and audio route changes
 *    (headset / Bluetooth in or out) are reacted to here, natively: pause on
 *    loss and remember it, resume on gain unless the user paused meanwhile,
 *    duck, auto-play / auto-pause on route change. JS is not involved at all;
 *    it only sees the resulting play / pause events.
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
  private float duck = 1f;    // temporary attenuation while another app asks us to duck
  private int cmdGen = 0;  // bumped by load/play/pause/stop to cancel pending delayed pauses
  private int loadGen = 0; // bumped by load() to abandon superseded loads

  private static final long PRELOAD_DELAY_MS = 10000;
  private static final long FOCUS_GUARD_MS = 2000; // ignore focus / route pauses right after a play
  private static final float DUCK_LEVEL = 0.2f;

  // Playback intent. "User" = lock screen / notification / in-app buttons.
  private boolean userPaused = true;          // nothing plays until the user (or a track start) says so
  private boolean resumeOnFocusGain = false;  // we paused because focus was lost
  private long playStartedAt = 0;             // uptime of the last playWhenReady=true
  private String lastRoute = null;            // last audio route seen (speaker / wired / bluetooth)
  private static final long RESTART_THRESHOLD_MS = 3000; // same rule as playerStore.back()

  /** A queue entry described by JS (see exo.ts setWindow). */
  private static class Track {
    int index;          // position in the JS queue (reported back in trackChanged)
    String url;         // playable URI (file:// or remote)
    String key;         // original remote URL, identifies the track
    String title = "";
    String artist = "";
    String album = "";
    String artworkUrl;
    double duration;    // seconds
    float gain = 1f;    // linear ReplayGain factor
  }

  // Previous / current / next tracks, pushed by JS. `cursor` is the position of
  // the active track in `window`; it is only trusted while window[cursor].key
  // equals the active key (see peek()).
  private List<Track> window = new ArrayList<>();
  private int cursor = -1;

  private final Runnable ticker = new Runnable() {
    @Override
    public void run() {
      Slot s = active;
      long next = TICK_MS;
      if (s != null && s.player.isPlaying()) {
        emitTime(s);
        long d = s.player.getDuration();
        // Faster ticks in the last second so the store's auto-skip fires on time
        if (d != C.TIME_UNSET && d - s.player.getCurrentPosition() < 1000) next = 50;
      }
      main.postDelayed(this, next);
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
    if (instance == this) instance = null;
    main.removeCallbacksAndMessages(null);
    releaseSlot(active);
    releaseSlot(buffer);
    active = null;
    buffer = null;
    window = new ArrayList<>();
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
      if (vol != null) volume = vol;
      if (g != null) gain = g;
      if (!paused) markPlayIntent();
      swapTo(url, key, paused, startMs, doFade ? fadeOutMs : 0, null, call);
    });
  }

  /**
   * Replace the active track (re-using the preloaded one when it matches).
   * Main thread only. Shared by JS-driven load() and native track changes.
   *
   * @param beforePlay run once the new player is installed, right before it
   *                   starts (may be null)
   * @param call       resolved when the track is playing (may be null)
   */
  private void swapTo(final String url, final String key, final boolean paused,
                      final long startMs, final long fadeOutMs,
                      final Runnable beforePlay, final PluginCall call) {
    final int gen = ++loadGen;
    cmdGen++;

    final Runnable swap = () -> {
      try {
        if (gen != loadGen) { // a newer load took over
          if (call != null) call.resolve();
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
        scheduleNextPreload();
        if (beforePlay != null) beforePlay.run();

        if (!paused) {
          next.player.setPlayWhenReady(true);
          // audio.ts awaited a short fadeIn after play(); keep the same timing
          if (call != null) main.postDelayed(call::resolve, 150);
        } else if (call != null) {
          call.resolve();
        }
      } catch (Exception e) {
        if (call != null) call.reject("load failed: " + e);
      }
    };

    Slot cur = active;
    if (fadeOutMs > 0 && cur != null && cur.player.getPlayWhenReady()) {
      fadeTo(0f, fadeOutMs);
      main.postDelayed(swap, fadeOutMs);
    } else {
      swap.run();
    }
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
      markPlayIntent();
      playNow(fadeMs);
      main.postDelayed(call::resolve, fadeMs);
    });
  }

  @PluginMethod
  public void pause(final PluginCall call) {
    final long fadeMs = call.getInt("fadeOutMs", 300);
    main.post(() -> {
      if (userPause(fadeMs)) main.postDelayed(call::resolve, fadeMs);
      else call.resolve();
    });
  }

  /** The user wants playback: forget any pending automatic resume. */
  private void markPlayIntent() {
    userPaused = false;
    setResumeOnFocusGain(false);
  }

  /** The user wants silence: no automatic resume must override that. */
  private boolean userPause(long fadeMs) {
    userPaused = true;
    setResumeOnFocusGain(false);
    return pauseNow(fadeMs);
  }

  private void setResumeOnFocusGain(boolean v) {
    resumeOnFocusGain = v;
    // The CPU only has to stay awake while a resume is actually expected
    if (!v) MediaSessionManager.get(getContext()).releaseResumeWakeLock();
  }

  /** Resume the active player with a short fade-in (main thread). */
  private void playNow(long fadeMs) {
    Slot s = active;
    if (s == null) return;
    cmdGen++;
    if (s.player.getPlaybackState() == Player.STATE_ENDED) s.player.seekTo(0);
    final boolean wasReady = s.player.getPlayWhenReady();
    s.player.setPlayWhenReady(true);
    if (wasReady) emit("play"); // no state change after an ended track: notify manually
    fadeTo(1f, fadeMs);
  }

  /** Fade out then pause the active player (main thread). @return false if nothing was playing. */
  private boolean pauseNow(long fadeMs) {
    final Slot s = active;
    if (s == null || !s.player.getPlayWhenReady()) return false;
    final int gen = ++cmdGen;
    fadeTo(0f, fadeMs);
    main.postDelayed(() -> {
      // Ignore if a play()/load()/stop() happened during the fade
      if (gen == cmdGen && active == s) s.player.setPlayWhenReady(false);
    }, fadeMs);
    return true;
  }

  @PluginMethod
  public void stop(final PluginCall call) {
    main.post(() -> {
      cmdGen++;
      loadGen++;
      fadeGen++;
      userPaused = true;
      setResumeOnFocusGain(false);
      duck = 1f;
      window = new ArrayList<>();
      cursor = -1;
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
      seekTo(posMs, fadeMs);
      call.resolve();
    });
  }

  /** Seek the active player (main thread). Returns false when nothing is loaded. */
  private boolean seekTo(long posMs, long fadeMs) {
    Slot s = active;
    if (s == null) return false;
    boolean playing = s.player.getPlayWhenReady();
    if (playing) { // brief dip to avoid a click at the seek point
      fadeGen++;
      fade = 0f;
      applyLevels();
    }
    s.player.seekTo(posMs);
    if (playing) fadeTo(1f, fadeMs);
    emitTime(s);
    publishState();
    return true;
  }

  // Lock screen / notification / Bluetooth seeks are handled here, natively, so
  // they work even when the WebView is throttled in the background.
  private static ExoPlayerPlugin instance;

  @Override
  public void load() {
    super.load();
    instance = this;
  }

  /** Called by MediaSessionPlugin on the main thread. @return true if handled. */
  static boolean seekFromSession(long posMs) {
    ExoPlayerPlugin p = instance;
    if (p == null || !p.seekTo(posMs, 150)) return false;
    MediaSessionManager.get(p.getContext()).setPosition(posMs);
    return true;
  }

  /**
   * Called by MediaSessionPlugin (main thread) for next / previous / play /
   * pause / stop coming from the lock screen, notification, headset or car.
   * @return true if executed natively; false if JS has to decide (nothing
   *         loaded, end of the pushed window, ...).
   */
  static boolean handleTransport(String action) {
    ExoPlayerPlugin p = instance;
    if (p == null || Looper.myLooper() != Looper.getMainLooper()) return false;
    return p.transport(action);
  }

  private boolean transport(String action) {
    final Slot s = active;
    if (s == null) return false;
    switch (action) {
      case "next": {
        Track n = peek(1);
        if (n == null) return false;
        startNative(n, cursor + 1);
        return true;
      }
      case "previous": {
        // Same rule as playerStore.back(): restart when already past a few seconds
        if (s.player.getCurrentPosition() > RESTART_THRESHOLD_MS) {
          seekTo(0, 150);
          return true;
        }
        Track p = peek(-1);
        if (p == null) return false;
        startNative(p, cursor - 1);
        return true;
      }
      case "play":
        markPlayIntent();
        playNow(150);
        return true;
      case "pause":
      case "stop":
        userPause(300);
        return true;
      default:
        return false;
    }
  }

  // ── Audio focus & audio route (called by MediaSessionPlugin) ──────────────

  /** type: "gain" | "loss" | "lossTransient" | "lossDuck". Any thread. */
  static void onAudioFocusChange(final String type) {
    final ExoPlayerPlugin p = instance;
    if (p != null) p.main.post(() -> p.focusChange(type));
  }

  /**
   * route: "speaker" | "wired" | "bluetooth". Any thread.
   * @param requestFocus run right before an automatic resume
   */
  static void onAudioRoute(final String route, final Runnable requestFocus) {
    final ExoPlayerPlugin p = instance;
    if (p != null) p.main.post(() -> p.routeChange(route, requestFocus));
  }

  private boolean wantsToPlay() {
    return active != null && active.player.getPlayWhenReady();
  }

  private boolean recentlyStarted() {
    return SystemClock.uptimeMillis() - playStartedAt < FOCUS_GUARD_MS;
  }

  private void focusChange(String type) {
    switch (type) {
      case "gain":
        duck = 1f;
        applyLevels();
        if (resumeOnFocusGain && !userPaused) playNow(150);
        setResumeOnFocusGain(false);
        break;

      case "loss":
      case "lossTransient": // phone calls
        if (wantsToPlay() && !recentlyStarted()) {
          setResumeOnFocusGain(true);
          pauseNow(300);
        } else if (!resumeOnFocusGain) {
          // nothing to resume: don't keep the CPU awake for nothing
          MediaSessionManager.get(getContext()).releaseResumeWakeLock();
        }
        break;

      case "lossDuck":
        if (wantsToPlay()) {
          duck = DUCK_LEVEL;
          applyLevels();
        }
        break;

      default:
        break;
    }
  }

  private void routeChange(String route, Runnable requestFocus) {
    final boolean changed = !route.equals(lastRoute);
    lastRoute = route;
    // Callbacks fire for every device event and at registration: only react to real changes
    if (!changed || userPaused || active == null) return;

    switch (route) {
      case "bluetooth":
      case "wired":
        if (!wantsToPlay()) {
          if (requestFocus != null) requestFocus.run();
          playNow(150);
        }
        break;
      case "speaker": // headset unplugged / Bluetooth gone
        if (wantsToPlay() && !recentlyStarted()) pauseNow(300);
        break;
      default:
        break;
    }
  }

  /** JS describes the queue around the current track (see exo.ts). */
  @PluginMethod
  public void setWindow(final PluginCall call) {
    final JSArray arr = call.getArray("tracks");
    final int current = call.getInt("current", -1);
    final List<Track> list = new ArrayList<>();
    try {
      for (int i = 0; arr != null && i < arr.length(); i++) {
        JSONObject o = arr.getJSONObject(i);
        Track t = new Track();
        t.index = o.optInt("index", -1);
        t.url = o.getString("url");
        t.key = o.getString("key");
        t.title = o.optString("title", "");
        t.artist = o.optString("artist", "");
        t.album = o.optString("album", "");
        t.artworkUrl = o.isNull("artworkUrl") ? null : o.optString("artworkUrl", null);
        t.duration = o.optDouble("duration", 0.0);
        t.gain = (float) o.optDouble("gain", 1.0);
        list.add(t);
      }
    } catch (Exception e) {
      call.reject("invalid window: " + e);
      return;
    }
    main.post(() -> {
      window = list;
      cursor = current >= 0 && current < list.size() ? current : -1;
      // JS may describe the queue around a track that is no longer the active one
      // (native moved on while the WebView was frozen): re-locate the cursor.
      if (active != null && (cursor < 0 || !list.get(cursor).key.equals(active.key))) {
        int best = -1;
        for (int i = 0; i < list.size(); i++) {
          if (list.get(i).key.equals(active.key)
              && (best < 0 || Math.abs(i - Math.max(cursor, 0)) < Math.abs(best - Math.max(cursor, 0)))) {
            best = i;
          }
        }
        if (best >= 0) cursor = best;
      }
      if (active != null) scheduleNextPreload();
      call.resolve();
    });
  }

  /** Debug helper: shows a native Toast. */
  @PluginMethod
  public void toast(final PluginCall call) {
    final String m = call.getString("message", "");
    main.post(() -> {
      android.widget.Toast.makeText(getContext(), m, android.widget.Toast.LENGTH_SHORT).show();
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

  // ── Native track changes (work while the WebView is frozen) ──────────────

  /** Track at `delta` from the active one in the pushed window, or null. */
  private Track peek(int delta) {
    if (active == null || cursor < 0 || cursor >= window.size()) return null;
    if (!window.get(cursor).key.equals(active.key)) return null; // window is stale
    int i = cursor + delta;
    return i >= 0 && i < window.size() ? window.get(i) : null;
  }

  /** Pre-build the next track's player a while after the current one started. */
  private void scheduleNextPreload() {
    final int gen = loadGen;
    main.postDelayed(() -> {
      if (gen != loadGen) return;
      Track n = peek(1);
      if (n == null) return;
      if (buffer != null && n.key.equals(buffer.key) && n.url.equals(buffer.url)
          && buffer.player.getPlayerError() == null) return;
      releaseSlot(buffer);
      buffer = build(n.url, n.key);
      buffer.player.setVolume(0f);
    }, PRELOAD_DELAY_MS);
  }

  /**
   * Start `t` (window[newCursor]) without any help from JS: publish its
   * metadata to the media session and tell JS to follow ("trackChanged").
   * No fade on purpose: the cursor then always matches the active player, so
   * several quick skips in a row stay consistent.
   */
  private void startNative(final Track t, final int newCursor) {
    gain = t.gain;
    markPlayIntent();
    swapTo(t.url, t.key, false, 0, 0, () -> {
      cursor = newCursor;
      MediaSessionManager.get(getContext()).setMetadata(
        t.title, t.artist, t.album, t.artworkUrl, (long) (t.duration * 1000.0));
      JSObject o = new JSObject();
      o.put("index", t.index);
      o.put("key", t.key);
      o.put("url", t.url);
      o.put("duration", t.duration);
      notifyListeners("trackChanged", o); // before "play": JS must reset its position first
    }, null);
  }

  /** Mirror the player state into the media session (JS may be asleep). */
  private void publishState() {
    Slot s = active;
    if (s == null) return;
    int st = s.player.getPlayWhenReady()
      ? PlaybackStateCompat.STATE_PLAYING
      : PlaybackStateCompat.STATE_PAUSED;
    MediaSessionManager.get(getContext())
      .setPlaybackState(st, Math.max(0L, s.player.getCurrentPosition()), 1f);
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
        if (playWhenReady) playStartedAt = SystemClock.uptimeMillis();
        emit(playWhenReady ? "play" : "pause");
        publishState();
      }

      @Override
      public void onIsPlayingChanged(boolean isPlaying) {
        if (s != active) return;
        if (isPlaying) {
          emit("playing");
          publishState();
        }
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
          // Next track of the window: started natively, JS only follows.
          // No "pause" here: it would flash the UI / media session to "paused"
          // between two tracks (Android can then suspend a backgrounded app).
          // Otherwise JS decides (end of queue, radio...); exo.ts emits the
          // pause itself if no next track gets loaded.
          main.post(() -> {
            if (s != active) return;
            Track n = peek(1);
            if (n != null) startNative(n, cursor + 1);
            else emit("ended");
          });
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
    float total = volume * gain * fade * duck;
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
