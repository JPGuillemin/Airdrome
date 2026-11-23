// shared/haptics.js
//
// Short tactile feedback. Uses the native Haptics plugin on Android and the
// Vibration API in browsers/PWAs.

import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { isNative } from '@/shared/platform'

/**
 * Fire a light impact / vibration.
 *
 * @param {number} [durationMs] Browser vibration duration, default 30 ms.
 * @returns {void}
 */
export function lightHaptic(durationMs) {
  if (isNative) {
    Haptics.impact({ style: ImpactStyle.Light }).catch(function() {
      // Haptics are cosmetic: never surface an error.
    })
    return
  }

  if (navigator.vibrate) {
    navigator.vibrate(durationMs || 30)
  }
}
