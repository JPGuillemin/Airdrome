package com.jpguillemin.airdrome;

import android.net.Uri;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = this.getBridge().getWebView();
    requestIgnoreBatteryOptimizations();

    // Lets audio.play() resume without a user tap (e.g. after a phone call)
    webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

    // Disable Android native long press behavior
    webView.setLongClickable(false);
    webView.setHapticFeedbackEnabled(false);
    webView.setOnLongClickListener(v -> true);
  }

  @Override
  public void onStart() {
    super.onStart();

    // (Re)start the foreground service every time the app becomes visible.
    // Starting an already-running service is harmless, and this recovers
    // the case where the service was killed while the activity survived.
    Intent svc = new Intent(this, MediaPlaybackService.class);
    ContextCompat.startForegroundService(this, svc);
  }

  @Override
  public void onPause() {
    super.onPause();
    // Capacitor's super.onPause() pauses the WebView; resume it right away
    // so JS, timers and the audio element keep running in the background.
    WebView webView = getBridge().getWebView();
    if (webView != null) {
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

  public void requestIgnoreBatteryOptimizations() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);

      if (!pm.isIgnoringBatteryOptimizations(getPackageName())) {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getPackageName()));
        startActivity(intent);
      }
    }
  }
}
