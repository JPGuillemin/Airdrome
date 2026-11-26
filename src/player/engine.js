// player/engine.js
//
// Picks the audio backend and owns every platform decision the rest of the
// player must not know about:
//   - Web Audio vs ExoPlayer
//   - web vs native playback setup
//   - MediaSession metadata/state (browser API or Android plugin)
//   - the web-only end-of-track safety net
//
// lifecycle.js supplies the platform setup implementations; this module is the
// only place that knows which one runs.

import { Capacitor } from '@capacitor/core'
import { isAndroid } from '@/shared/platform'
import { audio as webAudio } from '@/player/audio'
import { ExoController } from '@/player/exo'
import { ReplayGainMode, storedReplayGainMode } from '@/player/audioShared'
import { nativeMediaSession } from '@/player/nativeMediaSession'

/** Active audio engine for this platform. */
export var audio = isAndroid ? new ExoController() : webAudio

/**
 * Platform hooks used by lifecycle.js. The web/native implementations are
 * passed in by the caller, so lifecycle never branches on the platform.
 */
export var platform = {
  /**
   * Run the web or native playback setup.
   *
   * @param {Object} handlers - { web, native }
   * @param {Object} playerStore
   * @param {Object} reporter
   * @param {Function} getLastPlayTime
   * @returns {Promise<void>|void}
   */
  setup: function(handlers, playerStore, reporter, getLastPlayTime) {
    if (isAndroid) {
      return handlers.native(playerStore, reporter)
    }

    return handlers.web(playerStore, getLastPlayTime)
  },

  /** Re-push the queue window after a track load (native only). */
  afterLoad: function(playerStore) {
    if (isAndroid) {
      playerStore.syncWindow()
    }
  },

  /** Web Audio needs a last-second auto-advance safety net. */
  shouldAutoAdvance: function(remaining, hasNext) {
    return !isAndroid && remaining < 0.15 && hasNext
  },

  /** Closing the tab ends the reported session on web, not on Android. */
  onPageHide: function(reporter) {
    if (!isAndroid) {
      reporter.close()
    }
  }
}

// ---------------------------------------------------------------------------
// MediaSession facade
// ---------------------------------------------------------------------------

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

console.info('[engine] platform=' + Capacitor.getPlatform() +
  ' androidBridge=' + (typeof window !== 'undefined' && !!window.androidBridge) +
  ' isAndroid=' + isAndroid +
  ' engine=' + (isAndroid ? 'ExoPlayer' : 'WebAudio'))

export { ReplayGainMode, storedReplayGainMode }
