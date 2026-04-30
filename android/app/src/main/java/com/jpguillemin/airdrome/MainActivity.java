package com.jpguillemin.airdrome;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaSessionPlugin.class);

        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();

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

        // Keep JS alive for audio callbacks
        this.bridge.getWebView().onResume();
    }

    @Override
    public void onDestroy() {
        stopService(new Intent(this, MediaPlaybackService.class));
        super.onDestroy();
    }
}
