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

    super.onCreate(savedInstanceState);

    WebView webView = this.bridge.getWebView();
    requestIgnoreBatteryOptimizations();

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
  public void onDestroy() {

      stopService(
          new Intent(this, MediaPlaybackService.class)
      );

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
