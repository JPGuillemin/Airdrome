import { createApp, markRaw, watch } from 'vue'
import AppComponent from '@/app/App.vue'
import { components } from '@/shared/components'
import { setupRouter } from '@/shared/router'
import { useMainStore } from '@/shared/store'
import { createApi } from '@/shared'
import { createAuth } from '@/auth/service'
import { setupAudio, usePlayerStore } from './player/store'
import { createPinia } from 'pinia'
import { useFavouriteStore } from '@/library/favourite/store'
import { usePlaylistStore } from '@/library/playlist/store'
import { createBootstrap } from 'bootstrap-vue-next'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-vue-next/dist/bootstrap-vue-next.css'
import '@/style/main.scss'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

const APP_BASE = import.meta.env.BASE_URL

async function bootstrapApp() {
  // --- Theme ---
  function setTheme(color: string) {
    document.documentElement.style.setProperty('--bs-primary', color)
    localStorage.setItem('themeColor', color)
  }
  const savedColor = localStorage.getItem('themeColor')
  if (savedColor) setTheme(savedColor)

  // --- Auth & API ---
  const auth = createAuth()
  const api = createApi(auth)

  // --- Router & Pinia ---
  const router = setupRouter(auth)
  const pinia = createPinia().use(({ store }) => {
    store.api = markRaw(api)
  })

  const mainStore = useMainStore(pinia)
  const playerStore = usePlayerStore(pinia)

  // --- Watch logged-in state ---
  watch(
    () => mainStore.isLoggedIn,
    async(value) => {
      if (value) {
        try {
          // setup player once authenticated
          setupAudio(playerStore, mainStore, api)

          await Promise.all([
            useFavouriteStore().load(),
            usePlaylistStore().load(),
            playerStore.loadQueue(),
          ])
        } catch (err) {
          console.error('Error loading user data', err)
        }
      }
    },
    { immediate: false }
  )

  window.history.scrollRestoration = 'manual'
  // --- Create App ---
  const app = createApp(AppComponent)

  app.use(router)
  app.use(pinia)
  app.use(auth)
  app.use(api)
  app.use(createBootstrap())

  // --- Global properties ---
  app.config.globalProperties.$auth = auth
  app.config.globalProperties.$api = api

  const themeColors = [
    { name: 'Grey', value: '#999999' },
    { name: 'Green', value: '#1db954' },
    { name: 'Orange', value: '#ff8c00' },
    { name: 'Purple', value: '#6f42c1' },
    { name: 'Red', value: '#bf0000' }
  ]

  app.config.globalProperties.$themeColors = themeColors
  app.provide('themeColors', themeColors)

  // --- Register components ---
  Object.entries(components).forEach(([key, value]) => {
    app.component(key, value as any)
  })

  // --- Mount app ---
  try {
    app.mount('#app')
    console.log('App mounted successfully')
  } catch (err) {
    console.error('App mount failed', err)
  }

  // --- Service Worker ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${APP_BASE}service-worker.js`, { scope: APP_BASE })

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'UPDATE_READY') {
        // Exemple : notifier l’utilisateur
        console.log('Nouvelle version disponible !')
        // Option : window.location.reload()
      }
    })
  }
}

// Run the bootstrap
bootstrapApp()
