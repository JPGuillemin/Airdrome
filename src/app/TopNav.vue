<template>
  <div class="d-flex justify-content-between align-items-center mb-2">
    <div class="d-flex align-items-center">
      <button class="btn navbar-toggler text-white d-md-none me-2" @click="store.showMenu">
        <Icon icon="nav" />
      </button>

      <router-link class="btn flex-grow-1 flex-md-grow-0 ms-auto me-2" :to="{name: 'home'}" title="Home panel" exact>
        <Icon icon="home" />
      </router-link>
      <router-link class="btn flex-grow-1 flex-md-grow-0 ms-auto me-2" :to="{name: 'queue'}" title="Playing queue">
        <Icon icon="playing" />
      </router-link>
    </div>
    <div class="d-flex align-items-center">
      <SearchForm class="flex-grow-1 flex-md-grow-0 ms-auto me-2" />
      <template v-if="store.username">
        <b-dropdown variant="link" right no-caret toggle-class="px-0">
          <template #button-content>
            <Avatar>
              <Icon icon="person" />
            </Avatar>
          </template>
          <div class="px-3 py-1">
            {{ store.username }}
          </div>
          <b-dropdown-divider />
          <b-dropdown-item :href="store.server" target="_blank" rel="noopener noreferrer">
            Server <Icon icon="link" />
          </b-dropdown-item>
          <b-dropdown-item-button @click="scan">
            Scan media folders
          </b-dropdown-item-button>
          <b-dropdown-item-button @click="showAboutModal = true">
            About
          </b-dropdown-item-button>
          <b-dropdown-divider />
          <b-dropdown-item-button @click="logout">
            Log out
          </b-dropdown-item-button>
        </b-dropdown>
      </template>
      <About :visible="showAboutModal" @close="showAboutModal = false" />
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import About from './About.vue'
  import SearchForm from '@/library/search/SearchForm.vue'
  import { useMainStore } from '@/shared/store'
  import { useAuth } from '@/auth/service'

  export default defineComponent({
    components: {
      About,
      SearchForm,
    },
    setup() {
      return {
        store: useMainStore(),
        auth: useAuth(),
      }
    },
    data() {
      return {
        showAboutModal: false
      }
    },
    methods: {
      scan() {
        return this.$api.scan()
      },
      logout() {
        this.auth.logout()
        this.$router.go(0)
      }
    }
  })
</script>
<style lang="scss" scoped>
  .icon-home-wrapper {
    display: flex;
    align-items: center;     /* Vertical centering */
    height: 60%;            /* Stretch to parent's height */
  }

  .icon-home-wrapper :deep(svg) {
    height: 2.5rem;          /* Match SearchForm height (adjust if needed) */
    width: auto;             /* Preserve aspect ratio */
  }
</style>
