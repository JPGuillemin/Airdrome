// shared/network.js
//
// Connectivity state. On Android the Capacitor Network plugin is the source
// of truth; browsers keep using navigator.onLine. The rest of the app only
// calls isOnline(), so offline checks behave the same on both targets.

import { ref } from 'vue'
import { Network } from '@capacitor/network'
import { isNative } from '@/shared/platform'

/** Reactive connectivity flag for UI bindings. */
export var networkOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

var initialized = false

/**
 * Initialise connectivity tracking. Safe to call more than once.
 *
 * @returns {Promise<void>}
 */
export async function initNetwork() {
  if (initialized) {
    return
  }

  initialized = true

  if (isNative) {
    try {
      var status = await Network.getStatus()
      networkOnline.value = status.connected
    } catch (error) {
      console.warn('[network] initial status failed', error)
    }

    try {
      await Network.addListener('networkStatusChange', function(status) {
        networkOnline.value = status.connected
      })
    } catch (error) {
      console.warn('[network] listener failed', error)
    }

    return
  }

  window.addEventListener('online', function() {
    networkOnline.value = true
  })

  window.addEventListener('offline', function() {
    networkOnline.value = false
  })
}

/**
 * Synchronous connectivity check used by API/session code.
 *
 * @returns {boolean}
 */
export function isOnline() {
  return networkOnline.value
}
