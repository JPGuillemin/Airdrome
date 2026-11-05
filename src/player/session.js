// player/session.js
//
// "Single playback session": only one device plays at a time.
// The server queue remembers the last writer (`changedBy`); the device that
// wrote last owns the session.
//
// The model is intentionally small:
//   - ownsQueue = true  -> we wrote the server queue and may keep writing.
//   - ownsQueue = false -> we must check `changedBy` before writing.
//
// Starting playback claims the session by writing the queue. Pausing saves
// the position and releases the session. While playing, a poll detects when
// another device takes over.

import { sleep } from '@/shared/utils'
import { usePlayerStore } from './store'

var POLL_MS = 5000

// The first request after a resume can fail (background WebView, stale connection).
var CLAIM_BACKOFF_MS = [0, 400, 1200, 2500, 5000]

var ownsQueue = false
var pollTimer = undefined
var claimPromise = null

/**
 * True when this device owns the server queue.
 *
 * @returns {boolean}
 */
export function ownsSession() {
  return ownsQueue
}

// ---------------------------------------------------------------------------
// Lifecycle (called from audio events)
// ---------------------------------------------------------------------------

/**
 * Playback started: write the queue so the server names this device.
 *
 * @returns {Promise<void>}
 */
export async function claimSession() {
  if (ownsQueue) {
    return
  }

  if (claimPromise) {
    await claimPromise
    return
  }

  var player = usePlayerStore()

  if (!canWrite(player)) {
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
      ownsQueue = true
      schedulePoll()
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
export async function onPlaybackStopped() {
  if (!ownsQueue) {
    return
  }

  await saveSession()

  // Playback may have resumed while saving.
  if (!usePlayerStore().isPlaying) {
    releaseSession()
  }
}

/**
 * Page closing: only the owner writes.
 *
 * @returns {void}
 */
export function onUnload() {
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
  var settings = options || {}
  var blind = settings.blind === true
  var player = usePlayerStore()

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
    ownsQueue = true

    if (player.isPlaying) {
      schedulePoll()
    }

    return true
  }

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
  console.info('[session] taken over by ' + changedBy)
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
  var player = usePlayerStore()

  if (!canWrite(player)) {
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
  return !!navigator.onLine &&
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
    var player = usePlayerStore()

    try {
      if (ownsQueue && player.isPlaying && navigator.onLine) {
        await ensureOwnership(player)
      }
    } catch (error) {
      // Offline or transient error: retry on the next tick.
    }

    if (ownsQueue) {
      schedulePoll()
    }
  }, POLL_MS)
}
