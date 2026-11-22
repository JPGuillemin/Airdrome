// keepAlive.js
//
// Holds a Web Lock while playback is active or expected to resume.
//
// Chromium's page freezing policy explicitly excludes tabs that hold at least
// one Web Lock. Keeping one for the whole listening session prevents the page
// from being frozen during a phone call (hidden + silent for several minutes),
// so audio-focus gain and MediaSession actions can still be handled when the
// call ends.

// Unique per page: every tab can hold its own lock without waiting for
// another Airdrome tab. The freeze policy only checks that a lock is held.
var LOCK_NAME = 'airdrome-playback-' + Date.now() + '-' +
  Math.random().toString(36).slice(2)

/** True while this page wants to stay out of the freeze set. */
var wanted = false

/** In-flight navigator.locks.request() promise, if any. */
var request = null

/** Resolver for the pending lock callback. */
var releaseLock = null

/** Bumped on every acquire/release so stale callbacks can be ignored. */
var generation = 0

/**
 * Start one lock request for the current generation.
 *
 * @returns {void}
 */
function startRequest() {
  var token = generation + 1
  generation = token

  console.info('[keepalive] requested')

  request = navigator.locks.request(
    LOCK_NAME,
    { mode: 'exclusive' },
    function() {
      // A newer acquire/release superseded this request.
      if (token !== generation || !wanted) {
        return Promise.resolve()
      }

      console.info('[keepalive] held')

      return new Promise(function(resolve) {
        releaseLock = resolve
      })
    }
  ).then(function() {
    console.info('[keepalive] released')
  }).catch(function(error) {
    if (token === generation) {
      // Do not keep "wanted" stuck when the request itself failed; the next
      // play/playing event will try again.
      wanted = false
    }

    console.info('[keepalive] request failed', error)
  }).finally(function() {
    if (token !== generation) {
      return
    }

    request = null
    releaseLock = null

    if (wanted) {
      startRequest()
    }
  })
}

/**
 * Ask the browser to keep this page out of the freeze set.
 *
 * @returns {void}
 */
export function acquireKeepAlive() {
  if (wanted) {
    return
  }

  wanted = true

  if (!navigator.locks || !navigator.locks.request) {
    console.info('[keepalive] Web Locks unavailable')
    return
  }

  // A request is already in flight. Its callback will see wanted === true and
  // keep the lock instead of releasing it immediately.
  if (request) {
    return
  }

  startRequest()
}

/**
 * Stop holding the freeze lock.
 *
 * @returns {void}
 */
export function releaseKeepAlive() {
  wanted = false
  generation += 1
  request = null

  if (releaseLock) {
    var resolve = releaseLock
    releaseLock = null
    resolve()
  }
}
