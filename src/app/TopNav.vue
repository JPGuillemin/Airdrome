// TopNav.vue
<template>
  <div class="top-nav">
    <ConfirmDialog ref="confirmDialog" />
    <div class="top-nav-shape elevated d-flex justify-content-between align-items-center pb-2 pt-2">
      <div class="d-flex align-items-center">
        <button
          class="btn btn-transparent flex-grow-1 flex-md-grow-0 ml-1"
          @click="handleLogoClick"
        >
          <div class="logo-wrapper">
            <div :class="['logo-mask', { spinning: isPlaying }]"></div>
          </div>
        </button>
        <div class="brand-title mr-2">
          AIRDROME
        </div>
      </div>

      <div class="d-flex align-items-center">
        <SearchForm class="flex-grow-1 flex-md-grow-0 mx-2" />
        <template v-if="store.username">
          <TrackMenu variant="link" align="end" no-caret toggle-class="px-2">
            <template #button-content>
              <Icon icon="list" color="var(--bs-secondary)" />
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
                  :style="swatchStyle(color)"
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
                    { icon: 'low', value: 92 },
                    { icon: 'medium', value: 128 },
                    { icon: 'high', value: 256 }
                  ]"
                  :key="option.value"
                  class="btn btn-sm"
                  :class="{
                    'btn-outline-active': streamQuality === option.value,
                    'btn-outline-inactive': streamQuality !== option.value
                  }"
                  @click="setStreamQuality(option.value)"
                >
                  <Icon
                    :icon="option.icon"
                  />
                </button>
              </div>
            </div>
            <hr class="dropdown-divider">
            <div class="on-top px-3 py-2 text-muted small">
              Cache size: {{ cacheSize }} MB
            </div>
            <TrackMenuItem class="on-top small" @click="rescan">
              Scan Server<Icon icon="refresh" class="me-1" />
            </TrackMenuItem>
            <div class="on-top px-3 py-2 d-flex align-items-center justify-content-between" @click.stop>
              <span class="small image-cache-label">
                <template v-if="isCachingImages">
                  {{ imageCacheProgress }}<Icon icon="loading" class="ms-1" />
                </template>
                <template v-else-if="imageCacheEnabled">
                  <template v-if="imageCachedCount !== null && imageCachedCount > 0">{{ imageCachedCount }} images</template>
                  <template v-else>Images cache</template>
                </template>
                <template v-else>
                  Images cache
                </template>
              </span>
              <div
                class="cache-toggle ms-3"
                :class="{ active: imageCacheEnabled }"
                @click.stop="toggleImageCache"
              >
                <div class="cache-toggle-knob" />
              </div>
            </div>
            <TrackMenuItem class="on-top small" @click="clearAllCache">
              Clear cache<Icon icon="trash" class="me-1" />
            </TrackMenuItem>
            <TrackMenuItem class="on-top small" @click="logout">
              Log out<Icon icon="logout" class="me-1" />
            </TrackMenuItem>
            <TrackMenuItem class="on-top small" @click="showAboutModal = true">
              About<Icon icon="info" class="me-1" />
            </TrackMenuItem>
          </TrackMenu>
        </template>
        <Teleport to="body">
          <About :visible="showAboutModal" @close="showAboutModal = false" />
        </Teleport>
      </div>
    </div>
  </div>
</template>

