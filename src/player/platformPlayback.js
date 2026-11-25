// player/platformPlayback.js
//
// Host-platform integration for the player. The three sections are independent:
//
//   1. MediaSession facade  - metadata/state for the OS (web + native)
//   2. Web playback         - browser devices, visibility, keyboard
//   3. Native playback      - ExoPlayer sync, app lifecycle, lock screen
//
// setupAudio() picks the web or native section at startup; the player store
// only uses the platform-neutral MediaSession facade.

import { watch } from 'vue'
import { throttle } from 'lodash-es'
import { App as CapacitorApp } from '@capacitor/app'
import { sleep } from '@/shared/utils'
import { isAndroid, isTouchDevice } from '@/shared/platform'
import { audio } from '@/player/engine'
import { nativeMediaSession } from '@/player/nativeMediaSession'

// ---------------------------------------------------------------------------
// 1. MediaSession facade
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

/**
 * Browser MediaSession action handlers (lock screen, media keys, headset
 * buttons). Android uses the native MediaSession plugin instead, wired in
 * the native section below.
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

// ---------------------------------------------------------------------------
// 2. Web playback
// ---------------------------------------------------------------------------

/**
 * Wire the browser-only playback behaviours.
 *
 * @param {Object} playerStore
 * @param {Function} getLastPlayTime - Timestamp (ms) of the last `play` event.
 * @returns {Promise<void>}
 */
export async function setupWebPlayback(playerStore, getLastPlayTime) {
  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  var onVisibilityChange = throttle(async function() {
    if (playerStore.isPlaying) {
      return
    }

    if (document.visibilityState === 'visible' && !playerStore.userPaused) {
      playerStore.play()
    }
  }, 500, { leading: false, trailing: true })

  document.addEventListener('visibilitychange', onVisibilityChange)

  if (!isTouchDevice) {
    setupKeyboardShortcuts(playerStore)
  }

  await setupOutputDevices(playerStore, getLastPlayTime, onVisibilityChange)
}

/**
 * Pause when the output disappears, resume when it comes back, and poll for
 * changes Chrome does not report through `devicechange` (Bluetooth notably).
 *
 * @param {Object} playerStore
 * @param {Function} getLastPlayTime
 * @param {Function} onVisibilityChange
 * @returns {Promise<void>}
 */
