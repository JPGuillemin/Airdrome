<template>
  <div class="top-nav elevated d-flex justify-content-between align-items-center mb-2">
    <div class="d-flex align-items-center">
      <button
        class="btn btn-transparent flex-grow-1 flex-md-grow-0 ms-auto me-2"
        @click="store.showMenu"
      >
        <img width="36" height="36" src="@/shared/assets/logo.png">
      </button>
      <router-link
        class="d-md-none btn btn-transparent nav-link flex-grow-1 flex-md-grow-0 ms-auto me-2"
        :to="{ name: 'home' }"
        title="Home panel"
        exact
      >
        <Icon icon="home" class="nav-icon nav-link" />
      </router-link>
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

          <DropdownItem :href="store.server" target="_blank" rel="noopener noreferrer">
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

  export default defineComponent({
    components: {
      About,
      SearchForm
    },
    setup() {
      const store = useMainStore()
      const auth = useAuth()

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

      return {
        store,
        auth,
        colors,
        currentColor,
        setTheme
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
        if (this.isScanning) {
          return
        }
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
          this.$router.replace({
            name: this.$route.name as string,
            query: { t: Date.now().toString() }
          })
        } finally {
          loader.hideLoading()
          this.isScanning = false
        }
      },
      logout() {
        this.auth.logout()
        this.$router.go(0)
      }
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
