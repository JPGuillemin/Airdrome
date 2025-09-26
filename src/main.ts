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
import { useLoader } from '@/shared/loader'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('Service worker registered:', reg))
      .catch(err => console.error('Service worker error:', err))
  })
}

function setTheme(color: string) {
  document.documentElement.style.setProperty('--bs-primary', color)
  localStorage.setItem('themeColor', color)
}

const savedColor = localStorage.getItem('themeColor')
if (savedColor) {
  setTheme(savedColor)
}

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
  })

router.beforeEach((to, from, next) => {
  const loader = useLoader()
  loader.showLoading()
  mainStore.clearError()
  next()
})

router.afterEach(() => {
  const loader = useLoader()
  loader.hideLoading()
})

const app = createApp(AppComponent, { router, pinia, store: playerStore })

app.config.errorHandler = (err: Error) => {
  // eslint-disable-next-line
  console.error(err)
  mainStore.setError(err)
}

app.use(auth)
app.use(api)

Object.entries(components).forEach(([key, value]) => {
  app.component(key, value as any)
})

app.mount('#app')