async function setupOutputDevices(playerStore, getLastPlayTime, onVisibilityChange) {
  /**
   * Snapshot current audio device IDs.
   *
   * @returns {Promise<Set<string>>}
   */
  async function getDeviceIds() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return new Set()
    }

    var devices = await navigator.mediaDevices.enumerateDevices()
    var result = new Set()

    for (var i = 0; i < devices.length; i++) {
      var device = devices[i]

      if (device.kind !== 'audiooutput' && device.kind !== 'audioinput') {
        continue
      }

      var id = device.kind + ':' + device.deviceId + ':' + device.label

      // On desktop, ignore Chrome's synthetic default/communications/dummy
      // sinks to avoid false removals. On Android, these virtual sinks are
      // often the only signal for a Bluetooth route change, so keep them.
      if (!isTouchDevice) {
        if (!device.deviceId) {
          continue
        }

        if (device.deviceId === 'default' || device.deviceId === 'communications') {
          continue
        }

        if (id.indexOf(':default:') !== -1 || id.indexOf(':communications:') !== -1) {
          continue
        }

        if (/^(default|communications|dummy)/i.test(device.label || '')) {
          continue
        }
      }

      result.add(id)
    }

    return result
  }

  var knownOutputs = null
  var deviceChangeToken = 0

  var onDeviceChange = throttle(async function() {
    console.info('[devices] change')

    if (!knownOutputs || playerStore.userPaused) {
      return
    }

    // Let Bluetooth stacks settle: a reconnect often reports the old endpoint
    // as removed before the new one appears.
    var token = deviceChangeToken + 1
    deviceChangeToken = token
    await sleep(400)

    if (token !== deviceChangeToken || playerStore.userPaused) {
      return
    }

    var before = knownOutputs
    var current

    try {
      current = await getDeviceIds()
    } catch (error) {
      console.warn('[devices] enumeration failed', error)
      return
    }

    if (token !== deviceChangeToken || playerStore.userPaused) {
      knownOutputs = current
      return
    }

    var added = false
    var removed = false

    current.forEach(function(id) {
      if (!before.has(id)) {
        added = true
      }
    })

    before.forEach(function(id) {
      if (!current.has(id)) {
        removed = true
      }
    })

    knownOutputs = current

    // A simultaneous removal + addition is a switch/reconnect, not a real
    // disconnect. Keep or restore playback instead of pausing.
    if (removed && added) {
      console.info('[devices] output switched -> keep playing')

      if (!playerStore.isPlaying) {
        await playerStore.play()
      }

      return
    }

    if (removed && Date.now() - getLastPlayTime() > 1000) {
      console.info('[devices] output removed -> pause')
      await playerStore.interrupt()
      return
    }

    if (added) {
      console.info('[devices] output added -> play')
      await playerStore.play()
    }
  }, 500, { leading: false, trailing: true })

  // -------------------------------------------------------------------------
  // Polling fallback
  // -------------------------------------------------------------------------
  // Chrome does not reliably fire `devicechange` for audio-output changes
  // (notably Bluetooth disconnects). Polling covers that gap.

  var eventPollTimer = null

  function checkEvents() {
    if (playerStore.userPaused) {
      return
    }

    onVisibilityChange()

    if (!knownOutputs) {
      return
    }

    onDeviceChange()
  }

  function startEventPoll() {
    if (eventPollTimer) {
      return
    }

    eventPollTimer = setInterval(checkEvents, 2000)
  }

  function stopEventPoll() {
    if (eventPollTimer) {
      clearInterval(eventPollTimer)
      eventPollTimer = null
    }
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      checkEvents()
    }
  })

  window.addEventListener('focus', checkEvents)
  window.addEventListener('pagehide', stopEventPoll)

  // -------------------------------------------------------------------------
  // Microphone permission (exposes device labels)
  // -------------------------------------------------------------------------

  /**
   * Request microphone permission, then release the stream.
   *
   * @returns {Promise<void>}
   */
  async function requestMicAccess() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return
    }

    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      var tracks = stream.getTracks()

      for (var i = 0; i < tracks.length; i++) {
        tracks[i].stop()
      }

      knownOutputs = await getDeviceIds()
      console.info('[devices] mic permission granted')
    } catch (error) {
      console.warn('[devices] mic permission unavailable:', error)
    }
  }

  /**
   * Ask for microphone permission on the first user gesture.
   *
   * @returns {Promise<void>}
   */
  async function ensureMicAccess() {
    var state = 'prompt'

    if (navigator.permissions && navigator.permissions.query) {
      try {
        var status = await navigator.permissions.query({ name: 'microphone' })
        state = status.state
      } catch (error) {
        state = 'prompt'
      }
    }

    if (state === 'granted') {
      knownOutputs = await getDeviceIds()
      return
    }

    if (state === 'denied') {
      return
    }

    function onGesture() {
      window.removeEventListener('pointerdown', onGesture, true)
      window.removeEventListener('keydown', onGesture, true)
      requestMicAccess()
    }

    window.addEventListener('pointerdown', onGesture, true)
    window.addEventListener('keydown', onGesture, true)
  }

  var deviceIds = null

  try {
    deviceIds = await getDeviceIds()
  } catch (error) {
    console.warn('[devices] initialization failed', error)
  }

  if (!deviceIds) {
    return
  }

  knownOutputs = deviceIds

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
  }

  startEventPoll()

  try {
    await ensureMicAccess()
  } catch (error) {
    console.warn('[devices] microphone setup failed', error)
  }
}

/**
 * Space / arrows control playback on desktop.
 *
 * @param {Object} playerStore
 * @returns {void}
 */
function setupKeyboardShortcuts(playerStore) {
  window.addEventListener('keydown', function(event) {
    var target = event.target

    if (target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    )) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      playerStore.playPause()
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault()
      playerStore.back()
    } else if (event.code === 'ArrowRight') {
      event.preventDefault()
      playerStore.next(true)
    }
  })
}

// ---------------------------------------------------------------------------
// 3. Native playback
// ---------------------------------------------------------------------------

/**
 * @param {Object} playerStore
 * @param {Object} reporter - Playback reporter from session.js.
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
