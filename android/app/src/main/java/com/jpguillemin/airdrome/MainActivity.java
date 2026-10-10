package com.jpguillemin.airdrome;

import android.net.Uri;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(MediaSessionPlugin.class);
    registerPlugin(ExoPlayerPlugin.class);

    super.onCreate(savedInstanceState);

    WebView webView = this.getBridge().getWebView();
    requestIgnoreBatteryOptimizations();

    webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

    // Keep the WebView renderer process at foreground priority even when the app
    // is not visible. By default Android demotes ("waives") it in the background,
    // which is what lets the JS side stall after a long idle period (phone call,
    // screen locked) now that no <audio> element keeps the page alive.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
    }

    // Disable Android native long press behavior
    webView.setLongClickable(false);
    webView.setHapticFeedbackEnabled(false);
    webView.setOnLongClickListener(v -> true);

    // Start media service
    Intent svc = new Intent(this, MediaPlaybackService.class);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForegroundService(svc);
    } else {
      startService(svc);
    }
  }

  @Override
  public void onPause() {
    super.onPause();
    WebView webView = getBridge().getWebView();
    if (webView != null) {
      webView.onResume();
    }
  }

  @Override
  public void onDestroy() {
    if (isFinishing()) {
      stopService(
        new Intent(this, MediaPlaybackService.class)
      );
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
