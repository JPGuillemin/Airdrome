package com.jpguillemin.airdrome;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaSessionPlugin.class);
        super.onCreate(savedInstanceState);
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
        // Keep the WebView's JS running while the Activity is paused so the
        // audio.onended → next-track handler continues to fire in background.
        this.bridge.getWebView().onResume();
    }

    @Override
    public void onDestroy() {
        stopService(new Intent(this, MediaPlaybackService.class));
        super.onDestroy();
    }
}

