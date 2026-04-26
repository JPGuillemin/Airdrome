package com.jpguillemin.airdrome;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationManagerCompat;
import androidx.media.session.MediaButtonReceiver;

public class MediaPlaybackService extends Service {
    private MediaSessionManager manager;

    @Override
    public void onCreate() {
        super.onCreate();
        manager = MediaSessionManager.get(this);
        manager.attachService(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = manager.buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                MediaSessionManager.NOTIFICATION_ID, n,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(MediaSessionManager.NOTIFICATION_ID, n);
        }
        MediaButtonReceiver.handleIntent(manager.getSession(), intent);
        return START_STICKY;
    }

    void updateNotification(Notification n) {
        NotificationManagerCompat.from(this).notify(MediaSessionManager.NOTIFICATION_ID, n);
    }

    @Override
    public void onDestroy() {
        manager.detachService(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
