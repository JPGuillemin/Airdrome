package org.zenwalk.darkstar.twa

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import androidx.media.MediaBrowserServiceCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

class TwaMediaService : MediaBrowserServiceCompat() {

    private lateinit var mediaSession: MediaSessionCompat
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onCreate() {
        super.onCreate()

        mediaSession = MediaSessionCompat(this, "TwaMediaSession").apply {

            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )

            isActive = true

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
     * Metadata update without artwork
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
     * Metadata update WITH artwork URL.
     * Android phone downloads image, converts to Bitmap,
     * then Bluetooth sends bitmap to car via AVRCP.
     */
    fun updateMetadata(
        title: String?,
        artist: String?,
        album: String?,
        artworkUrl: String?
    ) {
        scope.launch {
            val bitmap = withContext(Dispatchers.IO) {
                loadBitmap(artworkUrl)
            }

            val metadata = MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title ?: "")
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist ?: "")
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album ?: "")
                .apply {
                    bitmap?.let {
                        putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it)
                        putBitmap(MediaMetadataCompat.METADATA_KEY_ART, it)
                    }
                }
                .build()

            mediaSession.setMetadata(metadata)
        }
    }

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

    private fun loadBitmap(url: String?): Bitmap? {
        if (url.isNullOrBlank()) return null

        return try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.instanceFollowRedirects = true
            connection.doInput = true
            connection.connect()

            val input = connection.inputStream
            val raw = BitmapFactory.decodeStream(input)
            input.close()
            connection.disconnect()

            raw?.let { Bitmap.createScaledBitmap(it, 512, 512, true) }
        } catch (_: Exception) {
            null
        }
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
