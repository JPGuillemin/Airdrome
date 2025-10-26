<template>
  <div class="top-nav elevated d-flex justify-content-between align-items-center mb-2">
    <ConfirmDialog ref="confirmDialog" />
    <div class="d-flex align-items-center">
      <button
        class="btn btn-transparent flex-grow-1 flex-md-grow-0 ms-auto me-2"
        @click="store.showMenu"
      >
        <img width="36" height="36" src="@/shared/assets/logo.svg">
      </button>
      <router-link
        class="d-md-none btn btn-transparent nav-link flex-grow-1 flex-md-grow-0 ms-auto me-2"
        :to="{ name: 'home' }"
        title="Home panel"
        :exact="true"
      >
        <Icon icon="home" class="nav-icon nav-link" />
      </router-link>
      <button
        class="btn btn-transparent nav-link flex-grow-1 flex-md-grow-0 ms-auto me-2 d-none d-md-inline"
        title="Go back"
        @click="$router.back()"
      >
        <Icon icon="goback" class="nav-icon nav-link" />
      </button>
    </div>

    <div class="d-flex align-items-center">
      <SearchForm class="flex-grow-1 flex-md-grow-0 ms-auto me-2" />
      <template v-if="store.username">
        <Dropdown variant="link" align="end" no-caret toggle-class="px-2">
          <template #button-content>
            <Icon icon="gear" color="#4c4c4c" />
          </template>

          <div class="px-3 py-1">
            {{ store.username }}
          </div>

          <hr class="dropdown-divider">

          <DropdownItem
            v-if="store?.server"
            :href="store.server"
            target="_blank"
            rel="noopener noreferrer"
          >
            Server <Icon icon="link" />
          </DropdownItem>
          <DropdownItem @click="scan">
            Refresh content
          </DropdownItem>

          <DropdownItem @click="showAboutModal = true">
            About
          </DropdownItem>

          <hr class="dropdown-divider">
          <div class="px-3 py-2">
            <div class="fw-bold small mb-1">
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

          <div class="px-3 py-2">
            <div class="fw-bold small mb-1">
              Stream quality
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <button
                v-for="option in [
                  { icon: 'low', value: 128 },
                  { icon: 'medium', value: 160 },
                  { icon: 'high', value: 256 }
                ]"
                :key="option.value"
                class="btn btn-sm"
                :class="streamQuality === option.value ? 'btn-primary' : 'btn-outline-secondary'"
                @click="setStreamQuality(option.value)"
              >
                <Icon :icon="option.icon" />
              </button>
            </div>
          </div>

          <hr class="dropdown-divider">

          <DropdownItem @click="clearAllCache">
            Clear cache
          </DropdownItem>
          <DropdownItem @click="logout">
            Log out
          </DropdownItem>
        </Dropdown>
      </template>

      <About :visible="showAboutModal" @close="showAboutModal = false" />
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import About from './About.vue'
  import SearchForm from '@/library/search/SearchForm.vue'
  import { useMainStore } from '@/shared/store'
  import { useAuth } from '@/auth/service'
  import { sleep } from '@/shared/utils'
  import { useLoader } from '@/shared/loader'
  import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'

  export default defineComponent({
    components: {
      About,
      SearchForm,
      ConfirmDialog
    },
    setup() {
      const store = useMainStore()
      const auth = useAuth()
      const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)

      const colors = [
        { name: 'Blue', value: '#0d6efd' },
        { name: 'Green', value: '#1db954' },
        { name: 'Orange', value: '#ff8c00' },
        { name: 'Purple', value: '#6f42c1' },
        { name: 'Red', value: '#bf0000' }
      ]

      const currentColor = ref(
        getComputedStyle(document.documentElement).getPropertyValue('--bs-primary')
      )

      function setTheme(color: string) {
        currentColor.value = color
        document.documentElement.style.setProperty('--bs-primary', color)
        localStorage.setItem('themeColor', color)
      }

      const streamQuality = ref(Number(localStorage.getItem('streamQuality')) || 128)

      function setStreamQuality(value: number) {
        streamQuality.value = value
        localStorage.setItem('streamQuality', String(value))
      }

      return {
        store,
        auth,
        colors,
        currentColor,
        setStreamQuality,
        streamQuality,
        setTheme,
        confirmDialog
      }
    },
    data() {
      return {
        isScanning: false,
        showAboutModal: false,
      }
    },
    methods: {
      async scan() {
        if (this.isScanning) return
        const loader = useLoader()
        loader.showLoading()
        this.isScanning = true
        try {
          await this.$api.scan()
          let scanning = false
          do {
            await sleep(1000)
            scanning = await this.$api.getScanStatus()
          } while (scanning)

          // Refresh page
          this.$router.replace({
            name: this.$route.name as string,
            params: { ...(this.$route.params || {}) },
            query: { ...(this.$route.query || {}), t: Date.now().toString() }
          })
        } finally {
          loader.hideLoading()
          this.isScanning = false
        }
      },
      async clearAllCache() {
        try {
          const dialog = this.$refs.confirmDialog as InstanceType<typeof ConfirmDialog>
          const userConfirmed = await dialog.open(
            'Clear all cache?',
            'This will delete all cached audio files. Continue?'
          )
          if (!userConfirmed) return
          const loader = useLoader()
          loader.showLoading()
          const success = await caches.delete('airdrome-cache-v2')
          if (success) {
            console.info('All audio cache cleared successfully.')
            // alert('All cached audio files have been deleted.')
            window.dispatchEvent(new CustomEvent('audioCacheClearedAll'))
            // Refresh page
            this.$router.replace({
              name: this.$route.name as string,
              params: { ...(this.$route.params || {}) },
              query: { ...(this.$route.query || {}), t: Date.now().toString() }
            })
          } else {
            alert('No cache found to clear.')
          }
          loader.hideLoading()
        } catch (err) {
          console.error('Error clearing cache:', err)
          // alert('Failed to clear cache. Check console for details.')
        }
      },
      logout() {
        this.auth.logout()
        this.$router.go(0)
      },
    }
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
    color: #4c4c4c;
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
</style>
