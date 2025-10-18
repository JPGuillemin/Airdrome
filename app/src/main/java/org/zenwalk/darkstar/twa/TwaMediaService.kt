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
        }

        sessionToken = mediaSession.sessionToken
    }

    private fun sendCommandToWeb(action: String, value: Long? = null) {
        // Forward command to TWA via broadcast
        val intent = Intent("org.zenwalk.darkstar.twa.MEDIA_COMMAND").apply {
            putExtra("action", action)
            value?.let { putExtra("value", it) }
        }
        sendBroadcast(intent)
    }

    override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot {
        return BrowserRoot("root", null)
    }

    override fun onLoadChildren(parentId: String, result: Result<MutableList<android.support.v4.media.MediaBrowserCompat.MediaItem>>) {
        result.sendResult(mutableListOf())
    }

    override fun onDestroy() {
        mediaSession.release()
        super.onDestroy()
    }
}
