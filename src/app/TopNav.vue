<template>
  <div>
    <ConfirmDialog ref="confirmDialog" />
    <div class="top-nav elevated d-flex justify-content-between align-items-center pb-2 pt-2">
      <div class="d-flex align-items-center">
        <button
          class="btn btn-transparent flex-grow-1 flex-md-grow-0 mx-2"
          @click="store.showMenu"
        >
          <img width="36" height="36" src="@/shared/assets/logo.svg">
        </button>
        <router-link
          class="d-md-none btn btn-transparent nav-link flex-grow-1 flex-md-grow-0 mx-2"
          :to="{ name: 'home' }"
          title="Home panel"
          :exact="true"
        >
          <Icon icon="home" class="nav-icon nav-link" />
        </router-link>
        <router-link
          class="d-md-none btn btn-transparent nav-link flex-grow-1 flex-md-grow-0 mx-2"
          :to="{ name: 'queue' }"
          title="Playing"
          :exact="true"
        >
          <Icon icon="soundwave" class="nav-icon nav-link" />
        </router-link>
        <button
          class="btn btn-transparent nav-link flex-grow-1 flex-md-grow-0 mx-2 d-none d-md-inline"
          title="Go back"
          @click="$router.back()"
        >
          <Icon icon="goback" class="nav-icon nav-link" />
        </button>
      </div>

      <div class="d-flex align-items-center">
        <SearchForm class="flex-grow-1 flex-md-grow-0 mx-2" />
        <template v-if="store.username">
          <Dropdown variant="link" align="end" no-caret toggle-class="px-2">
            <template #button-content>
              <Icon icon="gear" color="var(--theme-elevation-4)" />
            </template>
            <div class="px-3 py-1 small">
              {{ store.username }}
            </div>
            <hr class="dropdown-divider">
            <div class="on-top px-3 py-2">
              <div class=" small mb-1">
                Theme color
              </div>
              <div class="d-flex gap-2">
                <button
                  v-for="color in colors"
                  :key="color.value"
                  class="theme-swatch"
                  :style="{
                    backgroundColor: color.value,
                    border: currentColor === color.value ? '2px solid #333' : '1px solid #ccc'
                  }"
                  :title="color.name"
                  @click="setTheme(color.value)"
                />
              </div>
            </div>
            <hr class="dropdown-divider">
            <div class="on-top px-3 py-2">
              <div class=" small mb-1">
                Stream quality
              </div>
              <div class="d-flex gap-2 flex-wrap">
                <button
                  v-for="option in [
                    { icon: 'music-note', value: 128, shade: 0.6 },
                    { icon: 'music-note', value: 192, shade: 0.9 },
                    { icon: 'music-note-beamed', value: 1000, shade: 0.9 }
                  ]"
                  :key="option.value"
                  class="btn btn-sm"
                  :class="streamQuality === option.value ? 'btn-outline-primary active' : 'btn-outline-secondary'"
                  @click="setStreamQuality(option.value)"
                >
                  <Icon
                    :icon="option.icon"
                    :style="{ color: `rgba(var(--bs-primary-rgb), ${option.shade})` }"
                  />
                </button>
              </div>
            </div>
            <hr class="dropdown-divider">
            <div class="on-top px-3 py-2 text-muted small">
              Cache size: {{ cacheSize }} GB
            </div>
            <DropdownItem class="on-top small" @click="scan">
              Refresh content<Icon icon="refresh" class="me-1" />
            </DropdownItem>
            <DropdownItem class="on-top small" @click="clearAllCache">
              Clear cache<Icon icon="trash" class="me-1" />
            </DropdownItem>
            <DropdownItem class="on-top small" @click="logout">
              Log out<Icon icon="logout" class="me-1" />
            </DropdownItem>
            <DropdownItem class="on-top small" @click="showAboutModal = true">
              About<Icon icon="info" class="me-1" />
            </DropdownItem>
          </Dropdown>
        </template>
        <Teleport to="body">
          <About :visible="showAboutModal" @close="showAboutModal = false" />
        </Teleport>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, inject, getCurrentInstance, onMounted, onBeforeUnmount } from 'vue'
  import { useRouter, useRoute } from 'vue-router'

  import About from './About.vue'
  import SearchForm from '@/library/search/SearchForm.vue'
  import { useMainStore } from '@/shared/store'
  import { useAuth } from '@/auth/service'
  import { sleep } from '@/shared/utils'
  import { useLoader } from '@/shared/loader'
  import { useCacheStore } from '@/player/cache'
  import ConfirmDialog, { ConfirmDialogExpose } from '@/shared/components/ConfirmDialog.vue'

  export default defineComponent({
    components: {
      About,
      SearchForm,
      ConfirmDialog,
    },
    setup() {
      const store = useMainStore()
      const auth = useAuth()
      const cacheStore = useCacheStore()

      const router = useRouter()
      const route = useRoute()
      const confirmDialog = ref<ConfirmDialogExpose | null>(null)
      const { proxy } = getCurrentInstance()!
      const api = proxy!.$api as {
        scan(): Promise<void>
        getScanStatus(): Promise<boolean>
      }

      const colors = inject('themeColors') as { name: string; value: string }[]

      const currentColor = ref(
        getComputedStyle(document.documentElement).getPropertyValue('--bs-primary')
      )

      function setTheme(color: string) {
        currentColor.value = color

        const hexToRgb = (hex: string) => {
          const bigint = parseInt(hex.replace('#', ''), 16)
          const r = (bigint >> 16) & 255
          const g = (bigint >> 8) & 255
          const b = bigint & 255
          return `${r}, ${g}, ${b}`
        }

        const rgb = hexToRgb(color)
        document.documentElement.style.setProperty('--bs-primary', color)
        document.documentElement.style.setProperty('--bs-primary-rgb', rgb)
        localStorage.setItem('themeColor', color)
      }

      const streamQuality = ref(Number(localStorage.getItem('streamQuality')) || 128)

      function setStreamQuality(value: number) {
        streamQuality.value = value
        localStorage.setItem('streamQuality', String(value))
      }

      const cacheSize = ref(0)

      async function updateCacheSize() {
        cacheSize.value = await cacheStore.getCacheSizeGB()
      }

      onMounted(() => {
        updateCacheSize()
        window.addEventListener('audioCached', updateCacheSize)
        window.addEventListener('audioCacheDeleted', updateCacheSize)
        window.addEventListener('audioCacheClearedAll', updateCacheSize)
      })

      onBeforeUnmount(() => {
        window.removeEventListener('audioCached', updateCacheSize)
        window.removeEventListener('audioCacheDeleted', updateCacheSize)
        window.removeEventListener('audioCacheClearedAll', updateCacheSize)
      })

      const isScanning = ref(false)
      const showAboutModal = ref(false)

      async function scan() {
        if (isScanning.value) return
        const loader = useLoader()
        loader.showLoading()
        isScanning.value = true

        try {
          await api.scan()
          let scanning = false
          do {
            await sleep(1000)
            scanning = await api.getScanStatus()
          } while (scanning)

          router.replace({
            name: route.name as string,
            params: { ...(route.params || {}) },
            query: { ...(route.query || {}), t: Date.now().toString() },
          })
        } finally {
          loader.hideLoading()
          isScanning.value = false
        }
      }

      async function clearAllCache() {
        if (!confirmDialog.value) return

        const userConfirmed = await confirmDialog.value.open(
          'Delete cache',
          'About to delete all cached audio files : continue?'
        )
        if (!userConfirmed) return

        try {
          const loader = useLoader()
          loader.showLoading()

          const success = await cacheStore.clearAllAudioCache()
          if (success) {
            window.dispatchEvent(new CustomEvent('audioCacheClearedAll'))
            router.replace({
              name: route.name as string,
              params: { ...(route.params || {}) },
              query: { ...(route.query || {}), t: Date.now().toString() },
            })
          } else {
            alert('No cache found to clear.')
          }

          await updateCacheSize()
          loader.hideLoading()
        } catch (err) {
          console.error('Error clearing cache:', err)
        }
      }

      function logout() {
        auth.logout()
        router.go(0)
      }

      return {
        store,
        auth,
        colors,
        currentColor,
        setTheme,
        streamQuality,
        setStreamQuality,
        cacheSize,
        updateCacheSize,
        isScanning,
        showAboutModal,
        scan,
        clearAllCache,
        logout,
        confirmDialog,
      }
    },
  })
</script>

<style lang="scss" scoped>
  .top-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    z-index: 1000;
    height: 46px;
  }

  .nav-link .nav-icon {
    color: var(--theme-elevation-3);
  }

  .nav-link.router-link-active .nav-icon {
    color: var(--bs-primary);
  }

  .theme-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    cursor: pointer;
    outline: none;
    padding: 0;
    background: transparent;
  }
  .btn-outline-primary.active {
    background-color: rgba(var(--bs-primary-rgb), 0.15);
    border-color: var(--bs-primary);
  }
</style>
