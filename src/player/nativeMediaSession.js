// player/nativeMediaSession.js
//
// JS facade for the custom Android MediaSession plugin. On the web every
// method is a no-op, so callers do not need platform checks.

import { registerPlugin } from '@capacitor/core'
import { isAndroid } from '@/shared/platform'

var noop = {
  setMetadata: async function() {},
  setPlaybackState: async function() {},
  requestAudioFocus: async function() {
    return { granted: true, delayed: false }
  },
  abandonAudioFocus: async function() {},
  addListener: async function() {
    return { remove: async function() {} }
  }
}

/** @type {Object} */
export var nativeMediaSession = isAndroid
  ? registerPlugin('MediaSession')
  : noop
