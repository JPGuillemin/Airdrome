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
import { useLoader } from '@/shared/loader'
import { createBootstrap } from 'bootstrap-vue-next'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-vue-next/dist/bootstrap-vue-next.css'
import '@/style/main.scss'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

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

const auth = createAuth()
const api = createApi(auth)
const router = setupRouter(auth)

const pinia = createPinia().use(({ store }) => {
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
  }
)

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

const app = createApp(AppComponent)

app.use(router)
app.use(pinia)
app.use(auth)
app.use(api)
app.use(createBootstrap())

// Set global $api property
app.config.globalProperties.$api = api

Object.entries(components).forEach(([key, value]) => {
  app.component(key, value as any)
})

app.mount('#app')
