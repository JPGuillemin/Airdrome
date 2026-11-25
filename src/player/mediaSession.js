// player/mediaSession.js
//
// Platform-neutral facade for lock-screen / notification metadata and
// transport controls:
//   - web:    the browser MediaSession API
//   - native: the Android MediaSession plugin
//
// The player store only calls these helpers, so it never branches on platform.

import { isAndroid } from '@/shared/platform'
import { nativeMediaSession } from './nativeMediaSession'

/** MediaSession requires a non-zero playback rate; 1 = normal speed. */
var PLAYBACK_RATE = 1

var webSession = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined

/**
 * @param {Object} payload
 * @returns {void}
 */
function nativeSetPlaybackState(payload) {
  nativeMediaSession.setPlaybackState(payload).catch(function(error) {
    console.warn('[MediaSession] native state failed', error)
  })
}

/**
 * Update the scrubber position.
 *
 * @param {number} duration
 * @param {number} position
 * @param {boolean} isPlaying
 * @returns {void}
 */
export function setMediaSessionPosition(duration, position, isPlaying) {
  if (!isFinite(duration) || duration <= 0) {
    return
  }

  var current = position

  if (!isFinite(current) || current < 0) {
    current = 0
  }

  current = Math.min(current, duration)

  if (isAndroid) {
    nativeSetPlaybackState({
      state: isPlaying ? 'playing' : 'paused',
      position: current,
      speed: PLAYBACK_RATE
    })
    return
  }

  if (!webSession) {
    return
  }

  try {
    webSession.setPositionState({
      duration: duration,
      playbackRate: PLAYBACK_RATE,
      position: current
    })
  } catch (error) {
    console.warn('[MediaSession] setPositionState failed', error)
  }
}

/**
 * Update the playback state shown by the OS.
 *
 * @param {string} state
 * @param {number} position
 * @returns {void}
 */
export function setMediaSessionState(state, position) {
  if (isAndroid) {
    nativeSetPlaybackState({
      state: state,
      position: position,
      speed: PLAYBACK_RATE
    })
    return
  }

  if (webSession) {
    webSession.playbackState = state
  }
}

/**
 * Update the lock-screen / notification metadata.
 *
 * @param {Object} info
 * @param {string} info.title
 * @param {string} info.artist
 * @param {string} info.album
 * @param {string|null} info.artworkUrl
 * @param {number} info.duration
 * @returns {void}
 */
export function setMediaSessionMetadata(info) {
  if (isAndroid) {
    nativeMediaSession.setMetadata({
      title: info.title,
      artist: info.artist,
      album: info.album,
      artworkUrl: info.artworkUrl,
      duration: info.duration
    }).catch(function(error) {
      console.warn('[MediaSession] native metadata failed', error)
    })
    return
  }

  if (!webSession) {
    return
  }

  var artwork = []

  if (info.artworkUrl) {
    var sizes = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']

    for (var i = 0; i < sizes.length; i++) {
      artwork.push({
        src: info.artworkUrl,
        sizes: sizes[i],
        type: 'image/png'
      })
    }
  }

  webSession.metadata = new MediaMetadata({
    title: info.title,
    artist: info.artist,
    album: info.album,
    artwork: artwork
  })
}

/**
 * Browser MediaSession action handlers (lock screen, media keys, headset
 * buttons). Android uses the native MediaSession plugin instead, wired in
 * nativePlayback.js.
 *
 * @param {Object} playerStore
 * @returns {void}
 */
export function setupWebMediaSession(playerStore) {
  if (!webSession) {
    return
  }

  webSession.setActionHandler('play', function() {
    playerStore.play()
  })

  webSession.setActionHandler('pause', function() {
    playerStore.pause()
  })

  webSession.setActionHandler('nexttrack', function() {
    playerStore.next(true)
  })

  webSession.setActionHandler('previoustrack', function() {
    playerStore.back()
  })

  webSession.setActionHandler('stop', function() {
    playerStore.pause()
  })

  webSession.setActionHandler('seekto', function(details) {
    if (details.fastSeek || details.seekTime === undefined) {
      return
    }

    playerStore.seek(Math.min(details.seekTime, playerStore.duration))
  })

  webSession.setActionHandler('seekforward', function(details) {
    var offset = details.seekOffset || 10
    playerStore.seek(Math.min(playerStore.currentTime + offset, playerStore.duration))
  })

  webSession.setActionHandler('seekbackward', function(details) {
    var offset = details.seekOffset || 10
    playerStore.seek(Math.max(playerStore.currentTime - offset, 0))
  })
}
