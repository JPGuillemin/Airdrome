// shared/platform.js
//
// Single place that answers "are we running inside Capacitor?" so the rest of
// the app can keep its browser/PWA behaviour untouched.

import { Capacitor } from '@capacitor/core'

/** True inside any Capacitor native shell (Android/iOS). */
export var isNative = Capacitor.isNativePlatform()

/** True inside the Android Capacitor shell. */
export var isAndroid = isNative && Capacitor.getPlatform() === 'android'

/** True in a normal browser or installed PWA. */
export var isWeb = !isNative
