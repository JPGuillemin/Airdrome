// player/playbackReporting.js
//
// OpenSubsonic `playbackReport` sessions. The server tracks one session per
// track: starting/playing -> paused -> stopped. It counts the play when the
// session is closed with `stopped` past the half-way point.
//
// Older servers do not advertise the extension; in that case the caller falls
// back to the legacy one-shot scrobble at 50 % (see setupAudio.js).

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
