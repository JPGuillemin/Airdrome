// player/setupAudio.js
//
// Wires the AudioController, MediaSession, device watcher, keyboard shortcuts
// and page lifecycle events to the player store.

import { watch } from 'vue'
import { throttle } from 'lodash-es'
import { App as CapacitorApp } from '@capacitor/app'
import { sleep } from '@/shared/utils'
import { audio, storedReplayGainMode, isAndroid } from './engine'
import { nativeMediaSession } from './nativeMediaSession'
import { claimSession, onPlaybackStopped, onUnload } from './session'

var mediaSession = navigator.mediaSession
var isMobile = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0

// ---------------------------------------------------------------------------
// setupAudio
// ---------------------------------------------------------------------------

/**
 * Wire the AudioController to the store and register MediaSession handlers.
 *
 * @param {Object} playerStore
 * @param {Object} mainStore
 * @returns {Promise<void>}
 */
export async function setupAudio(playerStore, mainStore) {
  function setCodec() {
    var probe = document.createElement('audio')
    var supported = {
      opus: probe.canPlayType('audio/ogg; codecs=opus') ||
        probe.canPlayType('audio/webm; codecs=opus'),
      aac: probe.canPlayType('audio/aac')
    }
    var preference = ['opus', 'aac']
    var codec = 'mp3'

    for (var i = 0; i < preference.length; i++) {
      if (supported[preference[i]]) {
        codec = preference[i]
        break
      }
    }

    console.info('Codec:', codec)
    localStorage.setItem('audioCodec', codec)
  }

  setCodec()

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
      if (playerStore.nextTrack) {
        return playerStore.nextTrack.url
      }

      return undefined
    },
    function(url) {
      audio.setNextUrl(url)
    }
  )

  // Native only: keep ExoPlayer's queue window in sync so it can start the
  // next track by itself while the WebView is frozen.
  if (isAndroid) {
    watch(
      function() {
        return playerStore.windowKey
      },
      function() {
        playerStore.syncWindow()
      },
      { immediate: true }
    )

    // When a track finishes downloading, re-push the window so native uses
    // the local file:// URI instead of the remote stream. The reverse happens
    // when a cache entry is deleted.
    var windowSyncTimer = null

    function syncWindowSoon() {
      if (windowSyncTimer) {
        return
      }

      windowSyncTimer = window.setTimeout(function() {
        windowSyncTimer = null
        playerStore.syncWindow()
      }, 300)
    }

    window.addEventListener('audioCached', syncWindowSoon)
    window.addEventListener('audioCacheDeleted', syncWindowSoon)
    window.addEventListener('audioCacheClearedAll', syncWindowSoon)
  }

  // -------------------------------------------------------------------------
  // Playback event handlers
  // -------------------------------------------------------------------------

  var playTime = 0
  var pauseTime = 0

  // -------------------------------------------------------------------------
  // Playback reporting
  //
  // OpenSubsonic `playbackReport` servers track a session: starting/playing,
  // paused, then stopped. The server counts the play when it receives
  // `stopped` past the half-way point. Older servers fall back to the one-shot
  // scrobble at 50 %.
  // -------------------------------------------------------------------------

  var REPORT_INTERVAL_MS = 60000

  var usePlaybackReport = playerStore.api.supportsPlaybackReport()
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
  function sendReport(state, positionMs, options) {
    if (!reportedTrackId) {
      return Promise.resolve()
    }

    return playerStore.api.reportPlayback(reportedTrackId, positionMs, state, options)
      .catch(function(error) {
        console.warn('[Playback] report failed (' + state + ')', error)
      })
  }

  /**
   * Close the reported session. `stopped` is what makes the server count the
   * play, so refresh server-side stats when the position qualifies.
   *
   * @param {number} positionMs
   * @param {Object} [options]
   * @returns {void}
   */
  function endSession(positionMs, options) {
    if (!reportedTrackId) {
      return
    }

    sendReport('stopped', positionMs, options)

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
  function startSession() {
    var track = playerStore.track

    if (!track) {
      return
    }

    if (reportedTrackId === track.id) {
      sendReport('playing', lastPositionMs)
      return
    }

    // Close the previous track first: a skip never reaches `onended`.
    endSession(lastPositionMs)

    reportedTrackId = track.id
    reportedDurationMs = (track.duration || 0) * 1000
    lastPositionMs = 0

    sendReport('starting', 0).then(function() {
      if (reportedTrackId === track.id) {
        sendReport('playing', 0)
      }
    })

    heartbeatTimer = window.setInterval(function() {
      if (playerStore.isPlaying) {
        sendReport('playing', lastPositionMs)
      }
    }, REPORT_INTERVAL_MS)
  }

  playerStore.setMediaSessionState('none')

  audio.onplay = function() {
    playerStore.isPlaying = true
    playerStore.userPaused = false
    claimSession()
    playTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('playing')

    if (usePlaybackReport) {
      startSession()
    }
  }

  audio.onpause = function() {
    playerStore.isPlaying = false
    onPlaybackStopped()
    pauseTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('paused')

    if (usePlaybackReport) {
      sendReport('paused', lastPositionMs)
    }
  }

  audio.onwaiting = function() {
    playerStore.isPlaying = false
    pauseTime = Date.now()
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
    if (usePlaybackReport) {
      endSession(reportedDurationMs || lastPositionMs)
    }

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

  if (isAndroid) {
    // Native advanced to the next track while JS was asleep (or from the lock
    // screen / headset). Follow it without reloading: ExoPlayer is already
    // playing the new track.
    audio.ontrackchanged = function(index) {
      playerStore.followNative(index)
    }
  }

  // -------------------------------------------------------------------------
  // Visibiity change
  //

  var onVisibilityChange = throttle(async function() {
    if (playerStore.isPlaying) {
      return
    }
    if (document.visibilityState === 'visible' && !playerStore.userPaused) {
      playerStore.play()
    }
  }, 500, { leading: false, trailing: true })


  // -------------------------------------------------------------------------
  // Web-only device handling
  // -------------------------------------------------------------------------

  /**
   * Bluetooth / headset routing and the devicechange polling fallback.
   * Native Android uses the MediaSession plugin for this instead.
   *
   * @returns {Promise<void>}
   */
  async function setupWebDevices() {
  // -------------------------------------------------------------------------
  // Output devices (Bluetooth, headphones...)
  // -------------------------------------------------------------------------

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
      if (!isMobile) {
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

    if (removed && Date.now() - playTime > 1000) {
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
  // Event poling
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

      var ids = await getDeviceIds()
      knownOutputs = ids
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
      var ids = await getDeviceIds()
      knownOutputs = ids
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

  if (!isMobile) {
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

  var deviceIds = null

  try {
    deviceIds = await getDeviceIds()
  } catch (error) {
    console.warn('[devices] initialization failed', error)
  }

  if (deviceIds) {
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
  }

  if (!isAndroid) {
    document.addEventListener('visibilitychange', onVisibilityChange)
    await setupWebDevices()
  }

  var saveTime = 0

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

  audio.ontimeupdate = function(time) {
    if (playerStore.inTransition) {
      return
    }

    playerStore.currentTime = time

    if (usePlaybackReport) {
      lastPositionMs = Math.round(time * 1000)
    }

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

    var progress = 0

    if (duration) {
      progress = time / duration
    }

    // Legacy servers only accept a one-shot scrobble call.
    if (
      !usePlaybackReport &&
      !playerStore.scrobbled &&
      progress > 0.5 &&
      track &&
      isPlaying
    ) {
      scrobbleTrack(track.id)
    }
  }

  audio.onseeked = function(time) {
    if (usePlaybackReport) {
      lastPositionMs = Math.round(time * 1000)
      sendReport(playerStore.isPlaying ? 'playing' : 'paused', lastPositionMs)
    }
  }

  audio.ondurationchange = function(duration) {
    playerStore.duration = duration
    playerStore.setMediaSessionPosition()
  }

  // -------------------------------------------------------------------------
  // Native state re-sync
  // -------------------------------------------------------------------------

  /**
   * Pull the native player state back into the store after the WebView was
   * suspended. ExoPlayer may have advanced to another track in the meantime.
   *
   * @returns {Promise<void>}
   */
  async function syncFromNative() {
    if (!isAndroid || typeof audio.getStatus !== 'function') {
      return
    }

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

      if (status.duration > 0) {
        playerStore.duration = status.duration
      }

      playerStore.isPlaying = !!status.playing

      if (status.playing) {
        playerStore.userPaused = false
      }

      playerStore.setMediaSessionPosition()
      playerStore.setMediaSessionState(status.playing ? 'playing' : 'paused')
      playerStore.updateMediaSession()
    } catch (error) {
      console.warn('[Native] state sync failed', error)
    }
  }

  /**
   * Persist queue position / playback report before the WebView is frozen.
   *
   * @returns {Promise<void>}
   */
  async function flushBackgroundState() {
    try {
      await playerStore.saveQueue()

      if (usePlaybackReport && playerStore.isPlaying) {
        await sendReport('playing', lastPositionMs)
      }
    } catch (error) {
      console.warn('[Native] background save failed', error)
    }
  }

  if (isAndroid) {
    CapacitorApp.addListener('appStateChange', async function(state) {
      if (state.isActive) {
        await syncFromNative()

        if (usePlaybackReport && playerStore.isPlaying) {
          sendReport('playing', lastPositionMs)
        }

        return
      }

      // Run immediately: the WebView may be frozen right after this callback.
      await flushBackgroundState()
    }).catch(function(error) {
      console.warn('[Native] app state listener failed', error)
    })
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
    if (!isAndroid && usePlaybackReport) {
      endSession(lastPositionMs, { keepalive: true })
    }
  })

  // -------------------------------------------------------------------------
  // Initialise audio controller with persisted settings
  // -------------------------------------------------------------------------

  audio.setReplayGainMode(storedReplayGainMode)
  audio.setVolume(playerStore.volume)

  // -------------------------------------------------------------------------
  // MediaSession action handlers
  // -------------------------------------------------------------------------

  if (mediaSession && !isAndroid) {
    mediaSession.setActionHandler('play', function() {
      playerStore.play()
    })
    mediaSession.setActionHandler('pause', function() {
      playerStore.pause()
    })
    mediaSession.setActionHandler('nexttrack', function() {
      playerStore.next(true)
    })
    mediaSession.setActionHandler('previoustrack', function() {
      playerStore.back()
    })
    mediaSession.setActionHandler('stop', function() {
      playerStore.pause()
    })
    mediaSession.setActionHandler('seekto', function(details) {
      if (details.fastSeek || details.seekTime === undefined) {
        return
      }

      var position = Math.min(details.seekTime, playerStore.duration)
      playerStore.seek(position)
    })
    mediaSession.setActionHandler('seekforward', function(details) {
      var offset = details.seekOffset || 10
      var position = Math.min(playerStore.currentTime + offset, playerStore.duration)
      playerStore.seek(position)
    })
    mediaSession.setActionHandler('seekbackward', function(details) {
      var offset = details.seekOffset || 10
      var position = Math.max(playerStore.currentTime - offset, 0)
      playerStore.seek(position)
    })
  }

  // -------------------------------------------------------------------------
  // Native Android MediaSession action events (custom Capacitor plugin)
  // -------------------------------------------------------------------------

  if (isAndroid) {
    nativeMediaSession.addListener('play', function() {
      playerStore.play()
    })
    nativeMediaSession.addListener('pause', function() {
      playerStore.pause()
    })
    nativeMediaSession.addListener('next', function() {
      playerStore.next(true)
    })
    nativeMediaSession.addListener('previous', function() {
      playerStore.back()
    })
    nativeMediaSession.addListener('stop', function() {
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
  }

  // -------------------------------------------------------------------------
  // Initialise the current track (paused) after restoring the queue
  // -------------------------------------------------------------------------

  if (playerStore.track) {
    await playerStore.loadTrack({ paused: true })
  }
}
