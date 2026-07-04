// android/app/src/main/java/com/jpguillemin/airdrome/MediaSessionPlugin.java
package com.jpguillemin.airdrome;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.media.AudioDeviceCallback;
import android.support.v4.media.session.PlaybackStateCompat;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.webkit.WebView;

import androidx.annotation.RequiresApi;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Conditional import for API 31+ TelephonyCallback — resolved at runtime via reflection-free
// SDK_INT guard. We import unconditionally and gate all usage behind SDK_INT checks.
import android.telephony.TelephonyCallback;

@CapacitorPlugin(name = "MediaSession")
public class MediaSessionPlugin extends Plugin {

  private MediaSessionManager manager;
  private AudioManager audioManager;
  private AudioManager.OnAudioFocusChangeListener focusListener;
  private AudioFocusRequest audioFocusRequest; // API 26+
  private BroadcastReceiver noisyReceiver;
  private AudioDeviceCallback deviceCallback;

  // ── Telephony (phone call detection) ──────────────────────────────────────
  private TelephonyManager telephonyManager;
  private int lastCallState = TelephonyManager.CALL_STATE_IDLE;
  private PhoneStateListener phoneStateListener;   // API < 31
  private TelephonyCallback telephonyCallback;     // API 31+

  // ── AudioAttributes shared between focus request and AudioManager ──────────
  private AudioAttributes musicAudioAttributes;

  @Override
  public void load() {
    super.load();

    manager = MediaSessionManager.get(getContext());
    audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    telephonyManager = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);

    musicAudioAttributes = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build();

    manager.setListener(new MediaSessionManager.TransportListener() {
      @Override public void onPlay()       { notifyListeners("play",     new JSObject()); }
      @Override public void onPause()      { notifyListeners("pause",    new JSObject()); }
      @Override public void onSkipToNext() { notifyListeners("next",     new JSObject()); }
      @Override public void onSkipToPrevious() { notifyListeners("previous", new JSObject()); }
      @Override public void onStop()      { notifyListeners("stop",     new JSObject()); }
      @Override public void onSeekTo(long pos) {
        JSObject data = new JSObject();
        data.put("position", pos / 1000.0);
        notifyListeners("seek", data);
      }
    });

