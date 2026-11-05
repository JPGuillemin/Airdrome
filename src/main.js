// main.js
//
// Application bootstrap: theme, API, stores, router, global components,
// mounting and the service worker.
// Written in an explicit, ES5-friendly style: var, function expressions and
// async/await.

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

import '@/shared/debugLog'

var auth = createAuth()

export var router = setupRouter(auth)
export default router

var APP_BASE = import.meta.env.BASE_URL

var THEME_COLORS = [
  { name: 'Blue', value: '#178994' },
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
  function applyTheme(color) {
    document.documentElement.style.setProperty('--bs-primary', color)
    localStorage.setItem('themeColor', color)
  }

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
  app.config.globalProperties.$themeColors = THEME_COLORS
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
 * Register the service worker and listen for update notifications.
 *
 * @returns {void}
 */
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return
  }

  navigator.serviceWorker.register(APP_BASE + 'service-worker.js', {
    scope: APP_BASE
  })

  navigator.serviceWorker.addEventListener('message', function(event) {
    var data = event.data

    if (data && data.type === 'UPDATE_READY') {
      console.info('New version available')
    }
  })
}

/**
 * Create the Vue application and all of its plugins.
 *
 * @returns {Promise<void>}
 */
async function bootstrapApp() {
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
  app.use(context.api)
  app.provide('$api', context.api)
  app.use(createBootstrap())

  app.config.globalProperties.$auth = auth

  registerTheme(app)
  app.directive('wheel-scroll', wheelScroll)
  registerComponents(app)

  try {
    app.mount('#app')
  } catch (error) {
    console.error('App mount failed', error)
  }

  setupServiceWorker()
}

document.addEventListener('contextmenu', function(event) {
  event.preventDefault()
})

// Run the bootstrap.
bootstrapApp()
