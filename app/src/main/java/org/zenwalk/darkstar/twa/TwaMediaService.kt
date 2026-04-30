package org.zenwalk.darkstar.twa

import android.content.Intent
import android.os.Bundle
import androidx.media.MediaBrowserServiceCompat
import androidx.media.session.MediaButtonReceiver
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.PlaybackStateCompat

class TwaMediaService : MediaBrowserServiceCompat() {

    private lateinit var mediaSession: MediaSessionCompat

    override fun onCreate() {
        super.onCreate()

        mediaSession = MediaSessionCompat(this, "TwaMediaSession").apply {

            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )

            isActive = true  // 🔴 REQUIRED for AVRCP + Bluetooth metadata propagation

            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    sendCommandToWeb("play")
                }

                override fun onPause() {
                    sendCommandToWeb("pause")
                }

                override fun onSkipToNext() {
                    sendCommandToWeb("next")
                }

                override fun onSkipToPrevious() {
                    sendCommandToWeb("previous")
                }

                override fun onSeekTo(pos: Long) {
                    sendCommandToWeb("seek", pos)
                }
            })

            // Initialize default state so Bluetooth systems don’t see "null session"
            setPlaybackState(
                PlaybackStateCompat.Builder()
                    .setState(PlaybackStateCompat.STATE_NONE, 0L, 1.0f)
                    .setActions(
                        PlaybackStateCompat.ACTION_PLAY or
                        PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackStateCompat.ACTION_SEEK_TO
                    )
                    .build()
            )
        }

        sessionToken = mediaSession.sessionToken
    }

    /**
     * Called from JS bridge (you already send metadata via Capacitor)
     */
    fun updateMetadata(title: String?, artist: String?, album: String?) {
        val metadata = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title ?: "")
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist ?: "")
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album ?: "")
            .build()

        mediaSession.setMetadata(metadata)
    }

    /**
     * Called from JS bridge when playback changes
     */
    fun updatePlaybackState(state: Int, position: Long = 0L) {
        val playbackState = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_SEEK_TO
            )
            .setState(state, position, 1.0f)
            .build()

        mediaSession.setPlaybackState(playbackState)
    }

    private fun sendCommandToWeb(action: String, value: Long? = null) {
        val intent = Intent("org.zenwalk.darkstar.twa.MEDIA_COMMAND").apply {
            putExtra("action", action)
            value?.let { putExtra("value", it) }
        }
        sendBroadcast(intent)
    }

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot {
        return BrowserRoot("root", null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<MutableList<android.support.v4.media.MediaBrowserCompat.MediaItem>>
    ) {
        result.sendResult(mutableListOf())
    }

    override fun onDestroy() {
        mediaSession.release()
        super.onDestroy()
    }
}
