// shared/images.js
//
// Cover-art URL resolver. On the web, cached images are handled by the Cache
// API and URLs stay untouched. On Android, cover art is written to the native
// filesystem and this map swaps the remote URL for a WebView-loadable
// `_capacitor_file_` URL. Components call resolveImage() when rendering, so a
// newly cached image updates automatically.

import { useStorage } from '@vueuse/core'
import { Capacitor } from '@capacitor/core'
import { isNative } from '@/shared/platform'

var STORAGE_KEY = 'imageCacheMap'

/**
 * Remote URL -> cached WebView URL. Persisted in localStorage so the mapping
 * survives an app restart (the Capacitor data directory path is stable).
 */
var imageMap = useStorage(STORAGE_KEY, {}, undefined, { writeDefaults: false })

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

  return imageMap.value[url] || url
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

  imageMap.value[url] = cachedUrl
}

/** Forget every cached image mapping. */
export function clearImageMap() {
  imageMap.value = {}
}

/**
 * Number of known cached images.
 *
 * @returns {number}
 */
export function imageMapSize() {
  return Object.keys(imageMap.value).length
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
