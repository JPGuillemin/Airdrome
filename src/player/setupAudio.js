// player/setupAudio.js
//
// Wires the selected audio engine to the player store. Platform-specific
// behaviour is delegated:
//   - webPlayback.js     browser routing / visibility / keyboard
//   - nativePlayback.js  ExoPlayer sync / app lifecycle / lock screen
//   - playbackReporting.js OpenSubsonic play sessions
//   - mediaSession.js    browser MediaSession action handlers
//
// This file only contains what both platforms share.

import { watch } from 'vue'
import { audio, storedReplayGainMode, isAndroid } from './engine'
import { detectAudioCodec } from './audioCodec'
import { createPlaybackReporter } from './playbackReporting'
import { setupWebPlayback } from './webPlayback'
import { setupNativePlayback } from './nativePlayback'
import { setupWebMediaSession } from './mediaSession'
import { claimSession, onPlaybackStopped, onUnload } from './session'

/**
 * Wire the audio controller to the store.
 *
 * @param {Object} playerStore
 * @param {Object} mainStore
 * @returns {Promise<void>}
 */
export async function setupAudio(playerStore, mainStore) {
  detectAudioCodec()

  // -------------------------------------------------------------------------
  // Radio extension and gapless preload
  // -------------------------------------------------------------------------

  watch(
    function() {
      return [playerStore.queueIndex, playerStore.queue.length, playerStore.repeat]
    },
    function() {
      if (playerStore.track && !playerStore.hasNext && !playerStore.repeat) {
        playerStore.ensureNextTrack()
      }
    },
    { immediate: true }
  )

  watch(
    function() {
      return playerStore.nextTrack ? playerStore.nextTrack.url : undefined
    },
    function(url) {
      audio.setNextUrl(url)
    }
  )

  var reporter = createPlaybackReporter(playerStore)

  // -------------------------------------------------------------------------
  // Playback events
  // -------------------------------------------------------------------------

  /** Timestamp of the last `play` event, used by the web device watcher. */
  var playTime = 0

  playerStore.setMediaSessionState('none')

  audio.onplay = function() {
    playerStore.isPlaying = true
    playerStore.userPaused = false
    claimSession()
    playTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('playing')
    reporter.play()
  }

  audio.onpause = function() {
    playerStore.isPlaying = false
    onPlaybackStopped()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('paused')
    reporter.pause()
  }

  audio.onwaiting = function() {
    console.info('[Audio] waiting/buffering')
    playerStore.isPlaying = false
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('paused')
    playerStore.updateMediaSession('Loading ...', '', '')
  }

  audio.onplaying = function() {
    playerStore.isPlaying = true
    playerStore.userPaused = false
    playTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('playing')
    playerStore.updateMediaSession()
  }

  audio.onended = function() {
    reporter.ended()

    if (playerStore.hasNext || playerStore.repeat) {
      return playerStore.next(false)
    }

    return playerStore.processQueueEnd()
  }

  // Circuit breaker: a broken server / stream limit must not turn into an
  // endless skip loop through the whole queue.
  var errorBurst = 0
  var errorBurstAt = 0

  audio.onerror = function(error) {
    console.warn('[Audio] Fatal error', error)

    var reportedError = error

    if (!(error instanceof Error)) {
      reportedError = new Error('Audio playback error')
    }

    mainStore.setError(reportedError)

    var now = Date.now()
    errorBurst = now - errorBurstAt < 3000 ? errorBurst + 1 : 1
    errorBurstAt = now

    if (errorBurst >= 3) {
      console.warn('[Audio] stopping after repeated failures')
      playerStore.userPaused = true
      playerStore.isPlaying = false
      return
    }

    if (playerStore.hasNext) {
      playerStore.next(true)
    } else if (playerStore.hasPrevious) {
      playerStore.back()
    } else {
      playerStore.resetQueue()
    }
  }

  audio.ondurationchange = function(duration) {
    playerStore.duration = duration
    playerStore.setMediaSessionPosition()
  }

  audio.onseeked = function(time) {
    reporter.seeked(time)
  }

  var saveTime = 0

  audio.ontimeupdate = function(time) {
    if (playerStore.inTransition) {
      return
    }

    playerStore.currentTime = time
    reporter.setPosition(time)

    var track = playerStore.track
    var isPlaying = playerStore.isPlaying
    var now = Date.now()

    if (now - saveTime > 10000) {
      saveTime = now
      playerStore.saveQueue()
    }

    // Ignore the first 20s to avoid false triggers on seek or slow loads.
    if (!track || !isPlaying || time < 20) {
      return
    }

    var duration = playerStore.duration
    var remaining = duration - time

    // ExoPlayer advances the queue natively; only the Web Audio path needs
    // this last-second safety net.
    if (!isAndroid && remaining < 0.15 && playerStore.hasNext) {
      playerStore.next(false)
      return
    }

    // Legacy servers only accept a one-shot scrobble call.
    if (
      !reporter.enabled &&
      !playerStore.scrobbled &&
      duration > 0 &&
      time / duration > 0.5
    ) {
      scrobbleTrack(track.id)
    }
  }

  // Track whose legacy scrobble is in flight, so timeupdate ticks do not
  // fire it again before the request settles.
  var scrobbling = null

  async function scrobbleTrack(trackId) {
    if (scrobbling === trackId) {
      return
    }

    scrobbling = trackId

    try {
      await playerStore.api.scrobble(trackId)

      if (playerStore.track && playerStore.track.id === trackId) {
        playerStore.scrobbled = true
      }

      playerStore.scrobbleCount += 1
    } catch (error) {
      console.warn('[Scrobble] failed', error)
      // Do not retry on every tick for this track.
      playerStore.scrobbled = true
    } finally {
      scrobbling = null
    }
  }

  // -------------------------------------------------------------------------
  // Platform-specific wiring
  // -------------------------------------------------------------------------

  if (isAndroid) {
    setupNativePlayback(playerStore, reporter)
  } else {
    await setupWebPlayback(playerStore, function() {
      return playTime
    })
    setupWebMediaSession(playerStore)
  }

  // -------------------------------------------------------------------------
  // Page lifecycle
  // -------------------------------------------------------------------------

  window.addEventListener('beforeunload', function(event) {
    onUnload()

    if (playerStore.isPlaying) {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }
  })

  // Closing the tab is the last chance to report the play: use a keepalive
  // request so the server still receives `stopped` while the page unloads.
  window.addEventListener('pagehide', function() {
    // On Android the native player keeps playing after the WebView is
    // suspended; ending the reported session here would be wrong.
    if (!isAndroid) {
      reporter.close()
    }
  })

  // -------------------------------------------------------------------------
  // Initialise audio controller with persisted settings
  // -------------------------------------------------------------------------

  audio.setReplayGainMode(storedReplayGainMode)
  audio.setVolume(playerStore.volume)

  // -------------------------------------------------------------------------
  // Initialise the current track (paused) after restoring the queue
  // -------------------------------------------------------------------------

  if (playerStore.track) {
    await playerStore.loadTrack({ paused: true })
  }
}
