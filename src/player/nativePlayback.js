// player/nativePlayback.js
//
// Android-only playback integration. ExoPlayer keeps playing while the WebView
// is frozen, so this module keeps the JS queue in sync with the native player
// and forwards lock-screen / headset actions to the store.
//
// Nothing here runs in a browser; the web equivalents live in webPlayback.js.

import { watch } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'
import { audio } from '@/player/engine'
import { nativeMediaSession } from '@/player/nativeMediaSession'

/**
 * @param {Object} playerStore
 * @param {Object} reporter - Playback reporter from playbackReporting.js.
 * @returns {void}
 */
export function setupNativePlayback(playerStore, reporter) {
  setupWindowSync(playerStore)
  setupMediaSessionActions(playerStore)
  setupAppStateSync(playerStore, reporter)

  // Native advanced to the next track while JS was asleep (or from the lock
  // screen / headset). Follow it without reloading: ExoPlayer is already
  // playing the new track.
  audio.ontrackchanged = function(index) {
    playerStore.followNative(index)
  }
}

/**
 * Keep ExoPlayer's queue window in sync so it can start the next track by
 * itself while the WebView is frozen.
 *
 * @param {Object} playerStore
 * @returns {void}
 */
function setupWindowSync(playerStore) {
  watch(
    function() {
      return playerStore.windowKey
    },
    function() {
      playerStore.syncWindow()
    },
    { immediate: true }
  )

  // When a track finishes downloading, re-push the window so native uses the
  // local file:// URI instead of the remote stream. The reverse happens when
  // a cache entry is deleted.
  var timer = null

  function syncWindowSoon() {
    if (timer) {
      return
    }

    timer = window.setTimeout(function() {
      timer = null
      playerStore.syncWindow()
    }, 300)
  }

  window.addEventListener('audioCached', syncWindowSoon)
  window.addEventListener('audioCacheDeleted', syncWindowSoon)
  window.addEventListener('audioCacheClearedAll', syncWindowSoon)
}

/**
 * Lock-screen / headset actions emitted by the MediaSession plugin.
 *
 * @param {Object} playerStore
 * @returns {void}
 */
function setupMediaSessionActions(playerStore) {
  nativeMediaSession.addListener('play', function() {
    playerStore.play()
  })

  nativeMediaSession.addListener('pause', function() {
    console.info('[MediaSession] native pause event')
    playerStore.pause()
  })

  nativeMediaSession.addListener('next', function() {
    playerStore.next(true)
  })

  nativeMediaSession.addListener('previous', function() {
    playerStore.back()
  })

  nativeMediaSession.addListener('stop', function() {
    console.info('[MediaSession] native stop event')
    playerStore.pause()
  })

  nativeMediaSession.addListener('seek', function(data) {
    var position = Math.min(Number(data && data.position) || 0, playerStore.duration)
    playerStore.seek(position)
  })

  nativeMediaSession.addListener('seekto', function(data) {
    var position = Math.min(Number(data && data.position) || 0, playerStore.duration)
    playerStore.seek(position)
  })

  nativeMediaSession.addListener('seekforward', function(data) {
    var offset = Number(data && data.offset) || 10
    var position = Math.min(playerStore.currentTime + offset, playerStore.duration)
    playerStore.seek(position)
  })

  nativeMediaSession.addListener('seekbackward', function(data) {
    var offset = Number(data && data.offset) || 10
    var position = Math.max(playerStore.currentTime - offset, 0)
    playerStore.seek(position)
  })

  nativeMediaSession.addListener('audioFocusChange', function(data) {
    console.info('[MediaSession] focus ' + (data && data.type))
  })

  nativeMediaSession.addListener('audioRouteChange', function(data) {
    console.info('[MediaSession] route ' + (data && data.route))
  })
}

/**
 * Re-sync the store when the app comes back, and flush state before it is
 * frozen.
 *
 * @param {Object} playerStore
 * @param {Object} reporter
 * @returns {void}
 */
function setupAppStateSync(playerStore, reporter) {
  CapacitorApp.addListener('appStateChange', async function(state) {
    if (state.isActive) {
      await syncFromNative(playerStore, reporter)
      reporter.resume()
      return
    }

    // Run immediately: the WebView may be frozen right after this callback.
    await flushBackgroundState(playerStore, reporter)
  }).catch(function(error) {
    console.warn('[Native] app state listener failed', error)
  })
}

/**
 * Pull the native player state back into the store after the WebView was
 * suspended. ExoPlayer may have advanced to another track in the meantime.
 *
 * @param {Object} playerStore
 * @param {Object} reporter
 * @returns {Promise<void>}
 */
async function syncFromNative(playerStore, reporter) {
  try {
    var status = await audio.getStatus()

    if (!status || !status.loaded) {
      return
    }

    var index = -1

    for (var i = 0; i < playerStore.queue.length; i++) {
      if (playerStore.queue[i].url === status.key) {
        index = i
        break
      }
    }

    if (index >= 0 && index !== playerStore.queueIndex) {
      playerStore.followNative(index)
    }

    playerStore.currentTime = status.position || 0
    reporter.setPosition(status.position || 0)

    if (status.duration > 0) {
      playerStore.duration = status.duration
    }

    playerStore.isPlaying = !!status.playing && !status.ended

    if (status.playing && !status.ended) {
      playerStore.userPaused = false
    }

    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState(status.playing && !status.ended ? 'playing' : 'paused')
    playerStore.updateMediaSession()
    console.info('[Native] status ' + JSON.stringify(status))

    // The native player reached the end while the WebView was suspended.
    // Continue the queue now that JS is awake, even if the 'ended' bridge
    // event was lost.
    if (status.ended) {
      if (playerStore.hasNext || playerStore.repeat) {
        await playerStore.next(false)
      } else {
        await playerStore.processQueueEnd()
      }
    }
  } catch (error) {
    console.warn('[Native] state sync failed', error)
  }
}

/**
 * Persist queue position / playback report before the WebView is frozen.
 *
 * @param {Object} playerStore
 * @param {Object} reporter
 * @returns {Promise<void>}
 */
async function flushBackgroundState(playerStore, reporter) {
  try {
    await playerStore.saveQueue()
    reporter.resume()
  } catch (error) {
    console.warn('[Native] background save failed', error)
  }
}
