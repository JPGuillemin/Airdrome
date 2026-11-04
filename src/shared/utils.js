// utils.js
import { md5 as md5Function } from 'js-md5'

/**
 * @typedef {import('@/shared/api').Track} Track
 */

/**
 * Hash a string with MD5.
 *
 * @param {string} str
 * @returns {string}
 */
export function md5(str) {
  return md5Function(str)
}

/**
 * Generate a 16-character random alphanumeric string.
 *
 * @returns {string}
 */
export function randomString() {
  var arr = new Uint8Array(16)
  window.crypto.getRandomValues(arr)
  var validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  arr = arr.map(function(x) {
    return validChars.charCodeAt(x % validChars.length)
  })
  return String.fromCharCode.apply(null, Array.from(arr))
}

/**
 * Shuffle a list in place. When `moveFirst` is given, that item is swapped
 * to the front and the rest of the list is shuffled after it.
 *
 * @param {Array} list
 * @param {number} [moveFirst]
 * @returns {void}
 */
export function shuffle(list, moveFirst) {
  if (moveFirst !== undefined) {
    var first = list[0]
    list[0] = list[moveFirst]
    list[moveFirst] = first
  }

  var start = 0

  if (moveFirst !== undefined) {
    start = 1
  }

  var end = list.length - 1

  for (var i = end; i > start; i--) {
    var j = Math.floor(Math.random() * (i - start + 1) + start)
    var temporary = list[i]
    list[i] = list[j]
    list[j] = temporary
  }
}

/**
 * Return a shuffled copy of a list.
 *
 * @param {Array} list
 * @param {number} [moveFirst]
 * @returns {Array}
 */
export function shuffled(list, moveFirst) {
  list = list.slice()
  shuffle(list, moveFirst)
  return list
}

/**
 * Compare two track lists by ID.
 *
 * @param {Track[]} a
 * @param {Track[]} b
 * @returns {boolean}
 */
export function trackListEquals(a, b) {
  if (a.length !== b.length) {
    return false
  }

  for (var i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) {
      return false
    }
  }

  return true
}

/**
 * Join artist names with commas.
 *
 * @param {Array} artists
 * @returns {string}
 */
export function formatArtists(artists) {
  return artists.map(function(ar) {
    return ar.name
  }).join(', ')
}

/**
 * Build a URL query string from a parameter map. Undefined values are
 * omitted; array values produce one entry per item.
 *
 * @param {Object} params
 * @returns {string}
 */
export function toQueryString(params) {
  var list = []
  var keys = Object.keys(params)

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    var value = params[key]

    if (value === undefined) {
      continue
    }

    if (Array.isArray(value)) {
      for (var j = 0; j < value.length; j++) {
        list.push([key, value[j]])
      }
    } else {
      list.push([key, value])
    }
  }

  return new URLSearchParams(list).toString()
}

/**
 * Format a duration in seconds as mm:ss (or '∞' when not finite).
 *
 * @param {number} value
 * @returns {string}
 */
export function formatDuration(value) {
  if (!isFinite(value)) {
    return '∞'
  }

  var minutes = Math.floor(value / 60)
  var seconds = Math.floor(value % 60)
  var minutePrefix = ''
  var secondPrefix = ''

  if (minutes < 10) {
    minutePrefix = '0'
  }

  if (seconds < 10) {
    secondPrefix = '0'
  }

  return minutePrefix + minutes + ':' + secondPrefix + seconds
}

/**
 * Wait for the given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms)
  })
}
