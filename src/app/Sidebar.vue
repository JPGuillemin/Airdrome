<template>
  <div class="main-content sidebar-container">
    <div class="sidebar-fixed d-none d-md-block">
      <SidebarNav />
    </div>
    <div
      v-if="store.menuVisible"
      class="offcanvas-wrapper d-md-none"
      @click="store.hideMenu"
    >
      <div
        class="offcanvas-panel"
        @click.stop
      >
        <SidebarNav />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, watch } from 'vue'
  import SidebarNav from './SidebarNav.vue'
  import { useMainStore } from '@/shared/store'
  import { useRoute } from 'vue-router'

  export default defineComponent({
    components: {
      SidebarNav,
    },
    setup() {
      const store = useMainStore()
      const route = useRoute()

      watch(
        () => route.fullPath,
        () => {
          store.hideMenu()
        }
      )
      return {
        store,
      }
    },
  })
</script>

<style>
  .sidebar-container {
    background: var(--theme-elevation-0);
    min-height: 100vh;
  }

  .sidebar-container .nav {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    background: var(--theme-elevation-0);
  }

  .sidebar-container .sidebar-fixed {
    padding-bottom: 100px;
    width: 170px;
    position: sticky;
    top: 46px;
    max-height: 100vh;
    overflow-y: auto;
    z-index: 500;
    background: var(--theme-elevation-0);
    min-height: calc(100vh - var(--mobile-nav-height));
  }

  /* Scrollbar styling for WebKit browsers */
  .sidebar-container .sidebar-fixed::-webkit-scrollbar {
    width: 8px;
  }

  .sidebar-container .sidebar-fixed::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
  }

  .sidebar-container .sidebar-fixed::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 4px;
  }

  .offcanvas {
    z-index: 600;
  }

  .offcanvas-wrapper {
    position: fixed;
    inset: 0;
    z-index: 600;
    background: rgba(0, 0, 0, 0.6); /* backdrop */
    backdrop-filter: blur(6px);
  }

  .offcanvas-panel {
    width: 50%;
    max-width: 280px;
    height: 100%;
    background: var(--theme-elevation-0);
    overflow-y: auto;
  }

  @media (max-width: 768px) {
    .offcanvas.offcanvas-start {
      width: 50% !important; /* half the screen */
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(6px);
    }
  }

  .sidebar-container .sidebar-brand {
    padding: 1rem 1rem 0.75rem;
  }

  .sidebar-container .sidebar-heading {
    margin-top: 1.25em;
    padding: 0.5rem 1rem;
    font-weight: bold;
    text-transform: uppercase;
    display: block;
  }

  .sidebar-container .nav-link {
    width: calc(100%);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-container a.nav-link .icon {
    margin-right: 0.75rem;
  }

  .sidebar-container .nav-link:not(.router-link-active) .icon {
    color: var(--bs-secondary-color);
  }

  .sidebar-container .nav-link:hover {
    color: inherit;
    background-color: rgba(255, 255, 255, 0.045);
  }

  .sidebar-container .nav-link.router-link-active {
    color: var(--bs-primary);
    background-color: rgba(255, 255, 255, 0.045);
  }

  .sidebar-container .nav-link.router-link-active:hover {
    color: var(--bs-primary);
  }
</style>
