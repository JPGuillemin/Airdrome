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
import {
  setupNativeShell,
  cleanupNativeServiceWorker,
  setupAndroidBackButton,
  reloadIfBridgeArrivedLate
} from '@/shared/nativeShell'

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