<script>
  import { defineComponent, ref, inject, onMounted, onBeforeUnmount, computed } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import About from './About.vue'
  import SearchForm from '@/library/search/SearchForm.vue'
  import { useMainStore } from '@/shared/store'
  import { usePlayerStore } from '@/player/store'
  import { useAuth } from '@/auth/service'
  import { sleep } from '@/shared/utils'
  import { useLoader } from '@/shared/loader'
  import { useCacheStore } from '@/shared/cache'
  import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
  import { pushReload } from '@/shared/reload'
  export default defineComponent({
    components: {
      About: About,
      SearchForm: SearchForm,
      ConfirmDialog: ConfirmDialog,
    },
    setup: function () {
      var store = useMainStore()
      var auth = useAuth()
      var cacheStore = useCacheStore()
      var playerStore = usePlayerStore()
      var router = useRouter()
      var route = useRoute()
      var confirmDialog = ref(null)
      var isPlaying = computed(function () {
        return playerStore.isPlaying && playerStore.track !== null
      })

      /** Backend API injected by the app. */
      var api = inject('$api')

      function handleLogoClick() {
        if (window.innerWidth >= 768) {
          router.push({ name: 'discover' })
        } else {
          store.toggleMenu()
        }
      }

      /** Theme color choices injected by the app. */
      var colors = inject('themeColors')

      var currentColor = ref(
        getComputedStyle(document.documentElement).getPropertyValue('--bs-primary')
      )

      /**
       * Style object for a theme color swatch.
       *
       * @param {Object} color
       * @returns {Object}
       */
      function swatchStyle(color) {
        var border = '1px solid #ccc'

        if (currentColor.value === color.value) {
          border = '2px solid #333'
        }

        return {
          backgroundColor: color.value,
          border: border,
        }
      }

      /**
       * Apply a theme color and persist it.
       *
       * @param {string} color
       * @returns {void}
       */
      function setTheme(color) {
        currentColor.value = color

        function hexToRgb(hex) {
          var bigint = parseInt(hex.replace('#', ''), 16)
          var r = (bigint >> 16) & 255
          var g = (bigint >> 8) & 255
          var b = bigint & 255
          return r + ', ' + g + ', ' + b
        }

        var rgb = hexToRgb(color)
        document.documentElement.style.setProperty('--bs-primary', color)
        document.documentElement.style.setProperty('--bs-primary-rgb', rgb)
        localStorage.setItem('themeColor', color)
      }

      var streamQuality = ref(Number(localStorage.getItem('streamQuality')) || 128)

      /**
       * Set the preferred stream bitrate and persist it.
       *
       * @param {number} value
       * @returns {void}
       */
      function setStreamQuality(value) {
        streamQuality.value = value
        localStorage.setItem('streamQuality', String(value))
      }

      /** Audio cache size in megabytes. */
      var cacheSize = ref(0)

      /**
       * Refresh the displayed audio cache size.
       *
       * @returns {Promise<void>}
       */
      async function updateCacheSize() {
        cacheSize.value = await cacheStore.getCacheSizeMB()
      }

      onMounted(function () {
        updateCacheSize()
        window.addEventListener('audioCached', updateCacheSize)
        window.addEventListener('audioCacheDeleted', updateCacheSize)
        window.addEventListener('audioCacheClearedAll', updateCacheSize)

        // Restore image cache state: populate count and refresh in background if enabled
        if (imageCacheEnabled.value) {
          runImageCacheAtStartup()
        }
      })

      onBeforeUnmount(function () {
        window.removeEventListener('audioCached', updateCacheSize)
        window.removeEventListener('audioCacheDeleted', updateCacheSize)
        window.removeEventListener('audioCacheClearedAll', updateCacheSize)
      })

      var isScanning = ref(false)
      var showAboutModal = ref(false)

      /**
       * Start a server scan and poll until it finishes.
       *
       * @returns {Promise<void>}
       */
      async function rescan() {
        if (isScanning.value) {
          return
        }

        var loader = useLoader()
        loader.showLoading()
        isScanning.value = true

        try {
          await api.scan()

          var scanning = false

          do {
            await sleep(1000)
            scanning = await api.getScanStatus()

            if (imageCacheEnabled.value) {
              runImageCache()
            }
          } while (scanning)

          pushReload()
        } finally {
          loader.hideLoading()
          isScanning.value = false
        }
      }

      /**
       * Delete every cached audio file after user confirmation.
       *
       * @returns {Promise<void>}
       */
      async function clearAllCache() {
        if (!confirmDialog.value) {
          return
        }

        var userConfirmed = await confirmDialog.value.open(
          'Delete cache',
          'About to delete all cached audio files : continue?'
        )

        if (!userConfirmed) {
          return
        }

        var loader = useLoader()
        loader.showLoading()

        try {
          var success = await cacheStore.clearAllAudioCache()

          if (success) {
            var query = Object.assign({}, route.query || {})
            query.t = Date.now().toString()

            router.replace({
              name: route.name,
              params: Object.assign({}, route.params || {}),
              query: query,
            })
          } else {
            alert('No cache found to clear.')
          }

          await updateCacheSize()
        } catch (err) {
          console.error('Error clearing cache:', err)
        } finally {
          loader.hideLoading()
        }
      }

      /**
       * Collect every artist and album image URL, then cache them.
       *
       * @returns {Promise<void>}
       */
      async function cacheAllImages() {
        if (cacheStore.isCachingImages) {
          return
        }

        var PAGE_SIZE = 500
        var requests
        var index

        cacheStore.beginImageCacheCollection()

        requests = [api.getArtists()]

        for (index = 0; index < 20; index++) {
          requests.push(api.getAlbums('a-z', PAGE_SIZE, index * PAGE_SIZE))
        }

        var responses = await Promise.all(requests)
        var artists = responses[0]
        var urls = []
        var page
        var i

        for (i = 0; i < artists.length; i++) {
          if (artists[i].image) {
            urls.push(artists[i].image)
          }
        }

        for (i = 1; i < responses.length; i++) {
          page = responses[i]

          for (var j = 0; j < page.length; j++) {
            if (page[j].image) {
              urls.push(page[j].image)
            }
          }

          if (page.length === 0) {
            break
          }
        }

        await cacheStore.cacheImages(urls)
      }

      var isCachingImages = computed(function () {
        return cacheStore.isCachingImages
      })
      var imageCachedCount = computed(function () {
        return cacheStore.imageCachedCount
      })
      var imageCacheTotal = computed(function () {
        return cacheStore.imageCacheTotal
      })

      var imageCacheProgress = computed(function () {
        var count = imageCachedCount.value

        if (imageCacheTotal.value === null) {
          return 'collecting…'
        }

        if (count === null || count === undefined) {
          count = 0
        }

        return count + '/' + imageCacheTotal.value
      })

      // ── Image cache toggle ──────────────────────────────────────────────
      var imageCacheEnabled = ref(localStorage.getItem('imageCacheEnabled') === 'true')

      /**
       * Run the image cache pass.
       *
       * @returns {Promise<void>}
       */
      async function runImageCache() {
        await cacheAllImages()
      }

      /**
       * Delay the initial image cache pass so startup stays responsive.
       *
       * @returns {Promise<void>}
       */
      async function runImageCacheAtStartup() {
        await sleep(5000)
        await cacheAllImages()
      }

      /**
       * Enable or disable image caching.
       *
       * @returns {Promise<void>}
       */
      async function toggleImageCache() {
        imageCacheEnabled.value = !imageCacheEnabled.value
        localStorage.setItem('imageCacheEnabled', String(imageCacheEnabled.value))

        if (imageCacheEnabled.value) {
          runImageCache()
        } else {
          await cacheStore.clearImageCache()
        }
      }

      /**
       * Log out after user confirmation.
       *
       * @returns {Promise<void>}
       */
      async function logout() {
        if (!confirmDialog.value) {
          return
        }

        var userConfirmed = await confirmDialog.value.open(
          'Logout',
          'About to end Airdrome session : continue?'
        )

        if (!userConfirmed) {
          return
        }

        auth.logout()
        router.go(0)
      }

      return {
        store: store,
        auth: auth,
        colors: colors,
        handleLogoClick: handleLogoClick,
        currentColor: currentColor,
        setTheme: setTheme,
        swatchStyle: swatchStyle,
        streamQuality: streamQuality,
        setStreamQuality: setStreamQuality,
        cacheSize: cacheSize,
        updateCacheSize: updateCacheSize,
        isScanning: isScanning,
        isPlaying: isPlaying,
        showAboutModal: showAboutModal,
        rescan: rescan,
        clearAllCache: clearAllCache,
        logout: logout,
        confirmDialog: confirmDialog,
        isCachingImages: isCachingImages,
        imageCacheProgress: imageCacheProgress,
        imageCachedCount: imageCachedCount,
        imageCacheTotal: imageCacheTotal,
        imageCacheEnabled: imageCacheEnabled,
        toggleImageCache: toggleImageCache,
      }
    },
  })
