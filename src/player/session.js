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
import { isOnline } from '@/shared/network'
import { usePlayerStore } from './store'

var POLL_MS = 5000

// A queue written by another client a long time ago is stale; do not pause
// playback because of it. Only a recent foreign write means a real takeover.
var TAKEOVER_STALE_MS = 10 * 60 * 1000

// The first request after a resume can fail (background WebView, stale connection).
var CLAIM_BACKOFF_MS = [0, 400, 1200, 2500, 5000]

var ownsQueue = false
var pollTimer = undefined
var claimPromise = null

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
      markOwner(usePlayerStore())
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

  var changedAt = parseQueueChanged(queue.changed)

  if (changedAt > 0 && Date.now() - changedAt > TAKEOVER_STALE_MS) {
    // The server still names an older client, but its write is stale. Claim
    // the queue again instead of pausing on an old session.
    console.info('[session] ignoring stale queue from ' + queue.changedBy)
    markOwner(player, true)
    await writeQueue()
    return true
  }

  console.info('[session] foreign queue write by ' + queue.changedBy +
    (changedAt ? ' at ' + new Date(changedAt).toISOString() : ''))

  handleTakeover(player, queue.changedBy)
  return false
}

/**
 * Parse the server-side queue `changed` timestamp.
 *
 * @param {string|number|undefined} value
 * @returns {number} Milliseconds, or 0 when unavailable.
 */
function parseQueueChanged(value) {
  if (value == null || value === '') {
    return 0
  }

  if (typeof value === 'number') {
    return isFinite(value) ? value : 0
  }

  if (/^\d+$/.test(value)) {
    var numeric = Number(value)
    return numeric < 1e12 ? numeric * 1000 : numeric
  }

  var parsed = Date.parse(value)
  return isFinite(parsed) ? parsed : 0
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
    var player = usePlayerStore()

    try {
      if (ownsQueue && player.isPlaying && player.singleSession && isOnline()) {
        await ensureOwnership(player)
      }
    } catch (error) {
      // Offline or transient error: retry on the next tick.
    }

    if (ownsQueue && player.singleSession) {
      schedulePoll()
    }
  }, POLL_MS)
}

// ---------------------------------------------------------------------------
// Playback reporting (OpenSubsonic)
// ---------------------------------------------------------------------------
//
// The server tracks one session per track: starting/playing -> paused ->
// stopped. It counts the play when the session is closed with `stopped` past
// the half-way point. Older servers do not advertise the extension; in that
// case setupAudio falls back to the legacy one-shot scrobble at 50 %.

/**
 * @param {Object} playerStore
 * @returns {Object} Reporter bound to that store.
 */
export function createPlaybackReporter(playerStore) {
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
