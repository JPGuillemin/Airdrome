// MediaSessionManager.java
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
import android.util.LruCache;

import androidx.core.app.NotificationCompat;
import androidx.media.session.MediaButtonReceiver;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MediaSessionManager {
    public static final String CHANNEL_ID = "airdrome_playback";
    public static final int NOTIFICATION_ID = 1;

    private static final int ARTWORK_SIZE = 300;
    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int READ_TIMEOUT_MS = 10000;

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

    /**
     * Memory cache for artwork bitmaps.
     * Uses 1/8th of available app memory.
     */
    private final LruCache<String, Bitmap> artworkCache =
        new LruCache<String, Bitmap>(
            (int) (Runtime.getRuntime().maxMemory() / 8)
        ) {
            @Override
            protected int sizeOf(String key, Bitmap value) {
                return value.getByteCount();
            }
        };

    /**
     * Prevent duplicate concurrent fetches.
     */
    private final Set<String> inflight =
        ConcurrentHashMap.newKeySet();

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
            @Override
            public void onPlay() {
                if (listener != null) listener.onPlay();
            }

            @Override
            public void onPause() {
                if (listener != null) listener.onPause();
            }

            @Override
            public void onSkipToNext() {
                if (listener != null) listener.onSkipToNext();
            }

            @Override
            public void onSkipToPrevious() {
                if (listener != null) listener.onSkipToPrevious();
            }

            @Override
            public void onSeekTo(long pos) {
                if (listener != null) listener.onSeekTo(pos);
            }

            @Override
            public void onStop() {
                if (listener != null) listener.onStop();
            }
        });

        session.setActive(true);

        applyPlaybackState();
    }

    private void createChannel() {
        NotificationManager nm =
            ctx.getSystemService(NotificationManager.class);

        if (nm != null &&
            nm.getNotificationChannel(CHANNEL_ID) == null) {

            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                "Playback",
                NotificationManager.IMPORTANCE_LOW
            );

            ch.setShowBadge(false);
            ch.setSound(null, null);

            nm.createNotificationChannel(ch);
        }
    }

    public void setListener(TransportListener l) {
        this.listener = l;
    }

    public MediaSessionCompat getSession() {
        return session;
    }

    void attachService(MediaPlaybackService s) {
        this.service = s;
    }

    void detachService(MediaPlaybackService s) {
        if (this.service == s) {
            this.service = null;
        }
    }

    public synchronized void setMetadata(
        String title,
        String artist,
        String album,
        String artworkUrl,
        long durationMs
    ) {
        this.title = title != null ? title : "";
        this.artist = artist != null ? artist : "";
        this.album = album != null ? album : "";
        this.durationMs = durationMs;

        boolean urlChanged =
            (artworkUrl == null) != (this.artworkUrl == null)
            || (artworkUrl != null &&
                !artworkUrl.equals(this.artworkUrl));

        if (urlChanged) {
            this.artworkUrl = artworkUrl;
            this.artworkBitmap = null;

            if (artworkUrl != null) {
                Bitmap cached = artworkCache.get(artworkUrl);

                if (cached != null && !cached.isRecycled()) {
                    this.artworkBitmap = cached;
                } else {
                    final String urlToFetch = artworkUrl;

                    if (inflight.add(urlToFetch)) {
                        io.execute(() -> fetchArtwork(urlToFetch));
                    }
                }
            }
        }

        applyMetadata();
        updateNotification();
    }

    public synchronized void setPlaybackState(
        int state,
        long positionMs,
        float speed
    ) {
        this.state = state;
        this.positionMs = positionMs;
        this.speed = speed;

        applyPlaybackState();
        updateNotification();
    }

    private synchronized void applyMetadata() {
        MediaMetadataCompat.Builder b =
            new MediaMetadataCompat.Builder()
                .putString(
                    MediaMetadataCompat.METADATA_KEY_TITLE,
                    title
                )
                .putString(
                    MediaMetadataCompat.METADATA_KEY_ARTIST,
                    artist
                )
                .putString(
                    MediaMetadataCompat.METADATA_KEY_ALBUM,
                    album
                )
                .putLong(
                    MediaMetadataCompat.METADATA_KEY_DURATION,
                    durationMs
                );

        if (artworkBitmap != null &&
            !artworkBitmap.isRecycled()) {

            b.putBitmap(
                MediaMetadataCompat.METADATA_KEY_ALBUM_ART,
                artworkBitmap
            );

            b.putBitmap(
                MediaMetadataCompat.METADATA_KEY_ART,
                artworkBitmap
            );

            b.putBitmap(
                MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON,
                artworkBitmap
            );
        }

        session.setMetadata(b.build());
    }

    private synchronized void applyPlaybackState() {
        long actions =
            PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO
                | PlaybackStateCompat.ACTION_STOP;

        session.setPlaybackState(
            new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, positionMs, speed)
                .build()
        );
    }

    private void fetchArtwork(String url) {
        HttpURLConnection conn = null;

        try {
            conn = (HttpURLConnection)
                new URL(url).openConnection();

            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setRequestProperty(
                "User-Agent",
                "Airdrome/Android"
            );
            conn.setInstanceFollowRedirects(true);

            try (
                InputStream rawStream = conn.getInputStream();
                BufferedInputStream in =
                    new BufferedInputStream(rawStream)
            ) {
                in.mark(1024 * 1024);

                BitmapFactory.Options bounds =
                    new BitmapFactory.Options();

                bounds.inJustDecodeBounds = true;

                BitmapFactory.decodeStream(
                    in,
                    null,
                    bounds
                );

                in.reset();

                BitmapFactory.Options opts =
                    new BitmapFactory.Options();

                opts.inSampleSize = calculateInSampleSize(
                    bounds,
                    ARTWORK_SIZE,
                    ARTWORK_SIZE
                );

                opts.inPreferredConfig =
                    Bitmap.Config.RGB_565;

                Bitmap decoded =
                    BitmapFactory.decodeStream(
                        in,
                        null,
                        opts
                    );

                if (decoded == null) {
                    return;
                }

                Bitmap finalBitmap = decoded;

                if (decoded.getWidth() != ARTWORK_SIZE ||
                    decoded.getHeight() != ARTWORK_SIZE) {

                    finalBitmap =
                        Bitmap.createScaledBitmap(
                            decoded,
                            ARTWORK_SIZE,
                            ARTWORK_SIZE,
                            true
                        );

                    if (finalBitmap != decoded) {
                        decoded.recycle();
                    }
                }

                artworkCache.put(url, finalBitmap);

                final Bitmap bm = finalBitmap;

                main.post(() -> {
                    synchronized (MediaSessionManager.this) {

                        if (url.equals(artworkUrl)) {
                            artworkBitmap = bm;

                            applyMetadata();
                            updateNotification();
                        }
                    }
                });
            }

        } catch (Exception ignored) {
            // Artwork failure is non-fatal.

        } finally {
            inflight.remove(url);

            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static int calculateInSampleSize(
        BitmapFactory.Options options,
        int reqWidth,
        int reqHeight
    ) {
        int height = options.outHeight;
        int width = options.outWidth;

        int inSampleSize = 1;

        if (height > reqHeight || width > reqWidth) {

            int halfHeight = height / 2;
            int halfWidth = width / 2;

            while ((halfHeight / inSampleSize) >= reqHeight
                && (halfWidth / inSampleSize) >= reqWidth) {

                inSampleSize *= 2;
            }
        }

        return Math.max(1, inSampleSize);
    }

    private void updateNotification() {
        MediaPlaybackService s = this.service;

        if (s != null) {
            s.updateNotification(buildNotification());
        }
    }

    Notification buildNotification() {
        Intent launch =
            new Intent(ctx, MainActivity.class);

        PendingIntent pi =
            PendingIntent.getActivity(
                ctx,
                0,
                launch,
                PendingIntent.FLAG_IMMUTABLE
                    | PendingIntent.FLAG_UPDATE_CURRENT
            );

        boolean isPlaying =
            state == PlaybackStateCompat.STATE_PLAYING;

        NotificationCompat.Builder b =
            new NotificationCompat.Builder(
                ctx,
                CHANNEL_ID
            )
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(
                    title.isEmpty()
                        ? "Airdrome"
                        : title
                )
                .setContentText(artist)
                .setSubText(album)
                .setContentIntent(pi)
                .setShowWhen(false)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(
                    NotificationCompat.PRIORITY_LOW
                )
                .setVisibility(
                    NotificationCompat.VISIBILITY_PUBLIC
                );

        if (artworkBitmap != null &&
            !artworkBitmap.isRecycled()) {

            b.setLargeIcon(artworkBitmap);
        }

        b.addAction(
            new NotificationCompat.Action(
                android.R.drawable.ic_media_previous,
                "Previous",
                MediaButtonReceiver
                    .buildMediaButtonPendingIntent(
                        ctx,
                        PlaybackStateCompat
                            .ACTION_SKIP_TO_PREVIOUS
                    )
            )
        );

        if (isPlaying) {
            b.addAction(
                new NotificationCompat.Action(
                    android.R.drawable.ic_media_pause,
                    "Pause",
                    MediaButtonReceiver
                        .buildMediaButtonPendingIntent(
                            ctx,
                            PlaybackStateCompat
                                .ACTION_PAUSE
                        )
                )
            );
        } else {
            b.addAction(
                new NotificationCompat.Action(
                    android.R.drawable.ic_media_play,
                    "Play",
                    MediaButtonReceiver
                        .buildMediaButtonPendingIntent(
                            ctx,
                            PlaybackStateCompat
                                .ACTION_PLAY
                        )
                )
            );
        }

        b.addAction(
            new NotificationCompat.Action(
                android.R.drawable.ic_media_next,
                "Next",
                MediaButtonReceiver
                    .buildMediaButtonPendingIntent(
                        ctx,
                        PlaybackStateCompat
                            .ACTION_SKIP_TO_NEXT
                    )
            )
        );

        b.setDeleteIntent(
            MediaButtonReceiver
                .buildMediaButtonPendingIntent(
                    ctx,
                    PlaybackStateCompat.ACTION_STOP
                )
        );

        b.setStyle(
            new androidx.media.app
                .NotificationCompat.MediaStyle()
                .setMediaSession(
                    session.getSessionToken()
                )
                .setShowActionsInCompactView(
                    0,
                    1,
                    2
                )
        );

        return b.build();
    }

    public synchronized void release() {
        io.shutdownNow();

        artworkBitmap = null;

        session.setActive(false);
        session.release();

        instance = null;
    }
}
