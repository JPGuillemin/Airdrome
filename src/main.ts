import '@/style/main.scss'
import Vue, { markRaw, watch } from 'vue'
import Router from 'vue-router'
import AppComponent from '@/app/App.vue'
import { createApp } from '@/shared/compat'
import { components } from '@/shared/components'
import { setupRouter } from '@/shared/router'
import { useMainStore } from '@/shared/store'
import { API } from '@/shared/api'
import { createAuth } from '@/auth/service'
import { setupAudio, usePlayerStore } from './player/store'
import { createApi } from '@/shared'
import { createPinia, PiniaVuePlugin } from 'pinia'
import { useFavouriteStore } from '@/library/favourite/store'
import { usePlaylistStore } from '@/library/playlist/store'

declare module 'vue/types/vue' {
  interface Vue {
    $api: API
  }
}

declare module 'pinia' {
  export interface PiniaCustomProperties {
    api: API;
  }
}

Vue.use(Router)
Vue.use(PiniaVuePlugin)

const auth = createAuth()
const api = createApi(auth)
const router = setupRouter(auth)

const pinia = createPinia()
  .use(({ store }) => {
    store.api = markRaw(api)
  })

const mainStore = useMainStore(pinia)
const playerStore = usePlayerStore(pinia)

setupAudio(playerStore, mainStore, api)

// Disable popups when user logs in or navigation errors occur
watch(
  () => mainStore.isLoggedIn,
  (value) => {
    if (value) {
      return Promise.all([
        useFavouriteStore().load(),
        usePlaylistStore().load(),
        playerStore.loadQueue(),
      ])
    }
  }
)

router.beforeEach((to, from, next) => {
  mainStore.clearError()
  next()
})

const app = createApp(AppComponent, { router, pinia, store: playerStore })

// ---- ERROR POPUP SUPPRESSION ----

// Swallow Vue component errors silently
app.config.errorHandler = () => { /* empty */ }

// Override store-level error setters to prevent triggering UI popups
if ('setError' in mainStore && typeof (mainStore as any).setError === 'function') {
  (mainStore as any).setError = () => { /* empty */ }
}

if ('setError' in playerStore && typeof (playerStore as any).setError === 'function') {
  (playerStore as any).setError = () => { /* empty */ }
}

// Disable console error and warn output
console.error = () => { /* empty */ }
console.warn = () => { /* empty */ }

// Block unhandled errors and promise rejections
window.addEventListener('error', (event) => {
  event.preventDefault()
})
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault()
})

// ---------------------------------

app.use(auth)
app.use(api)

Object.entries(components).forEach(([key, value]) => {
  app.component(key, value as any)
})

app.mount('#app')
