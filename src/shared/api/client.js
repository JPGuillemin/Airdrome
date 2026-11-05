// shared/api/client.js
//
// Core of the Subsonic API client: instance construction, the fetch wrapper,
// connectivity helpers and the error types. Written in an explicit,
// ES5-friendly style: constructor functions, prototype methods, function
// expressions and async/await instead of promise chains.

import { inject } from 'vue'
import { toQueryString } from '@/shared/utils'

var apiSymbol = Symbol('')

/**
 * Return the API instance provided by createApi().
 *
 * @returns {API}
 */
export function useApi() {
  return inject(apiSymbol)
}

/**
 * Create the API client and attach the Vue plugin install hook.
 *
 * @param {Object} auth
 * @returns {API}
 */
export function createApi(auth) {
  var instance = new API(auth)

  return Object.assign(instance, {
    install: function(app) {
      app.config.globalProperties.$api = instance
      app.provide(apiSymbol, instance)
    }
  })
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a request was skipped because the browser is offline.
 *
 * @constructor
 * @extends Error
 */
export function OfflineError() {
  this.name = 'OfflineError'
  this.message = 'Offline'

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, OfflineError)
  }
}

OfflineError.prototype = Object.create(Error.prototype)
OfflineError.prototype.constructor = OfflineError

/**
 * Thrown when the server does not implement the requested operation.
 *
 * @constructor
 * @extends Error
 * @param {string} [message]
 */
export function UnsupportedOperationError(message) {
  if (message !== undefined) {
    this.message = message
  }

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, UnsupportedOperationError)
  }
}

UnsupportedOperationError.prototype = Object.create(Error.prototype)
UnsupportedOperationError.prototype.constructor = UnsupportedOperationError

/**
 * Thrown when Subsonic answers with a non-ok status.
 *
 * @constructor
 * @extends Error
 * @param {string} message
 * @param {string|null} code
 */
export function SubsonicError(message, code) {
  this.name = 'SubsonicError'
  this.message = message
  this.code = code

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, SubsonicError)
  }
}

SubsonicError.prototype = Object.create(Error.prototype)
SubsonicError.prototype.constructor = SubsonicError

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Create the API client.
 *
 * @constructor
 * @param {Object} auth
 */
export function API(auth) {
  var self = this

  this.auth = auth
  this.clientName = 'Airdrome'

  /**
   * Stable per-install ID, used to tell devices apart in getPlayQueue().changedBy.
   *
   * @type {string}
   */
  this.deviceId = (function() {
    var key = 'airdrome.deviceId'
    var id = localStorage.getItem(key)

    if (!id) {
      var generated = undefined

      if (crypto.randomUUID) {
        generated = crypto.randomUUID().slice(0, 8)
      }

      if (generated == null) {
        generated = Math.random().toString(36).slice(2, 10)
      }

      id = generated
      localStorage.setItem(key, id)
    }

    return id
  })()

  // Simple in-memory cache for the full artist list. It's fetched by
  // getArtists() (artist library page) and reused by getArtistsByGenre()
  // (genre pages) so genre browsing doesn't re-fetch the whole library
  // on every request. TTL keeps it from going stale for too long; call
  // clearArtistsCache() after actions that could change it sooner
  // (e.g. a library rescan, or an artist being favourited).

  /**
   * @type {{data: Artist[], expiresAt: number}|null}
   */
  this.artistsCache = null

  /** @type {number} */
  this.artistsCacheTtlMs = 5 * 60 * 1000 // 5 minutes

  /**
   * @param {string} path
   * @param {Object} [params]
   * @returns {Promise<Object>}
   */
  this.fetch = async function(path, params) {
    params = Object.assign(
      { v: '1.16.1', f: 'json', c: self.clientName },
      params
    )

    var request

    if (self.auth.serverInfo && self.auth.serverInfo.extensions.includes('formPost')) {
      request = new Request(self.auth.server + '/' + path, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: toQueryString(params) + '&' + self.auth.urlParams
      })
    } else {
      request = new Request(
        self.auth.server + '/' + path + '?' + toQueryString(params) + '&' + self.auth.urlParams,
        { method: 'GET', headers: { Accept: 'application/json' } }
      )
    }

    try {
      var response = await window.fetch(request)

      if (!response.ok) {
        if (response.status === 501) {
          throw new UnsupportedOperationError(
            'Request failed with status ' + response.status
          )
        }

        throw new Error('Request failed with status ' + response.status)
      }

      var json = await response.json()
      var subsonicResponse = json['subsonic-response']

      if (subsonicResponse.status !== 'ok') {
        var errorMessage = subsonicResponse.status
        var errorCode = null

        if (subsonicResponse.error) {
          if (subsonicResponse.error.message) {
            errorMessage = subsonicResponse.error.message
          }

          if (subsonicResponse.error.code != null) {
            errorCode = subsonicResponse.error.code
          }
        }

        throw new SubsonicError(errorMessage, errorCode)
      }

      return subsonicResponse
    } catch (err) {
      if (err instanceof TypeError && !navigator.onLine) {
        console.info('[Offline mode] API request skipped:', path)
        throw new OfflineError()
      }

      throw err
    }
  }
}

/**
 * Client name sent with savePlayQueue; Navidrome echoes it back as `changedBy`.
 *
 * @type {string}
 */
Object.defineProperty(API.prototype, 'sessionClient', {
  configurable: true,
  enumerable: false,
  get: function() {
    return this.clientName + '-' + this.deviceId
  }
})

/**
 * True if the play queue was last written by this device, or if the writer is
 * unknown / a legacy build without a device id (never treated as a takeover).
 *
 * @param {string} [changedBy]
 * @returns {boolean}
 */
API.prototype.isOwnQueueWriter = function(changedBy) {
  return !changedBy || changedBy === this.sessionClient || changedBy === this.clientName
}

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<boolean>}
 */
API.prototype.isOnline = async function() {
  try {
    var response = await this.fetch('rest/ping.view', {})

    if (!response) {
      return false
    }

    return response.status === 'ok'
  } catch (err) {
    if (err instanceof OfflineError) {
      return false
    }

    return false
  }
}

// ---------------------------------------------------------------------------
// Artist cache
// ---------------------------------------------------------------------------

// Call after anything that could change the artist list sooner than the
// TTL would naturally expire it (library rescan, artist favourited, etc.)
/**
 * @returns {void}
 */
API.prototype.clearArtistsCache = function() {
  this.artistsCache = null
}
