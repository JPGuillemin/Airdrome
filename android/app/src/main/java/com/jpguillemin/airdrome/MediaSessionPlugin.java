package com.jpguillemin.airdrome;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioFocusRequest;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
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

    registerAudioRouteNoisyReceiver();
    registerAudioDeviceCallback();
    registerAudioFocusListener();
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
      default:    pbState = PlaybackStateCompat.STATE_NONE; break;
    }

    long positionMs = (long) (position * 1000.0);

    manager.setPlaybackState(pbState, positionMs, speed.floatValue());
    call.resolve();
  }

  // -------------------------------------------------------------------------
  // AUDIO ROUTE: HEADPHONES / BLUETOOTH DISCONNECT
  // -------------------------------------------------------------------------

  private void registerAudioRouteNoisyReceiver() {
    IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);

    getContext().registerReceiver(new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        emitRoute("speaker");
      }
    }, filter);
  }

  // -------------------------------------------------------------------------
  // AUDIO ROUTE: DEVICE CONNECT / DISCONNECT (API 23+)
  // -------------------------------------------------------------------------

  private void registerAudioDeviceCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

    audioManager.registerAudioDeviceCallback(new AudioDeviceCallback() {

      @Override
      public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
        emitRouteFromDevices();
      }

      @Override
      public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
        emitRouteFromDevices();
      }

    }, null);
  }

  // -------------------------------------------------------------------------
  // ROUTE RESOLUTION
  // -------------------------------------------------------------------------

  private void emitRouteFromDevices() {
    AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);

    String route = "speaker";

    for (AudioDeviceInfo d : devices) {
      int type = d.getType();

      if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
        type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
        route = "bluetooth";
        break;
      }

      if (type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
        type == AudioDeviceInfo.TYPE_WIRED_HEADSET) {
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

  private void notifyRoute(AudioManager audioManager) {
    JSObject data = new JSObject();

    AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);

    String route = "speaker";

    for (AudioDeviceInfo device : devices) {
      switch (device.getType()) {

        case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
        case AudioDeviceInfo.TYPE_BLE_HEADSET:
          route = "bluetooth";
          break;

        case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
        case AudioDeviceInfo.TYPE_WIRED_HEADSET:
          route = "wired";
          break;
      }
    }

    data.put("route", route);
    notifyListeners("audioRouteChange", data);
  }

  private void registerAudioFocusListener() {

    audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);

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

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

      AudioFocusRequest request = new AudioFocusRequest.Builder(
        AudioManager.AUDIOFOCUS_GAIN
      )
      .setOnAudioFocusChangeListener(focusListener)
      .build();

      audioManager.requestAudioFocus(request);

    } else {
      audioManager.requestAudioFocus(
        focusListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN
      );
    }
  }
}
