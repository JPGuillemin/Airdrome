// player/setupAudio.js
//
// Wires the AudioController, MediaSession, device watcher, keyboard shortcuts
// and page lifecycle events to the player store.

import { watch } from 'vue'
import { throttle } from 'lodash-es'
import { sleep } from '@/shared/utils'
import { audio, storedReplayGainMode } from './audio'
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

  // -------------------------------------------------------------------------
  // Playback event handlers
  // -------------------------------------------------------------------------

  var playTime = 0
  var pauseTime = 0

  playerStore.setMediaSessionState('none')

  audio.onplay = function() {
    playerStore.isPlaying = true
    playerStore.userPaused = false
    claimSession()
    playTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('playing')
  }

  audio.onpause = function() {
    playerStore.isPlaying = false
    onPlaybackStopped()
    pauseTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('paused')
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
    if (playerStore.hasNext || playerStore.repeat) {
      return playerStore.next(false)
    }

    return playerStore.processQueueEnd()
  }

  audio.onerror = function(error) {
    console.warn('[Audio] Fatal error', error)

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
    if (playerStore.isPlaying) {
      return
    }

    if (document.visibilityState === 'visible' && !playerStore.userPaused) {
      playerStore.play()
    }
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

  async function scrobbleTrack(trackId) {
    try {
      await playerStore.api.scrobble(trackId)
    } catch (error) {
      console.warn('[Scrobble] failed', error)
    }
  }

  audio.ontimeupdate = function(time) {
    if (playerStore.inTransition) {
      return
    }

    playerStore.currentTime = time

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

    if (!playerStore.scrobbled && progress > 0.5 && track && isPlaying) {
      playerStore.scrobbled = true
      scrobbleTrack(track.id)
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
