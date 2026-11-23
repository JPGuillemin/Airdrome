// shared/images.js
//
// Cover-art URL resolver. On the web, cached images are handled by the Cache
// API and URLs stay untouched. On Android, cover art is written to the native
// filesystem and this reactive map swaps the remote URL for a WebView-loadable
// `_capacitor_file_` URL. Components call resolveImage() when rendering, so a
// newly cached image updates automatically.

import { reactive } from 'vue'
import { Capacitor } from '@capacitor/core'
import { isNative } from '@/shared/platform'

var STORAGE_KEY = 'imageCacheMap'

/**
 * Remote URL -> cached WebView URL. Persisted in localStorage so the mapping
 * survives an app restart (the Capacitor data directory path is stable).
 */
var imageMap = reactive(readMap())

var saveTimer = null

function readMap() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY)

    if (raw) {
      var parsed = JSON.parse(raw)

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch (error) {
    // Corrupt entry: start from scratch.
  }

  return {}
}

function scheduleSave() {
  if (saveTimer) {
    return
  }

  saveTimer = window.setTimeout(function() {
    saveTimer = null

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imageMap))
    } catch (error) {
      // Storage full: the mapping is only an optimisation.
    }
  }, 400)
}

/**
 * Return the cached URL for an image when one exists, else the original.
 *
 * @param {string} url
 * @returns {string}
 */
export function resolveImage(url) {
  if (!url) {
    return url
  }

  return imageMap[url] || url
}

/**
 * Remember that `url` is available at `cachedUrl`.
 *
 * @param {string} url
 * @param {string} cachedUrl
 * @returns {void}
 */
export function rememberImage(url, cachedUrl) {
  if (!url || !cachedUrl || !isNative) {
    return
  }

  imageMap[url] = cachedUrl
  scheduleSave()
}

/**
 * Forget one cached image.
 *
 * @param {string} url
 * @returns {void}
 */
export function forgetImage(url) {
  if (!url || !imageMap[url]) {
    return
  }

  delete imageMap[url]
  scheduleSave()
}

/** Forget every cached image mapping. */
export function clearImageMap() {
  var keys = Object.keys(imageMap)

  for (var i = 0; i < keys.length; i++) {
    delete imageMap[keys[i]]
  }

  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    // ignore
  }
}

/**
 * Number of known cached images.
 *
 * @returns {number}
 */
export function imageMapSize() {
  return Object.keys(imageMap).length
}

/**
 * Convert a native file URI into a URL the WebView can load.
 *
 * @param {string} fileUri
 * @returns {string}
 */
export function webviewUrl(fileUri) {
  return Capacitor.convertFileSrc(fileUri)
}
