// player/webPlayback.js
//
// Browser/PWA playback integration. Nothing in this file runs on Android:
// routing, Bluetooth handling, microphone permission and keyboard shortcuts
// are all Web-platform concerns. The native engine handles the same problems
// inside the Android service (see nativePlayback.js).

import { throttle } from 'lodash-es'
import { sleep } from '@/shared/utils'
import { isTouchDevice } from '@/shared/platform'

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
