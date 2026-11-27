// shared/streamQuality.js
//
// Preferred stream bitrate, shared by the settings UI and the player. The API
// takes it as a parameter (getStreamUrl(id, bitRate)); the player rebuilds the
// queue URLs when it changes, so no app restart is needed.

import { ref } from 'vue'

var STORAGE_KEY = 'streamQuality'

/** Selected bitrate in kbps (1000 = original/raw). */
export var streamQuality = ref(Number(localStorage.getItem(STORAGE_KEY)) || 128)

/**
 * Change the preferred stream bitrate.
 *
 * @param {number} value
 * @returns {void}
 */
export function setStreamQuality(value) {
  streamQuality.value = value
  localStorage.setItem(STORAGE_KEY, String(value))
}
