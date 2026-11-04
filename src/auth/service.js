// service.js
//
// Authentication service. Holds the Subsonic credentials, persists the
// session in localStorage and exposes the service as a Vue plugin.
// Written in an explicit, ES5-friendly style: constructor function,
// prototype methods, function expressions and async/await.

import { md5, randomString, toQueryString } from '@/shared/utils'
import { inject } from 'vue'
import { pickBy } from 'lodash-es'

/**
 * @typedef {Object} Config
 * @property {string} serverUrl
 */

/**
 * @typedef {Object} ServerInfo
 * @property {string} name
 * @property {string} version
 * @property {boolean} openSubsonic
 * @property {string[]} extensions
 */

/**
 * @typedef {Object} Auth
 * @property {string} [password]
 * @property {string} [salt]
 * @property {string} [hash]
 */

var env = window.env

var serverUrl = ''

if (env && env.SERVER_URL) {
  serverUrl = env.SERVER_URL
}

/** Authentication configuration, filled from `window.env`. */
export var config = {
  serverUrl: serverUrl
}

/**
 * Strip trailing slashes from a server URL.
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeServerUrl(url) {
  return url.replace(/\/+$/, '')
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

/**
 * Create the authentication service.
 *
 * @constructor
 */
export function AuthService() {
  /** Base URL of the Subsonic server. */
  this.server = ''

  /** Server capabilities, or null before they have been fetched. */
  this.serverInfo = null

  /** Logged-in username. */
  this.username = ''

  this.salt = ''
  this.hash = ''
  this.password = ''
  this.authenticated = false

  var storedServer = config.serverUrl || localStorage.getItem('server') || ''

  this.server = normalizeServerUrl(storedServer)

  this.username = localStorage.getItem('username') || ''
  this.salt = localStorage.getItem('salt') || ''
  this.hash = localStorage.getItem('hash') || ''
  this.password = localStorage.getItem('password') || ''
}

/**
 * Persist the current credentials.
 *
 * @returns {void}
 */
AuthService.prototype.saveSession = function() {
  if (!config.serverUrl) {
    localStorage.setItem('server', this.server)
  }

  localStorage.setItem('username', this.username)
  localStorage.setItem('salt', this.salt)
  localStorage.setItem('hash', this.hash)
  localStorage.setItem('password', this.password)
}

/**
 * Query string with the active credentials.
 *
 * @returns {string}
 */
Object.defineProperty(AuthService.prototype, 'urlParams', {
  get: function() {
    var params = {
      u: this.username,
      s: this.salt,
      t: this.hash,
      p: this.password
    }

    return toQueryString(
      pickBy(params, function(value) {
        return value !== undefined && value !== ''
      })
    )
  }
})

/**
 * Restore a session from the credentials in localStorage.
 *
 * @returns {Promise<boolean>}
 */
AuthService.prototype.autoLogin = async function() {
  if (!this.server || !this.username) {
    return false
  }

  try {
    var auth = {
      salt: this.salt,
      hash: this.hash,
      password: this.password
    }

    await login(this.server, this.username, auth)

    this.authenticated = true
    this.serverInfo = await fetchServerInfo(this)

    return true
  } catch (error) {
    return false
  }
}

/**
 * Log in with a username and password. Tries the salted hash first and
 * falls back to sending the password in clear text.
 *
 * @param {string} server
 * @param {string} username
 * @param {string} password
 * @returns {Promise<void>}
 */
AuthService.prototype.loginWithPassword = async function(server, username, password) {
  server = normalizeServerUrl(server)

  var salt = randomString()
  var hash = md5(password + salt)

  try {
    await login(server, username, { hash: hash, salt: salt })

    this.salt = salt
    this.hash = hash
    this.password = ''
  } catch (error) {
    await login(server, username, { password: password })

    this.salt = ''
    this.hash = ''
    this.password = password
  }

  this.server = server
  this.username = username
  this.authenticated = true

  this.serverInfo = await fetchServerInfo(this)

  this.saveSession()
}

/**
 * Forget the stored session.
 *
 * @returns {void}
 */
AuthService.prototype.logout = function() {
  localStorage.clear()
  sessionStorage.clear()
}

/**
 * True when a login succeeded during this page lifetime.
 *
 * @returns {boolean}
 */
AuthService.prototype.isAuthenticated = function() {
  return this.authenticated
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON response body.
 *
 * @param {Response} response
 * @returns {Promise<Object>}
 */
async function safeJson(response) {
  var text = await response.text()

  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error('Server returned non-JSON response: ' + text.slice(0, 120))
  }
}

/**
 * Ping the server with the given credentials.
 *
 * @param {string} server
 * @param {string} username
 * @param {Auth} auth
 * @returns {Promise<void>}
 */
async function login(server, username, auth) {
  var params = {
    s: auth.salt,
    t: auth.hash,
    p: auth.password
  }

  var qs = toQueryString(
    pickBy(params, function(value) {
      return value !== undefined
    })
  )

  var url = server + '/rest/ping?u=' + username + '&' + qs +
    '&v=1.16.1&c=Airdrome&f=json'

  var response = await fetch(url)

  if (!response.ok) {
    throw new Error(response.statusText)
  }

  var body = await safeJson(response)
  var subsonicResponse = body['subsonic-response']

  if (!subsonicResponse || subsonicResponse.status !== 'ok') {
    var message = 'Unknown error'

    if (subsonicResponse && subsonicResponse.error && subsonicResponse.error.message) {
      message = subsonicResponse.error.message
    } else if (subsonicResponse && subsonicResponse.status) {
      message = subsonicResponse.status
    }

    throw new Error(message)
  }
}

/**
 * Fetch the OpenSubsonic capabilities, falling back to plain Subsonic.
 *
 * @param {AuthService} auth
 * @returns {Promise<ServerInfo>}
 */
async function fetchServerInfo(auth) {
  var url = auth.server + '/rest/getOpenSubsonicExtensions?' + auth.urlParams +
    '&v=1.16.1&c=Airdrome&f=json'

  try {
    var response = await fetch(url)

    if (!response.ok) {
      throw new Error(response.statusText)
    }

    var body = await safeJson(response)
    var subsonicResponse = body['subsonic-response']

    if (subsonicResponse && subsonicResponse.status === 'ok') {
      var rawExtensions = subsonicResponse.openSubsonicExtensions || []
      var extensions = []

      for (var i = 0; i < rawExtensions.length; i++) {
        extensions.push(rawExtensions[i].name)
      }

      return {
        name: subsonicResponse.type,
        version: subsonicResponse.version,
        openSubsonic: true,
        extensions: extensions
      }
    }
  } catch (error) {
    // Ignore errors and fall back below.
  }

  return {
    name: 'Subsonic',
    version: 'Unknown',
    openSubsonic: false,
    extensions: []
  }
}

// ---------------------------------------------------------------------------
// Vue plugin
// ---------------------------------------------------------------------------

var apiSymbol = Symbol('auth')

/**
 * Resolve the authentication service from the current component.
 *
 * @returns {AuthService}
 */
export function useAuth() {
  return inject(apiSymbol)
}

/**
 * Create the authentication service and add the Vue plugin install hook.
 *
 * @returns {AuthService}
 */
export function createAuth() {
  var instance = new AuthService()

  return Object.assign(instance, {
    install: function(app) {
      app.provide(apiSymbol, instance)
    }
  })
}
