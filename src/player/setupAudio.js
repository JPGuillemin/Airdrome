// player/setupAudio.js
//
// Wires the AudioController, MediaSession, device watcher, keyboard shortcuts
// and page lifecycle events to the player store.

import { watch } from 'vue'
import { throttle } from 'lodash-es'
import { sleep } from '@/shared/utils'
import { audio, storedReplayGainMode } from './audio'
import { claimSession, onPlaybackStopped, onUnload } from './session'
import { acquireKeepAlive, releaseKeepAlive } from './keepAlive'

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

  // -------------------------------------------------------------------------
  // Resume intent and freeze keep-alive
  //
  // A phone call pauses the media element. On a hidden page Chromium freezes
  // the tab after a few minutes, so the audio-focus gain is never handled and
  // playback stays paused until the page becomes visible again. Holding a Web
  // Lock is an explicit "cannot freeze" reason in Chromium's page freezing
  // policy, which keeps the page able to resume when the call ends.
  // -------------------------------------------------------------------------

  var RESUME_MAX_MS = 2 * 60 * 60 * 1000

  var resumeDeadlineTimer = undefined
  var resumeInFlight = false

  var stalled = false
  var lastPosition = 0
  var lastProgressAt = 0
  var verificationCount = 0
  var playVerifyTimer = undefined
  var stallWatchTimer = undefined

  var PLAY_VERIFY_MS = 3000
  var STALL_CHECK_MS = 2000
  var STALL_TIMEOUT_MS = 10000

  /**
   * Stop the deadline that releases the freeze lock.
   *
   * @returns {void}
   */
  function stopResumeDeadline() {
    if (resumeDeadlineTimer) {
      window.clearTimeout(resumeDeadlineTimer)
      resumeDeadlineTimer = undefined
    }
  }

  /**
   * Release the freeze lock if a system pause never resolves.
   *
   * This is deliberately not a retry loop: calling play() while a phone call
   * is still active can start music over the call. Resume is left to the
   * browser's own audio-focus handling, which knows when focus comes back.
   *
   * @returns {void}
   */
  function startResumeDeadline() {
    stopResumeDeadline()

    resumeDeadlineTimer = window.setTimeout(function() {
      resumeDeadlineTimer = undefined

      if (!playerStore.resumePending || playerStore.isPlaying) {
        return
      }

      console.info('[resume] giving up after timeout')
      playerStore.cancelResume()
    }, RESUME_MAX_MS)
  }

  /**
   * Reset progress tracking after a real start or pause.
   *
   * @returns {void}
   */
  function resetProgressTracking() {
    var element = audio.getAudioElement()

    stalled = false
    lastPosition = element.currentTime
    lastProgressAt = Date.now()
  }

  /**
   * Stop the one-shot verification scheduled after a play event.
   *
   * @returns {void}
   */
  function stopPlayVerification() {
    if (playVerifyTimer) {
      window.clearTimeout(playVerifyTimer)
      playVerifyTimer = undefined
    }
  }

  /**
   * Mark playback as stalled and show the paused state.
   *
   * @returns {void}
   */
  function markStalled() {
    if (stalled && !playerStore.isPlaying) {
      return
    }

    stalled = true
    playerStore.isPlaying = false
    playerStore.resumePending = true
    playerStore.devicePaused = false
    acquireKeepAlive()
    startResumeDeadline()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('paused')
    onPlaybackStopped()
    console.info('[resume] playback stalled')
  }

  /**
   * The browser said "playing" but the position did not move. Try one real
   * pause/play restart. This is triggered by the browser's own play event,
   * not by a timer while a call may still be active.
   *
   * @returns {void}
   */
  function schedulePlayVerification() {
    if (verificationCount >= 1) {
      return
    }

    stopPlayVerification()
    verificationCount += 1
    var startPosition = audio.getAudioElement().currentTime

    playVerifyTimer = window.setTimeout(function() {
      playVerifyTimer = undefined

      if (playerStore.userPaused || playerStore.inTransition) {
        return
      }

      // markStalled() already took care of the UI. Only verify a state where
      // the browser still claims to be playing.
      if (!playerStore.isPlaying) {
        return
      }

      if (audio.getAudioContext().state !== 'running') {
        console.info('[resume] context suspended during verification')
        markStalled()
        return
      }

      var element = audio.getAudioElement()

      if (element.ended || element.readyState < 3 ||
        Math.abs(element.currentTime - startPosition) > 0.1) {
        return
      }

      console.info('[resume] play verification failed')
      stalled = true
      tryResume('play-verify')
    }, PLAY_VERIFY_MS)
  }

  /**
   * Resume playback after a system pause, if the user still wants it.
   *
   * Called from foreground wake-ups, a verified stalled state, or when the
   * AudioContext itself returns to running (a safe audio-focus signal).
   *
   * @param {string} reason
   * @returns {Promise<void>}
   */
  async function tryResume(reason) {
    if (resumeInFlight || playerStore.userPaused || playerStore.inTransition) {
      return
    }

    if (playerStore.isPlaying && !stalled) {
      return
    }

    resumeInFlight = true

    try {
      var element = audio.getAudioElement()

      // "Playing" but not advancing: a plain play() is a no-op. Force a real
      // restart of the media element.
      if (!element.paused && stalled) {
        console.info('[resume] restarting stalled element')
        element.pause()
        await sleep(100)
      }

      // The pause above may have triggered a session takeover.
      if (playerStore.userPaused || playerStore.inTransition) {
        return
      }

      console.info('[resume] attempt:', reason)
      var start = audio.getAudioElement().currentTime
      await playerStore.play()
      await sleep(1000)

      var current = audio.getAudioElement()

      if (current.ended) {
        return
      }

      if (current.readyState < 3) {
        console.info('[resume] still loading:', reason)
        return
      }

      if (audio.getAudioContext().state !== 'running') {
        console.info('[resume] context still suspended:', reason)
        markStalled()
        return
      }

      if (current.paused || Math.abs(current.currentTime - start) < 0.05) {
        console.info('[resume] still stalled:', reason)
        markStalled()
        return
      }

      stalled = false
      lastPosition = current.currentTime
      lastProgressAt = Date.now()
      console.info('[resume] ok:', reason)
    } catch (error) {
      console.info('[resume] failed:', reason, error && error.name)
    } finally {
      resumeInFlight = false
    }
  }

  /**
   * Watch the media element position directly, so background timeupdate
   * throttling cannot hide a real stall.
   *
   * @returns {void}
   */
  function startStallWatch() {
    if (stallWatchTimer) {
      return
    }

    resetProgressTracking()

    stallWatchTimer = window.setInterval(function() {
      if (!playerStore.isPlaying || playerStore.userPaused || playerStore.inTransition) {
        return
      }

      var element = audio.getAudioElement()
      var position = element.currentTime

      if (Math.abs(position - lastPosition) > 0.1) {
        lastPosition = position
        lastProgressAt = Date.now()
        stalled = false
        verificationCount = 0
        return
      }

      if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
        markStalled()
      }
    }, STALL_CHECK_MS)
  }

  /**
   * Resume the Web Audio context after the element started playing.
   *
   * @returns {void}
   */
  function resumeAudioContext() {
    var context = audio.getAudioContext()

    if (context.state !== 'running') {
      context.resume().catch(function(error) {
        console.info('[ctx] resume failed', error)
      })
    }
  }

  /**
   * Foreground wake-up: make sure the context is running, then resume.
   *
   * @param {string} reason
   * @returns {void}
   */
  function onForeground(reason) {
    resumeAudioContext()

    if (playerStore.userPaused || playerStore.inTransition) {
      return
    }

    var element = audio.getAudioElement()

    if (playerStore.isPlaying && element.paused) {
      stalled = true
      tryResume(reason)
      return
    }

    if (playerStore.isPlaying && !stalled) {
      // The UI says playing. Verify that the position actually advances; a
      // stalled pipeline can still report isPlaying after an interruption.
      verificationCount = 0
      schedulePlayVerification()
      return
    }

    tryResume(reason)
  }

  startStallWatch()

  playerStore.setMediaSessionState('none')

  audio.onplay = function() {
    playerStore.isPlaying = true
    playerStore.userPaused = false
    playerStore.resumePending = false
    playerStore.devicePaused = false
    stopResumeDeadline()
    acquireKeepAlive()
    resumeAudioContext()
    resetProgressTracking()
    schedulePlayVerification()
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
    stopPlayVerification()
    resetProgressTracking()
    verificationCount = 0
    onPlaybackStopped()
    pauseTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('paused')

    if (usePlaybackReport) {
      sendReport('paused', lastPositionMs)
    }

    var element = audio.getAudioElement()

    if (playerStore.userPaused || playerStore.inTransition || element.ended) {
      playerStore.resumePending = false
      playerStore.devicePaused = false
      stopResumeDeadline()
      releaseKeepAlive()
      return
    }

    // System pause (phone call, audio-focus loss, output removal): remember
    // that playback should come back and keep the page out of the freeze set.
    playerStore.resumePending = true
    acquireKeepAlive()
    startResumeDeadline()
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
    playerStore.resumePending = false
    playerStore.devicePaused = false
    stopResumeDeadline()
    acquireKeepAlive()
    resumeAudioContext()
    resetProgressTracking()
    schedulePlayVerification()
    playTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('playing')
    playerStore.updateMediaSession()
  }

  audio.onended = function() {
    stopPlayVerification()
    resetProgressTracking()
    verificationCount = 0

    if (usePlaybackReport) {
      endSession(reportedDurationMs || lastPositionMs)
    }

    if (playerStore.hasNext || playerStore.repeat) {
      return playerStore.next(false)
    }

    playerStore.resumePending = false
    playerStore.devicePaused = false
    stopResumeDeadline()
    releaseKeepAlive()

    return playerStore.processQueueEnd()
  }

  audio.onerror = function(error) {
    console.warn('[Audio] Fatal error', error)

    stopPlayVerification()
    resetProgressTracking()
    verificationCount = 0
    playerStore.resumePending = false
    playerStore.devicePaused = false
    stopResumeDeadline()
    releaseKeepAlive()

    var reportedError = error

    if (!(error instanceof Error)) {
      reportedError = new Error('Audio playback error')
    }

    mainStore.setError(reportedError)

    if (playerStore.hasNext) {
      playerStore.next(true)
    } else if (playerStore.hasPrevious) {
      playerStore.back()
    } else {
      playerStore.resetQueue()
    }
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState !== 'visible' || playerStore.userPaused) {
      return
    }

    onForeground('visible')
  })

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

    // A phone call pauses audio and may change the output route. Do not turn
    // that into a resume: the browser's audio-focus manager knows when the
    // call ends. Device interrupts (devicePaused) may still resume.
    if (playerStore.resumePending && !playerStore.devicePaused) {
      console.info('[devices] system pause -> wait for audio focus')
      return
    }

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
  // Device polling fallback
  // -------------------------------------------------------------------------
  // Chrome does not reliably fire `devicechange` for audio-output changes
  // (notably Bluetooth disconnects). Polling while playing covers that gap.

  var devicePollTimer = null

  function checkDevices() {
    if (!knownOutputs) {
      return
    }

    if (document.visibilityState !== 'visible') {
      return
    }

    if (playerStore.userPaused) {
      return
    }

    onDeviceChange()
  }

  function startDevicePoll() {
    if (devicePollTimer) {
      return
    }

    devicePollTimer = setInterval(checkDevices, 2000)
  }

  function stopDevicePoll() {
    if (devicePollTimer) {
      clearInterval(devicePollTimer)
      devicePollTimer = null
    }
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      checkDevices()
    }
  })

  window.addEventListener('focus', checkDevices)
  window.addEventListener('pagehide', stopDevicePoll)

  // -------------------------------------------------------------------------
  // Foreground resume triggers
  //
  // Background resume is left to the browser's audio-focus manager. These
  // events only fire when the user is actually back in the app (or the page
  // is unfrozen), so calling play() here cannot start music over a call.
  // -------------------------------------------------------------------------

  window.addEventListener('focus', function() {
    onForeground('focus')
  })

  window.addEventListener('pageshow', function() {
    onForeground('pageshow')
  })

  document.addEventListener('resume', function() {
    onForeground('page-resume')
  })

  var audioContext = audio.getAudioContext()

  audioContext.addEventListener('statechange', function() {
    // A suspended context returning to running is a real audio-focus signal.
    // It cannot happen while a call still owns the audio output.
    if (audioContext.state !== 'running') {
      return
    }

    var element = audio.getAudioElement()

    if (playerStore.isPlaying && element.paused && !playerStore.userPaused) {
      stalled = true
    }

    if (stalled || playerStore.resumePending) {
      tryResume('context-running')
    }
  })

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

    if (Math.abs(time - lastPosition) > 0.01) {
      lastPosition = time
      lastProgressAt = Date.now()
      stalled = false
      verificationCount = 0

      // The pipeline recovered without a play event (e.g. the browser
      // unfroze it). Bring the UI/media session back in sync.
      if (!playerStore.isPlaying && !playerStore.userPaused &&
        !audio.getAudioElement().paused &&
        audio.getAudioContext().state === 'running') {
        playerStore.isPlaying = true
        playerStore.resumePending = false
        playerStore.devicePaused = false
        stopResumeDeadline()
        acquireKeepAlive()
        claimSession()
        playerStore.setMediaSessionState('playing')

        if (usePlaybackReport) {
          startSession()
        }
      }
    }

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

    if (remaining < 0.15 && playerStore.hasNext) {
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
    if (usePlaybackReport) {
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

  if (mediaSession) {
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
  // Async initialisation
  // -------------------------------------------------------------------------

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

    startDevicePoll()

    try {
      await ensureMicAccess()
    } catch (error) {
      console.warn('[devices] microphone setup failed', error)
    }
  }

  if (playerStore.track) {
    await playerStore.loadTrack({ paused: true })
  }
}
