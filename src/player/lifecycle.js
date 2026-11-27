// player/lifecycle.js
//
// Player lifecycle: the single entry point that connects the audio engine to
// the store. It contains four independent sections:
//
//   1. Session ownership  - server queue ownership / takeover detection
//   2. Playback reporting - OpenSubsonic play sessions
//   3. Web playback       - browser devices, visibility, keyboard, MediaSession
//   4. Native playback    - ExoPlayer sync, app lifecycle, lock screen
//
// Platform choices live in engine.js; this file only receives hooks and
// implementations, so it never branches on Android vs web.

import { watch } from 'vue'
import { throttle } from 'lodash-es'
import { App as CapacitorApp } from '@capacitor/app'
import { sleep } from '@/shared/utils'
import { isOnline } from '@/shared/network'
import { isTouchDevice } from '@/shared/platform'
import { audio, platform, storedReplayGainMode } from './engine'
import { detectAudioCodec } from './audioShared'
import { nativeMediaSession } from './nativeMediaSession'
import { streamQuality } from '@/shared/streamQuality'

/**
 * Wire the audio engine, platform hooks and server session to the store.
 *
 * @param {Object} playerStore
 * @param {Object} mainStore
 * @returns {Promise<void>}
 */
export async function setupPlayerLifecycle(playerStore, mainStore) {
  setPlayerStore(playerStore)
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

  // A new stream bitrate applies immediately to the next tracks: their queue
  // URLs are rebuilt and the native window is re-pushed.
  watch(streamQuality, function() {
    playerStore.applyStreamQuality()
  })

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
    if (platform.shouldAutoAdvance(remaining, playerStore.hasNext)) {
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
  // Platform-specific wiring (engine decides web vs native)
  // -------------------------------------------------------------------------

  await platform.setup({
    web: setupWebPlayback,
    native: setupNativePlayback
  }, playerStore, reporter, function() {
    return playTime
  })

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
    // suspended; the engine decides whether closing the session is correct.
    platform.onPageHide(reporter)
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

// ---------------------------------------------------------------------------
// 1. Session ownership
// ---------------------------------------------------------------------------

var POLL_MS = 5000

// The first request after a resume can fail (background WebView, stale connection).
var CLAIM_BACKOFF_MS = [0, 400, 1200, 2500, 5000]

var playerStore = null
var ownsQueue = false
var pollTimer = undefined
var claimPromise = null

/**
 * Bind the session helpers to the player store. Called once by
 * setupPlayerLifecycle(); store.saveQueue() can be called before that, so
 * saveSession() stays a no-op until the store is known.
 *
 * @param {Object} store
 * @returns {void}
 */
function setPlayerStore(store) {
  playerStore = store
}

// ---------------------------------------------------------------------------
// Session lifecycle (called from audio events)
// ---------------------------------------------------------------------------

/**
 * Playback started: write the queue so the server names this device.
 *
 * @returns {Promise<void>}
 */
async function claimSession() {
  if (ownsQueue || !playerStore) {
    return
  }

  if (claimPromise) {
    await claimPromise
    return
  }

  if (!canWrite(playerStore)) {
    return
  }

  claimPromise = claimWithRetry()

  try {
    await claimPromise
  } finally {
    claimPromise = null
  }
}

/**
 * Mark this device as the queue owner and start takeover detection.
 *
 * @param {Object} player
 * @param {boolean} [onlyWhenPlaying] Skip polling while playback is paused.
 * @returns {void}
 */
function markOwner(player, onlyWhenPlaying) {
  ownsQueue = true

  if (!player.singleSession) {
    return
  }

  if (onlyWhenPlaying && !player.isPlaying) {
    return
  }

  schedulePoll()
}

/**
 * Try to write the queue a few times with a short backoff.
 *
 * @returns {Promise<void>}
 */
async function claimWithRetry() {
  for (var i = 0; i < CLAIM_BACKOFF_MS.length; i++) {
    if (CLAIM_BACKOFF_MS[i]) {
      await sleep(CLAIM_BACKOFF_MS[i])
    }

    if (ownsQueue) {
      return
    }

    if (await writeQueue()) {
      markOwner(playerStore)
      return
    }
  }

  console.info('[session] claim failed after retries; will retry on next save')
}

/**
 * Playback stopped: save the final position, then release.
 *
 * @returns {Promise<void>}
 */
async function onPlaybackStopped() {
  if (!ownsQueue || !playerStore) {
    return
  }

  await saveSession()

  // Playback may have resumed while saving.
  if (!playerStore.isPlaying) {
    releaseSession()
  }
}

/**
 * Page closing: only the owner writes.
 *
 * @returns {void}
 */
function onUnload() {
  if (ownsQueue || claimPromise) {
    saveSession({ blind: true })
  }
}

/**
 * Give up the session without writing to the server.
 *
 * @returns {void}
 */
export function releaseSession() {
  ownsQueue = false
  clearTimeout(pollTimer)
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/**
 * The only queue-writing path.
 *
 * @param {Object} [options]
 * @param {boolean} [options.blind] - Skip the ownership check (page unload).
 * @returns {Promise<void>}
 */
export async function saveSession(options) {
  if (!playerStore) {
    return
  }

  var settings = options || {}
  var blind = settings.blind === true
  var player = playerStore

  if (!canWrite(player)) {
    return
  }

  try {
    if (!blind && !(await ensureOwnership(player))) {
      return
    }

    await writeQueue()
  } catch (error) {
    console.info('[session] save aborted:', error)
  }
}

/**
 * Return true when this device may write the server queue.
 *
 * If another device owns it, release and pause instead.
 *
 * @param {Object} player
 * @returns {Promise<boolean>}
 */
async function ensureOwnership(player) {
  if (!player.singleSession) {
    ownsQueue = true
    return true
  }

  // A claim write may still be in flight; the server can still name the
  // previous device until it completes, so wait before judging ownership.
  if (claimPromise) {
    await claimPromise

    if (ownsQueue) {
      return true
    }
  }

  var queue = await player.api.getPlayQueue()

  if (player.api.isOwnQueueWriter(queue.changedBy)) {
    markOwner(player, true)
    return true
  }

  // Another device wrote the queue. While idle, just do not write (a later
  // play claims the session); while active, it is a real takeover: pause.
  if (!ownsQueue) {
    return false
  }

  console.info('[session] taken over by ' + queue.changedBy)
  handleTakeover(player, queue.changedBy)
  return false
}

/**
 * Another device took the session: stop writing and pause.
 *
 * @param {Object} player
 * @param {string} changedBy
 * @returns {void}
 */
function handleTakeover(player, changedBy) {
  console.info('[session] taken over by ' + changedBy + ' -> pausing')
  // Release first: nothing must write back and start a ping-pong.
  releaseSession()
  player.takeoverAt = Date.now()
  // Sets userPaused so visibility/device handlers do not restart playback.
  player.pause()
}

/**
 * One write attempt.
 *
 * @returns {Promise<boolean>}
 */
async function writeQueue() {
  var player = playerStore

  if (!player || !canWrite(player)) {
    return false
  }

  try {
    return await player.api.savePlayQueue(
      player.queue,
      player.track,
      Math.trunc(player.currentTime)
    )
  } catch (error) {
    console.info('[session] write failed', error)
    return false
  }
}

/**
 * A session write needs an online connection, a queue and a current track.
 *
 * @param {Object} player
 * @returns {boolean}
 */
function canWrite(player) {
  return isOnline() &&
    !!player.queue &&
    player.queue.length > 0 &&
    !!player.track
}

// ---------------------------------------------------------------------------
// Takeover detection
// ---------------------------------------------------------------------------

/**
 * Chain setTimeout calls so ticks can never overlap.
 *
 * @returns {void}
 */
function schedulePoll() {
  clearTimeout(pollTimer)

  pollTimer = setTimeout(async function() {
    if (!playerStore) {
      return
    }

    try {
      if (ownsQueue && playerStore.isPlaying && playerStore.singleSession && isOnline()) {
        await ensureOwnership(playerStore)
      }
    } catch (error) {
      // Offline or transient error: retry on the next tick.
    }

    if (ownsQueue && playerStore.singleSession) {
      schedulePoll()
    }
  }, POLL_MS)
}

// ---------------------------------------------------------------------------
// 2. Playback reporting (OpenSubsonic)
// ---------------------------------------------------------------------------
//
// The server tracks one session per track: starting/playing -> paused ->
// stopped. It counts the play when the session is closed with `stopped` past
// the half-way point. Older servers do not advertise the extension; in that
// case setupPlayerLifecycle falls back to the legacy one-shot scrobble at 50 %.

/**
 * @param {Object} playerStore
 * @returns {Object} Reporter bound to that store.
 */
function createPlaybackReporter(playerStore) {
  var REPORT_INTERVAL_MS = 60000

  var enabled = playerStore.api.supportsPlaybackReport()
  var reportedTrackId = null
  var reportedDurationMs = 0
  var lastPositionMs = 0
  var heartbeatTimer = undefined

  /**
   * @param {'starting'|'playing'|'paused'|'stopped'} state
   * @param {number} positionMs
   * @param {Object} [options]
   * @returns {Promise<void>}
   */
  function send(state, positionMs, options) {
    if (!reportedTrackId) {
      return Promise.resolve()
    }

    return playerStore.api.reportPlayback(reportedTrackId, positionMs, state, options)
      .catch(function(error) {
        console.warn('[Playback] report failed (' + state + ')', error)
      })
  }

  /**
   * Close the current session. `stopped` is what makes the server count the
   * play, so refresh server-side stats when the position qualifies.
   *
   * @param {number} positionMs
   * @param {Object} [options]
   * @returns {void}
   */
  function end(positionMs, options) {
    if (!reportedTrackId) {
      return
    }

    send('stopped', positionMs, options)

    if (positionMs >= Math.min(reportedDurationMs / 2, 240000)) {
      playerStore.scrobbleCount += 1
    }

    reportedTrackId = null
    reportedDurationMs = 0

    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
  }

  /**
   * Start the session for the current track, or resume it when it is already
   * the reported one.
   *
   * @returns {void}
   */
  function start() {
    var track = playerStore.track

    if (!track) {
      return
    }

    if (reportedTrackId === track.id) {
      send('playing', lastPositionMs)
      return
    }

    // Close the previous track first: a skip never reaches `onended`.
    end(lastPositionMs)

    reportedTrackId = track.id
    reportedDurationMs = (track.duration || 0) * 1000
    lastPositionMs = 0

    send('starting', 0).then(function() {
      if (reportedTrackId === track.id) {
        send('playing', 0)
      }
    })

    heartbeatTimer = window.setInterval(function() {
      if (playerStore.isPlaying) {
        send('playing', lastPositionMs)
      }
    }, REPORT_INTERVAL_MS)
  }

  return {
    enabled: enabled,

    /** Playback started or resumed. */
    play: function() {
      if (enabled) {
        start()
      }
    },

    /** Playback paused. */
    pause: function() {
      if (enabled) {
        send('paused', lastPositionMs)
      }
    },

    /** The track reached its natural end. */
    ended: function() {
      if (enabled) {
        end(reportedDurationMs || lastPositionMs)
      }
    },

    /** Keep the last known position up to date. */
    setPosition: function(seconds) {
      if (enabled) {
        lastPositionMs = Math.round(seconds * 1000)
      }
    },

    /** The user seeked. */
    seeked: function(seconds) {
      if (!enabled) {
        return
      }

      lastPositionMs = Math.round(seconds * 1000)
      send(playerStore.isPlaying ? 'playing' : 'paused', lastPositionMs)
    },

    /** Refresh the server after the WebView resumes. */
    resume: function() {
      if (enabled && playerStore.isPlaying) {
        send('playing', lastPositionMs)
      }
    },

    /** Last chance to report before the page goes away. */
    close: function() {
      if (enabled) {
        end(lastPositionMs, { keepalive: true })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Web playback
// ---------------------------------------------------------------------------

/**
 * Browser MediaSession action handlers (lock screen, media keys, headset
 * buttons). Android uses the native MediaSession plugin instead, wired in
 * the native section below.
 *
 * @param {Object} store
 * @returns {void}
 */
function setupWebMediaSession(store) {
  var mediaSession = navigator.mediaSession

  if (!mediaSession) {
    return
  }

  mediaSession.setActionHandler('play', function() {
    store.play()
  })

  mediaSession.setActionHandler('pause', function() {
    store.pause()
  })

  mediaSession.setActionHandler('nexttrack', function() {
    store.next(true)
  })

  mediaSession.setActionHandler('previoustrack', function() {
    store.back()
  })

  mediaSession.setActionHandler('stop', function() {
    store.pause()
  })

  mediaSession.setActionHandler('seekto', function(details) {
    if (details.fastSeek || details.seekTime === undefined) {
      return
    }

    store.seek(Math.min(details.seekTime, store.duration))
  })

  mediaSession.setActionHandler('seekforward', function(details) {
    var offset = details.seekOffset || 10
    store.seek(Math.min(store.currentTime + offset, store.duration))
  })

  mediaSession.setActionHandler('seekbackward', function(details) {
    var offset = details.seekOffset || 10
    store.seek(Math.max(store.currentTime - offset, 0))
  })
}

/**
 * Wire the browser-only playback behaviours.
 *
 * @param {Object} playerStore
 * @param {Function} getLastPlayTime - Timestamp (ms) of the last `play` event.
 * @returns {Promise<void>}
 */
async function setupWebPlayback(playerStore, getLastPlayTime) {
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
  setupWebMediaSession(playerStore)
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

  function isStale(token) {
    return token !== deviceChangeToken || playerStore.userPaused
  }

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

    if (isStale(token)) {
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

    if (isStale(token)) {
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
// 4. Native playback
// ---------------------------------------------------------------------------

/**
 * @param {Object} playerStore
 * @param {Object} reporter - Playback reporter created by this module.
 * @returns {void}
 */
function setupNativePlayback(playerStore, reporter) {
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

  function seekTo(position) {
    playerStore.seek(Math.min(Math.max(position, 0), playerStore.duration))
  }

  function seekBy(offset) {
    var position = playerStore.currentTime + offset
    playerStore.seek(Math.min(Math.max(position, 0), playerStore.duration))
  }

  nativeMediaSession.addListener('seek', function(data) {
    seekTo(Number(data && data.position) || 0)
  })

  nativeMediaSession.addListener('seekto', function(data) {
    seekTo(Number(data && data.position) || 0)
  })

  nativeMediaSession.addListener('seekforward', function(data) {
    seekBy(Number(data && data.offset) || 10)
  })

  nativeMediaSession.addListener('seekbackward', function(data) {
    seekBy(-(Number(data && data.offset) || 10))
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
