// shared/nativeShell.js
//
// Everything that talks to the Capacitor Android shell rather than to the
// application itself: status bar, splash screen, hardware back button and the
// service-worker cleanup. Keeping it here leaves main.js platform-agnostic.

import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { isAndroid } from '@/shared/platform'

/**
 * Apply the Android status bar / splash styling.
 *
 * @returns {Promise<void>}
 */
export async function setupNativeShell() {
  if (!isAndroid) {
    return
  }

  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#09090b' })
  } catch (error) {
    console.warn('Status bar setup failed', error)
  }

  try {
    await SplashScreen.hide()
  } catch (error) {
    console.warn('Splash screen hide failed', error)
  }
}

/**
 * The native shell serves the app from the local WebView; a service worker
 * would only add a second, stale copy of the shell. Remove any worker/cache
 * left by an older build so the APK always runs its own bundled JS (and
 * therefore the native ExoPlayer engine).
 *
 * @returns {Promise<void>}
 */
export async function cleanupNativeServiceWorker() {
  if (!isAndroid || !('serviceWorker' in navigator)) {
    return
  }

  try {
    var registrations = await navigator.serviceWorker.getRegistrations()

    await Promise.all(registrations.map(function(registration) {
      return registration.unregister()
    }))

    if (window.caches) {
      var cacheKeys = await caches.keys()

      await Promise.all(cacheKeys.map(function(key) {
        return caches.delete(key)
      }))
    }

    if (navigator.serviceWorker.controller &&
        !sessionStorage.getItem('native-sw-cleared')) {
      sessionStorage.setItem('native-sw-cleared', '1')
      window.location.reload()
    }
  } catch (error) {
    console.warn('Native service worker cleanup failed', error)
  }
}

/**
 * Android hardware back button: go back, or minimise on the first screen.
 *
 * @param {Object} router
 * @returns {void}
 */
export function setupAndroidBackButton(router) {
  if (!isAndroid) {
    return
  }

  CapacitorApp.addListener('backButton', function() {
    if (router.options.history.state.back) {
      router.back()
    } else {
      CapacitorApp.minimizeApp().catch(function() {
        // Nothing else to do if the host refuses to minimise.
      })
    }
  }).catch(function(error) {
    console.warn('Back button listener failed', error)
  })
}

/**
 * The native bridge can be injected slightly after the JS bundle starts
 * evaluating. In that case the audio engine was selected as Web Audio; reload
 * once so engine selection can pick ExoPlayer instead.
 *
 * @returns {boolean} True when a reload was triggered.
 */
export function reloadIfBridgeArrivedLate() {
  var bridgeReady = typeof window !== 'undefined' &&
    (window.androidBridge || Capacitor.isNativePlatform())

  if (isAndroid || !bridgeReady || sessionStorage.getItem('native-engine-reload')) {
    return false
  }

  sessionStorage.setItem('native-engine-reload', '1')
  window.location.reload()
  return true
}