    setupFocusListener();
    registerAudioRouteNoisyReceiver();
    registerAudioDeviceCallback();
    setupTelephonyListener();
  }

  @Override
  protected void handleOnDestroy() {
    abandonAudioFocusInternal();
    unregisterReceivers();
    unregisterTelephonyListener();
    super.handleOnDestroy();
  }

  // -------------------------------------------------------------------------
  // WEBVIEW WAKE
  // -------------------------------------------------------------------------
  // When the Activity has been backgrounded/screen-locked long enough, Android
  // throttles the WebView's JS timers even though our foreground service keeps
  // the process alive. Any notifyListeners() call sent while that's happening
  // gets queued on the bridge but never executed — which means audio.play()
  // in the JS AudioController (our only audio decode path) never runs until
  // the app is brought back to foreground.
  //
  // Calling onResume()/resumeTimers() here forces the WebView's JS engine to
  // actually tick, so queued bridge messages get processed immediately instead
  // of waiting for the user to reopen the app. Must run on the main thread.
  //
  // This is a no-op (safely) if the Activity/WebView have been killed outright
  // rather than just frozen — getBridge()/getWebView() will return null.
  private void wakeWebView() {
    new Handler(Looper.getMainLooper()).post(() -> {
      if (getBridge() == null) return;
      WebView webView = getBridge().getWebView();
      if (webView == null) return;
      webView.onResume();
      webView.resumeTimers();
    });
  }

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  @PluginMethod
  public void setMetadata(PluginCall call) {
    String title      = call.getString("title", "");
    String artist     = call.getString("artist", "");
    String album      = call.getString("album", "");
    String artworkUrl = call.getString("artworkUrl", null);
    Double duration   = call.getDouble("duration", 0.0);
    long durationMs   = (long) (duration * 1000.0);

    manager.setMetadata(title, artist, album, artworkUrl, durationMs);
    call.resolve();
  }

  // -------------------------------------------------------------------------
  // Playback state
  // -------------------------------------------------------------------------

  @PluginMethod
  public void setPlaybackState(PluginCall call) {
    String state    = call.getString("state", "none");
    Double position = call.getDouble("position", 0.0);
    Double speed    = call.getDouble("speed", 1.0);

    int pbState;
    switch (state) {
      case "playing": pbState = PlaybackStateCompat.STATE_PLAYING; break;
      case "paused":  pbState = PlaybackStateCompat.STATE_PAUSED;  break;
      case "stopped": pbState = PlaybackStateCompat.STATE_STOPPED; break;
      default:        pbState = PlaybackStateCompat.STATE_NONE;    break;
    }

    long positionMs = (long) (position * 1000.0);
    manager.setPlaybackState(pbState, positionMs, speed.floatValue());
    call.resolve();
  }

  // -------------------------------------------------------------------------
  // AUDIO FOCUS MANAGEMENT
  // -------------------------------------------------------------------------

  private void setupFocusListener() {
    focusListener = new AudioManager.OnAudioFocusChangeListener() {
      @Override
      public void onAudioFocusChange(int focusChange) {
        String type;
        switch (focusChange) {
          case AudioManager.AUDIOFOCUS_GAIN:                    type = "gain";          break;
          case AudioManager.AUDIOFOCUS_LOSS:                    type = "loss";          break;
          case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:          type = "lossTransient"; break;
          case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK: type = "lossDuck";     break;
          default: return;
        }

        // "gain" after a delayed focus request (e.g. the occupier of focus just
        // released it) is exactly the same background/frozen-WebView scenario
        // as the phone-call-ended fallback below, so wake the WebView here too.
        if ("gain".equals(type)) {
          wakeWebView();
        }

        JSObject data = new JSObject();
        data.put("type", type);
        notifyListeners("audioFocusChange", data);
      }
    };
  }

  @PluginMethod
  public void requestAudioFocus(PluginCall call) {
    int result = executeAudioFocusRequest();

    JSObject data = new JSObject();
    data.put("granted", result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
    data.put("delayed", result == AudioManager.AUDIOFOCUS_REQUEST_DELAYED);
    call.resolve(data);
  }

  /**
   * Separated focus acquisition logic so it can be safely triggered internally
   * from background events (like telephony ending) or via explicit PluginMethods.
   */
  private int executeAudioFocusRequest() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      if (audioFocusRequest == null) {
        audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(musicAudioAttributes)
            .setOnAudioFocusChangeListener(focusListener)
            .setAcceptsDelayedFocusGain(true)
            .build();
      }
      return audioManager.requestAudioFocus(audioFocusRequest);
    } else {
      return audioManager.requestAudioFocus(
          focusListener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN
      );
    }
  }

  @PluginMethod
  public void abandonAudioFocus(PluginCall call) {
    abandonAudioFocusInternal();
    call.resolve();
  }

  private void abandonAudioFocusInternal() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
      audioManager.abandonAudioFocusRequest(audioFocusRequest);
      audioFocusRequest = null;
    } else if (focusListener != null) {
      audioManager.abandonAudioFocus(focusListener);
    }
  }

  // -------------------------------------------------------------------------
  // PHONE CALL DETECTION (TelephonyCallback / PhoneStateListener)
  // -------------------------------------------------------------------------

  private void setupTelephonyListener() {
    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_PHONE_STATE)
        != PackageManager.PERMISSION_GRANTED) {
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      registerTelephonyCallback();
    } else {
      registerPhoneStateListener();
    }
  }

  // ── API 31+ ───────────────────────────────────────────────────────────────

  @RequiresApi(api = Build.VERSION_CODES.S)
  private void registerTelephonyCallback() {
    telephonyCallback = new CallStateCallbackImpl();
    telephonyManager.registerTelephonyCallback(
        getContext().getMainExecutor(),
        telephonyCallback
    );
  }

  @RequiresApi(api = Build.VERSION_CODES.S)
  private class CallStateCallbackImpl extends TelephonyCallback
      implements TelephonyCallback.CallStateListener {
    @Override
    public void onCallStateChanged(int state) {
      handleCallStateChange(state);
    }
  }

  // ── API 26–30 (PhoneStateListener, deprecated in API 31) ──────────────────

  @SuppressWarnings("deprecation")
  private void registerPhoneStateListener() {
    phoneStateListener = new PhoneStateListener() {
      @Override
      public void onCallStateChanged(int state, String phoneNumber) {
        handleCallStateChange(state);
      }
    };
    telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
  }

  // ── Shared state-change handler ────────────────────────────────────────────

  private void handleCallStateChange(int state) {
    boolean wasInCall = lastCallState == TelephonyManager.CALL_STATE_RINGING
                     || lastCallState == TelephonyManager.CALL_STATE_OFFHOOK;
    lastCallState = state;

    if (state == TelephonyManager.CALL_STATE_IDLE && wasInCall) {
      // 800ms delay: gives Bluetooth profiles and car head units ample time to hand
      // audio routing back to media channels before we demand focus.
      new Handler(Looper.getMainLooper()).postDelayed(() -> {

        // CRITICAL FIX: Re-request audio focus natively *before* passing execution down to JS.
        // Android blocks background applications from initiating focus requests. Because this
        // code executes natively inside an ongoing OS broadcast pipeline, it safely bypasses
        // the background restriction rules.
        int focusResult = executeAudioFocusRequest();

        // Force the WebView's JS timers to actually run before we hand off, otherwise
        // this notifyListeners() call can sit queued indefinitely if the app has been
        // backgrounded/screen-locked long enough for Android to throttle the WebView.
        wakeWebView();

        JSObject data = new JSObject();
        data.put("focusGrantedNatively", focusResult == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        notifyListeners("phoneCallEnded", data);

      }, 800);
    }
  }

  private void unregisterTelephonyListener() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && telephonyCallback != null) {
      telephonyManager.unregisterTelephonyCallback(telephonyCallback);
      telephonyCallback = null;
    } else if (phoneStateListener != null) {
      //noinspection deprecation
      telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
      phoneStateListener = null;
    }
  }

  // -------------------------------------------------------------------------
  // AUDIO ROUTE: HEADPHONES / BLUETOOTH DISCONNECT
  // -------------------------------------------------------------------------

  private void registerAudioRouteNoisyReceiver() {
    IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);

    noisyReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> emitCurrentRoute(), 100);
      }
    };

    getContext().registerReceiver(noisyReceiver, filter);
  }

  // -------------------------------------------------------------------------
  // AUDIO ROUTE: DEVICE CONNECT / DISCONNECT (API 23+)
  // -------------------------------------------------------------------------

  private void registerAudioDeviceCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

    deviceCallback = new AudioDeviceCallback() {
      @Override
      public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
        emitCurrentRoute();
      }

      @Override
      public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
        emitCurrentRoute();
      }
    };

    audioManager.registerAudioDeviceCallback(deviceCallback, null);
  }

  // -------------------------------------------------------------------------
  // ROUTE RESOLUTION (CONSOLIDATED)
  // -------------------------------------------------------------------------

  private void emitCurrentRoute() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      emitRoute("speaker");
      return;
    }

    AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
    String route = "speaker";

    for (AudioDeviceInfo d : devices) {
      int type = d.getType();

      if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
          type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO  ||
          type == AudioDeviceInfo.TYPE_BLE_HEADSET) {
        route = "bluetooth";
        break;
      }

      if (type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
          type == AudioDeviceInfo.TYPE_WIRED_HEADSET    ||
          type == AudioDeviceInfo.TYPE_USB_HEADSET) {
        route = "wired";
      }
    }

    emitRoute(route);
  }

  private void emitRoute(String route) {
    JSObject data = new JSObject();
    data.put("route", route);
    notifyListeners("audioRouteChange", data);
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  private void unregisterReceivers() {
    if (noisyReceiver != null) {
      try {
        getContext().unregisterReceiver(noisyReceiver);
      } catch (IllegalArgumentException e) {
        // Already unregistered
      }
      noisyReceiver = null;
    }

    if (deviceCallback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      audioManager.unregisterAudioDeviceCallback(deviceCallback);
      deviceCallback = null;
    }
  }
}
