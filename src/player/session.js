// player/session.js
//
// "Single playback session": only one device plays at a time.
// The server queue remembers the last writer (`changedBy`); the device that
// wrote last owns the session.
//
//   idle      -> not playing. Only write when the queue is still ours.
//   claiming  -> playback started; write the queue so the server names us.
//   active    -> write succeeded. Poll the server; yield if another device writes.

import { sleep } from '@/shared/utils'
import { usePlayerStore } from './store'

var POLL_MS = 5000

// The first request after a resume can fail (background WebView, stale connection).
var CLAIM_BACKOFF_MS = [0, 400, 1200, 2500, 5000]

var state = 'idle'
var pollTimer = undefined

/**
 * True when this device is (or is becoming) the active device.
 *
 * @returns {boolean}
 */
export function ownsSession() {
  return state !== 'idle'
}

// ---------------------------------------------------------------------------
// Lifecycle (called from audio events)
// ---------------------------------------------------------------------------

/**
 * Playback started: write the queue first, then start polling.
 *
 * @returns {Promise<void>}
 */
export async function claimSession() {
  if (state !== 'idle') {
    return
  }

  state = 'claiming'

  var player = usePlayerStore()

  // Nothing to write: the first save will claim the session.
  if (!navigator.onLine || !player.queue || !player.queue.length || !player.track) {
    return
  }

  await tryClaim(0)
}

/**
 * Try one claim attempt, then move to the next backoff delay.
 *
 * @param {number} index
 * @returns {Promise<void>}
 */
async function tryClaim(index) {
  if (index >= CLAIM_BACKOFF_MS.length) {
    console.info('[session] claim failed after retries; will retry on next save')
    return
  }

  var delay = CLAIM_BACKOFF_MS[index]

  if (delay) {
    await sleep(delay)
  }

  if (state !== 'claiming') {
    return
  }

  var written = await writeQueue()

  if (written) {
    return
  }

  await tryClaim(index + 1)
}

/**
 * Playback stopped: save the final position, then release.
 *
 * @returns {Promise<void>}
 */
export async function onPlaybackStopped() {
  if (state === 'idle') {
    return
  }

  await saveSession()

  // Playback may have resumed while saving.
  if (!usePlayerStore().isPlaying) {
    releaseSession()
  }
}

/**
 * Page closing: only the active device writes.
 *
 * @returns {void}
 */
export function onUnload() {
  if (state !== 'idle') {
    saveSession({ blind: true })
  }
}

/**
 * Give up the session without writing to the server.
 *
 * @returns {void}
 */
export function releaseSession() {
  state = 'idle'
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
  var settings = options || {}
  var blind = settings.blind === true

  try {
    if (blind) {
      await writeQueue()
      return
    }

    var allowed = await mayWrite()

    if (!allowed) {
      return
    }

    await writeQueue()
  } catch (error) {
    console.info('[session] save aborted:', error)
  }
}

/**
 * Return true when this device may write the queue.
 *
 * @returns {Promise<boolean>}
 */
async function mayWrite() {
  var api = usePlayerStore().api

  if (state === 'idle') {
    // Idle device: only write when the server queue is still ours.
    var queue = await api.getPlayQueue()
    return api.isOwnQueueWriter(queue.changedBy)
  }

  if (state === 'claiming') {
    // Claim not confirmed yet (for example a network error on resume).
    // The server may still name the old device: this is not a takeover.
    await writeQueue()
    return false
  }

  if (state === 'active') {
    var lost = await lostSession()
    return !lost
  }

  return false
}

/**
 * One write attempt.
 *
 * @returns {Promise<boolean>}
 */
async function writeQueue() {
  var player = usePlayerStore()

  if (!navigator.onLine || !player.queue || !player.queue.length || !player.track) {
    return false
  }

  try {
    var saved = await player.api.savePlayQueue(
      player.queue,
      player.track,
      Math.trunc(player.currentTime)
    )

    if (!saved) {
      return false
    }

    if (state === 'claiming') {
      state = 'active'
      schedulePoll()
    }

    return true
  } catch (error) {
    console.info('[session] write failed', error)
    return false
  }
}

// ---------------------------------------------------------------------------
// Takeover detection
// ---------------------------------------------------------------------------

/**
 * Return true when we must not write because another device took over.
 *
 * @returns {Promise<boolean>}
 */
async function lostSession() {
  var player = usePlayerStore()
  var queue = await player.api.getPlayQueue()

  if (state !== 'active') {
    return true
  }

  if (player.api.isOwnQueueWriter(queue.changedBy)) {
    return false
  }

  console.info('[session] taken over by ' + queue.changedBy)
  // Release first: nothing must write back and start a ping-pong.
  releaseSession()
  player.takeoverAt = Date.now()
  // Sets userPaused so visibility/device handlers do not restart playback.
  player.pause()
  return true
}

/**
 * Chain setTimeout calls so ticks can never overlap.
 *
 * @returns {void}
 */
function schedulePoll() {
  clearTimeout(pollTimer)

  pollTimer = setTimeout(async function() {
    try {
      if (usePlayerStore().isPlaying && navigator.onLine) {
        await lostSession()
      }
    } catch (error) {
      // Offline or transient error: retry on the next tick.
    }

    if (state === 'active') {
      schedulePoll()
    }
  }, POLL_MS)
}
