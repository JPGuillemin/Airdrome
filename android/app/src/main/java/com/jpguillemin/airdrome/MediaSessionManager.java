package com.jpguillemin.airdrome;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;
import androidx.media.session.MediaButtonReceiver;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MediaSessionManager {
    public static final String CHANNEL_ID = "airdrome_playback";
    public static final int NOTIFICATION_ID = 1;

    public interface TransportListener {
        void onPlay();
        void onPause();
        void onSkipToNext();
        void onSkipToPrevious();
        void onSeekTo(long positionMs);
        void onStop();
    }

    private static MediaSessionManager instance;

    public static synchronized MediaSessionManager get(Context ctx) {
        if (instance == null) {
            instance = new MediaSessionManager(ctx.getApplicationContext());
        }
        return instance;
    }

    private final Context ctx;
    private final MediaSessionCompat session;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private TransportListener listener;
    private MediaPlaybackService service;

    private String title = "";
    private String artist = "";
    private String album = "";
    private long durationMs = 0;
    private String artworkUrl;
    private Bitmap artworkBitmap;
    private int state = PlaybackStateCompat.STATE_NONE;
    private long positionMs = 0;
    private float speed = 1.0f;

    private MediaSessionManager(Context ctx) {
        this.ctx = ctx;
        createChannel();
        session = new MediaSessionCompat(ctx, "AirdromePlayback");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { if (listener != null) listener.onPlay(); }
            @Override public void onPause() { if (listener != null) listener.onPause(); }
            @Override public void onSkipToNext() { if (listener != null) listener.onSkipToNext(); }
            @Override public void onSkipToPrevious() { if (listener != null) listener.onSkipToPrevious(); }
            @Override public void onSeekTo(long pos) { if (listener != null) listener.onSeekTo(pos); }
            @Override public void onStop() { if (listener != null) listener.onStop(); }
        });
        session.setActive(true);
        applyPlaybackState();
    }

    private void createChannel() {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
    }

    public void setListener(TransportListener l) { this.listener = l; }

    public MediaSessionCompat getSession() { return session; }

    void attachService(MediaPlaybackService s) { this.service = s; }

    void detachService(MediaPlaybackService s) { if (this.service == s) this.service = null; }

    public synchronized void setMetadata(
            String title, String artist, String album, String artworkUrl, long durationMs) {
        this.title = title != null ? title : "";
        this.artist = artist != null ? artist : "";
        this.album = album != null ? album : "";
        this.durationMs = durationMs;
        boolean urlChanged =
            (artworkUrl == null) != (this.artworkUrl == null)
            || (artworkUrl != null && !artworkUrl.equals(this.artworkUrl));
        if (urlChanged) {
            this.artworkUrl = artworkUrl;
            this.artworkBitmap = null;
            if (artworkUrl != null) {
                final String urlToFetch = artworkUrl;
                io.execute(() -> fetchArtwork(urlToFetch));
            }
        }
        applyMetadata();
        updateNotification();
    }

    public synchronized void setPlaybackState(int state, long positionMs, float speed) {
        this.state = state;
        this.positionMs = positionMs;
        this.speed = speed;
        applyPlaybackState();
        updateNotification();
    }

    private void applyMetadata() {
        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        if (artworkBitmap != null) {
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artworkBitmap);
        }
        session.setMetadata(b.build());
    }

    private void applyPlaybackState() {
        long actions = PlaybackStateCompat.ACTION_PLAY
            | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_SEEK_TO
            | PlaybackStateCompat.ACTION_STOP;
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(state, positionMs, speed)
            .build());
    }

    private void fetchArtwork(String url) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("User-Agent", "Airdrome/Android");
            InputStream in = conn.getInputStream();
            final Bitmap bm = BitmapFactory.decodeStream(in);
            in.close();
            conn.disconnect();
            if (bm == null) return;
            main.post(() -> {
                if (url.equals(this.artworkUrl)) {
                    this.artworkBitmap = bm;
                    applyMetadata();
                    updateNotification();
                }
            });
        } catch (Exception ignored) {
            // silent — no artwork is acceptable
        }
    }

    private void updateNotification() {
        MediaPlaybackService s = this.service;
        if (s != null) {
            s.updateNotification(buildNotification());
        }
    }

    Notification buildNotification() {
        Intent launch = new Intent(ctx, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            ctx, 0, launch,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        boolean isPlaying = state == PlaybackStateCompat.STATE_PLAYING;

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title.isEmpty() ? "Airdrome" : title)
            .setContentText(artist)
            .setSubText(album)
            .setContentIntent(pi)
            .setShowWhen(false)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (artworkBitmap != null) {
            b.setLargeIcon(artworkBitmap);
        }

        b.addAction(new NotificationCompat.Action(
            android.R.drawable.ic_media_previous, "Previous",
            MediaButtonReceiver.buildMediaButtonPendingIntent(
                ctx, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)));
        if (isPlaying) {
            b.addAction(new NotificationCompat.Action(
                android.R.drawable.ic_media_pause, "Pause",
                MediaButtonReceiver.buildMediaButtonPendingIntent(
                    ctx, PlaybackStateCompat.ACTION_PAUSE)));
        } else {
            b.addAction(new NotificationCompat.Action(
                android.R.drawable.ic_media_play, "Play",
                MediaButtonReceiver.buildMediaButtonPendingIntent(
                    ctx, PlaybackStateCompat.ACTION_PLAY)));
        }
        b.addAction(new NotificationCompat.Action(
            android.R.drawable.ic_media_next, "Next",
            MediaButtonReceiver.buildMediaButtonPendingIntent(
                ctx, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)));

        b.setDeleteIntent(MediaButtonReceiver.buildMediaButtonPendingIntent(
            ctx, PlaybackStateCompat.ACTION_STOP));

        b.setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
            .setMediaSession(session.getSessionToken())
            .setShowActionsInCompactView(0, 1, 2));

        return b.build();
    }

    public void release() {
        session.setActive(false);
        session.release();
        instance = null;
    }
}
