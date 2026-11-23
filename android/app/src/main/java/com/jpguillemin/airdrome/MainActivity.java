package com.jpguillemin.airdrome;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Capacitor host activity.
 *
 * The WebView is only the UI: playback, media-session metadata and queue
 * auto-advance are handled by the native ExoPlayer/MediaSession plugins so
 * they keep working while the WebView is suspended in the background.
 */
public class MainActivity extends BridgeActivity {

  private static final int NOTIFICATION_PERMISSION_REQUEST = 1001;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(MediaSessionPlugin.class);
    registerPlugin(ExoPlayerPlugin.class);

    super.onCreate(savedInstanceState);

    WebView webView = this.getBridge().getWebView();

    if (webView != null) {
      webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

      // Keep the WebView renderer at foreground priority while the app is in
      // the background. Without this Android may demote the renderer after a
      // long idle period (phone call, screen off), which would make the JS
      // side of the player stall even though ExoPlayer keeps playing.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
      }

      // Disable Android's native long-press behaviour (text selection, image
      // menu) so the app's own long-press gestures work consistently.
      webView.setLongClickable(false);
      webView.setHapticFeedbackEnabled(false);
      webView.setOnLongClickListener(v -> true);
    }

    requestNotificationPermission();
    requestIgnoreBatteryOptimizationsOnce();

    // Foreground service: owns the media notification and keeps playback alive
    // when the activity is not visible.
    Intent service = new Intent(this, MediaPlaybackService.class);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForegroundService(service);
    } else {
      startService(service);
    }
  }

  @Override
  public void onPause() {
    super.onPause();

    WebView webView = getBridge().getWebView();

    if (webView != null) {
      // Keep the renderer running while playback continues natively.
      webView.onResume();
    }
  }

  @Override
  public void onDestroy() {
    if (isFinishing()) {
      stopService(new Intent(this, MediaPlaybackService.class));
    }

    super.onDestroy();
  }

  private void requestNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return;
    }

    if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
        != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(
        new String[] { Manifest.permission.POST_NOTIFICATIONS },
        NOTIFICATION_PERMISSION_REQUEST
      );
    }
  }

  private void requestIgnoreBatteryOptimizationsOnce() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return;
    }

    SharedPreferences prefs = getSharedPreferences("airdrome", MODE_PRIVATE);

    if (prefs.getBoolean("batteryOptimizationAsked", false)) {
      return;
    }

    PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);

    if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
      prefs.edit().putBoolean("batteryOptimizationAsked", true).apply();

      try {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getPackageName()));
        startActivity(intent);
      } catch (Exception ignored) {
        // Some OEMs do not expose this settings screen.
      }
    }
  }
}