</script>

<style scoped>

  .top-nav {
    position: fixed;
    inset: 0;
    background: var(--theme-elevation-0);
    height: 56px;
    z-index: 1000;
  }

  .top-nav-shape {
    margin: 5px 5px 5px 5px;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    width: auto;
    z-index: 1001;
    height: 46px;
    border-radius: 12px;
    background: var(--theme-elevation-1);
    border: 0.5px solid var(--theme-elevation-2);
  }

  .logo-mask {
    width: 32px;
    height: 32px;
    background-color: var(--bs-primary);

    -webkit-mask: url('@/shared/assets/logo.svg') no-repeat center;
    mask: url('@/shared/assets/logo.svg') no-repeat center;

    -webkit-mask-size: contain;
    mask-size: contain;
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

  .brand-title {
    display: flex;
    align-items: center;
    height: 100%;
    margin: 0;
    color: var(--bs-secondary);
    font-weight: 550;
  }

  .btn-outline-active,
  .btn-outline-active:hover,
  .btn-outline-active:focus
   {
    background-color: rgba(var(--bs-primary-rgb), 0.15);
    border-color: var(--bs-primary);
  }

  .btn-outline-inactive
  .btn-outline-inactive:hover,
  .btn-outline-inactive:focus
  {
    border-color: var(--bs-secondary);
  }

  .logo-wrapper {
    width: 32px;
    height: 32px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .logo-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: contain; /* keep aspect ratio */
  }

  .spinning {
    animation: spin 2s linear infinite;   /* slower, smoother rotation */
    transform-origin: center;
    backface-visibility: hidden;
    will-change: transform;
    transition: transform 0.3s ease-in-out; /* smooth start/stop */
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .image-cache-label {
    color: var(--bs-body-color);
    min-width: 0;
    flex: 1;
  }

  .cache-toggle {
    flex-shrink: 0;
    width: 34px;
    height: 18px;
    border-radius: 9px;
    background: var(--bs-secondary);
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  }

  .cache-toggle.active {
    background: var(--bs-primary);
  }

  .cache-toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .cache-toggle.active .cache-toggle-knob {
    transform: translateX(16px);
  }

</style>
