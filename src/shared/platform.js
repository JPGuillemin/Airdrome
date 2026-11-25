// shared/platform.js
//
// Single place that answers "are we running inside Capacitor?" so the rest of
// the app can keep its browser/PWA behaviour untouched.

import { Capacitor } from '@capacitor/core'

// `window.androidBridge` is injected by the native shell. Checking it as well
// makes platform detection resilient if the bridge arrives slightly after the
// JS bundle starts evaluating.
var androidBridge = typeof window !== 'undefined' && !!window.androidBridge

/** True inside any Capacitor native shell (Android/iOS). */
export var isNative = Capacitor.isNativePlatform() || androidBridge

/** True inside the Android Capacitor shell. */
export var isAndroid = isNative &&
  (Capacitor.getPlatform() === 'android' || androidBridge)

/** True in a normal browser or installed PWA. */
export var isWeb = !isNative

/**
 * True on phones/tablets (coarse pointer + touch). Used to pick hover vs
 * long-press interactions without repeating the media query everywhere.
 */
export var isTouchDevice = typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  navigator.maxTouchPoints > 0
