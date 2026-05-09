// android/app/src/main/java/com/jpguillemin/airdrome/MediaSessionPlugin.java
package com.jpguillemin.airdrome;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioFocusRequest;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.media.AudioDeviceCallback;
import android.support.v4.media.session.PlaybackStateCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaSession")
public class MediaSessionPlugin extends Plugin {

  private MediaSessionManager manager;
  private AudioManager audioManager;
  private AudioManager.OnAudioFocusChangeListener focusListener;
  private AudioFocusRequest audioFocusRequest; // For API 26+
  private BroadcastReceiver noisyReceiver;
  private AudioDeviceCallback deviceCallback;

  @Override
  public void load() {
    super.load();

    manager = MediaSessionManager.get(getContext());
    audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);

    manager.setListener(new MediaSessionManager.TransportListener() {
      @Override public void onPlay() { notifyListeners("play", new JSObject()); }
      @Override public void onPause() { notifyListeners("pause", new JSObject()); }
      @Override public void onSkipToNext() { notifyListeners("next", new JSObject()); }
      @Override public void onSkipToPrevious() { notifyListeners("previous", new JSObject()); }
      @Override public void onSeekTo(long pos) {
        JSObject data = new JSObject();
        data.put("position", pos / 1000.0);
        notifyListeners("seek", data);
      }
      @Override public void onStop() { notifyListeners("stop", new JSObject()); }
    });

    setupFocusListener();
    registerAudioRouteNoisyReceiver();
    registerAudioDeviceCallback();
  }

  @Override
  protected void handleOnDestroy() {
    abandonAudioFocusInternal();
    unregisterReceivers();
    super.handleOnDestroy();
  }

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  @PluginMethod
  public void setMetadata(PluginCall call) {
    String title = call.getString("title", "");
    String artist = call.getString("artist", "");
    String album = call.getString("album", "");
    String artworkUrl = call.getString("artworkUrl", null);
    Double duration = call.getDouble("duration", 0.0);

    long durationMs = (long) (duration * 1000.0);

    manager.setMetadata(title, artist, album, artworkUrl, durationMs);
    call.resolve();
  }

  // -------------------------------------------------------------------------
  // Playback state
  // -------------------------------------------------------------------------

  @PluginMethod
  public void setPlaybackState(PluginCall call) {
    String state = call.getString("state", "none");
    Double position = call.getDouble("position", 0.0);
    Double speed = call.getDouble("speed", 1.0);

    int pbState;
    switch (state) {
      case "playing": pbState = PlaybackStateCompat.STATE_PLAYING; break;
      case "paused":  pbState = PlaybackStateCompat.STATE_PAUSED; break;
      case "stopped": pbState = PlaybackStateCompat.STATE_STOPPED; break;
      default:        pbState = PlaybackStateCompat.STATE_NONE; break;
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
          case AudioManager.AUDIOFOCUS_GAIN:
            type = "gain";
            break;

          case AudioManager.AUDIOFOCUS_LOSS:
            type = "loss";
            break;

          case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
            type = "lossTransient";
            break;

          case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
            type = "lossDuck";
            break;

          default:
            return;
        }

        JSObject data = new JSObject();
        data.put("type", type);
        notifyListeners("audioFocusChange", data);
      }
    };
  }

  @PluginMethod
  public void requestAudioFocus(PluginCall call) {
    int result;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setOnAudioFocusChangeListener(focusListener)
        .build();
      result = audioManager.requestAudioFocus(audioFocusRequest);
    } else {
      result = audioManager.requestAudioFocus(
        focusListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN
      );
    }

    JSObject data = new JSObject();
    data.put("granted", result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
    call.resolve(data);
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
  // AUDIO ROUTE: HEADPHONES / BLUETOOTH DISCONNECT
  // -------------------------------------------------------------------------

  private void registerAudioRouteNoisyReceiver() {
    IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);

    noisyReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        // Delay slightly to avoid race with device callback
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
          @Override
          public void run() {
            emitCurrentRoute();
          }
        }, 100);
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
      emitRoute("speaker"); // Fallback for old Android
      return;
    }

    AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
    String route = "speaker";

    // Priority: bluetooth > wired > speaker
    for (AudioDeviceInfo d : devices) {
      int type = d.getType();

      // Highest priority: Bluetooth
      if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
          type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
          type == AudioDeviceInfo.TYPE_BLE_HEADSET) {
        route = "bluetooth";
        break; // Found bluetooth, no need to check further
      }

      // Medium priority: Wired
      if (type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
          type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
          type == AudioDeviceInfo.TYPE_USB_HEADSET) {
        route = "wired";
        // Don't break - keep checking for bluetooth
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
