// main.js
//
// Application bootstrap: theme, API, stores, router, global components,
// mounting and the service worker.
// Written in an explicit, ES5-friendly style: var, function expressions and
// async/await.

import '@/shared/debugLog'

import { createApp, markRaw, watch } from 'vue'
import AppComponent from '@/app/App.vue'
import { components } from '@/shared/components'
import { setupRouter } from '@/shared/router'
import { useMainStore } from '@/shared/store'
import { createApi } from '@/shared/api'
import { createAuth } from '@/auth/service'
import { usePlayerStore } from './player/store'
import { setupAudio } from './player/setupAudio'
import { createPinia } from 'pinia'
import { useFavouriteStore } from '@/library/favourite/store'
import { usePlaylistStore } from '@/library/playlist/store'
import { createBootstrap } from 'bootstrap-vue-next'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-vue-next/dist/bootstrap-vue-next.css'
import '@/css/main.scss'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import wheelScroll from '@/shared/wheelscroll'
import { longPressTooltip } from '@/shared/tooltips'
import { applyTheme } from '@/shared/theme'
import { initNetwork } from '@/shared/network'
import { isAndroid } from '@/shared/platform'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

var auth = createAuth()

export var router = setupRouter(auth)
export default router

var APP_BASE = import.meta.env.BASE_URL

var THEME_COLORS = [
  { name: 'Blue', value: '#1aa3b0' },
  { name: 'Green', value: '#63c98a' },
  { name: 'Orange', value: '#f2ad5c' },
  { name: 'Purple', value: '#9a7cc7' },
  { name: 'Red', value: '#c46a6a' }
]

/**
 * Restore the saved theme color.
 *
 * @returns {void}
 */
function setupTheme() {
  var savedColor = localStorage.getItem('themeColor')

  if (savedColor) {
    applyTheme(savedColor)
  }
}

/**
 * Create the Vue app, its API client and Pinia instance.
 *
 * @returns {{ api: Object, pinia: Object, app: Object }}
 */
function createApplication() {
  var api = createApi(auth)

  var pinia = createPinia().use(function(context) {
    context.store.api = markRaw(api)
  })

  var app = createApp(AppComponent)
  app.use(pinia)

  return { api: api, pinia: pinia, app: app }
}

/**
 * Load user data once the login state becomes true.
 *
 * @param {Object} mainStore
 * @param {Object} playerStore
 * @param {Object} pinia
 * @returns {void}
 */
function watchLogin(mainStore, playerStore, pinia) {
  var audioInitialized = false

  watch(
    function() {
      return mainStore.isLoggedIn
    },
    async function(value) {
      if (!value || audioInitialized) {
        return
      }

      audioInitialized = true

      try {
        await setupAudio(playerStore, mainStore)
        await Promise.all([
          useFavouriteStore(pinia).load(),
          usePlaylistStore(pinia).load(),
          playerStore.loadQueue()
        ])
      } catch (error) {
        console.error('Error loading user data', error)
      }
    },
    { immediate: false }
  )
}

/**
 * Register theme colors as globals.
 *
 * @param {Object} app
 * @returns {void}
 */
function registerTheme(app) {
  app.provide('themeColors', THEME_COLORS)
}

/**
 * Register the shared components globally.
 *
 * @param {Object} app
 * @returns {void}
 */
function registerComponents(app) {
  var componentNames = Object.keys(components)

  for (var i = 0; i < componentNames.length; i++) {
    var componentName = componentNames[i]
    app.component(componentName, components[componentName])
  }
}

/**
 * Register the service worker (web) or remove any stale one (native shell).
 *
 * @returns {Promise<void>}
 */
async function setupServiceWorker() {
  if (isAndroid) {
    await cleanupNativeServiceWorker()
    return
  }

  // In dev the worker is not built (VitePWA devOptions disabled), so skip it.
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    return
  }

  navigator.serviceWorker.register(APP_BASE + 'service-worker.js', {
    scope: APP_BASE
  })
}

// ---------------------------------------------------------------------------
// Native shell (Android)
// ---------------------------------------------------------------------------
//
// Everything that talks to the Capacitor Android shell rather than to the
// application itself: status bar, splash screen, hardware back button and the
// service-worker cleanup.

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


/**
 * Create the Vue application and all of its plugins.
 *
 * @returns {Promise<void>}
 */
async function bootstrapApp() {
  await initNetwork()

  setupTheme()

  var context = createApplication()
  var app = context.app
  var pinia = context.pinia
  var mainStore = useMainStore(pinia)
  var playerStore = usePlayerStore(pinia)

  watchLogin(mainStore, playerStore, pinia)

  window.history.scrollRestoration = 'manual'

  app.use(router)
  app.use(auth)
  app.provide('$api', context.api)
  app.use(createBootstrap())

  registerTheme(app)
  app.directive('wheel-scroll', wheelScroll)
  app.directive('longpress-tooltip', longPressTooltip)
  registerComponents(app)

  try {
    app.mount('#app')
  } catch (error) {
    console.error('App mount failed', error)
  }

  void setupServiceWorker()
  setupAndroidBackButton(router)

  // A native bridge injected after startup means Web Audio was selected;
  // reload once so the engine can switch to ExoPlayer.
  if (reloadIfBridgeArrivedLate()) {
    return
  }

  await setupNativeShell()
}

document.addEventListener('contextmenu', function(event) {
  event.preventDefault()
})

// Run the bootstrap.
bootstrapApp()
