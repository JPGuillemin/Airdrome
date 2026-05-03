// Sidebar.vue
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

  .sidebar-container .sidebar-fixed::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.3);
  }

  .sidebar-container .sidebar-fixed::-webkit-scrollbar-track {
    background: transparent;
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
</style>
