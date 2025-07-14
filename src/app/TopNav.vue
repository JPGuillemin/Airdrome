<template>
  <div class="top-nav elevated d-flex justify-content-between align-items-center mb-2">
    <div class="d-flex align-items-center">
      <button class="btn btn-transparent flex-grow-1 flex-md-grow-0 ms-auto me-2" @click="store.showMenu">
        <img width="36" height="36" src="@/shared/assets/logo.svg">
      </button>
      <router-link class="d-md-none btn btn-transparent nav-link flex-grow-1 flex-md-grow-0 ms-auto me-2" :to="{name: 'home'}" title="Home panel" exact>
        <Avatar>
          <Icon icon="home" class="nav-icon nav-link" />
        </Avatar>
      </router-link>
    </div>
    <div class="d-flex align-items-center">
      <SearchForm class="flex-grow-1 flex-md-grow-0 ms-auto me-2" />
      <template v-if="store.username">
        <Dropdown variant="link" align="end" no-caret toggle-class="px-0">
          <template #button-content>
            <Avatar>
              <Icon icon="gear" color="#4c4c4c" />
            </Avatar>
          </template>
          <div class="px-3 py-1">
            {{ store.username }}
          </div>
          <hr class="dropdown-divider">
          <DropdownItem :href="store.server" target="_blank" rel="noopener noreferrer">
            Server <Icon icon="link" />
          </DropdownItem>
          <DropdownItem @click="scan">
            Scan media folders
          </DropdownItem>
          <DropdownItem @click="showAboutModal = true">
            About
          </DropdownItem>
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
    align-items: center;
    height: 60%;
  }

  .icon-home-wrapper :deep(svg) {
    height: 2.5rem;
    width: auto;
  }
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
</style>
