<template>
  <div class="main-content sidebar-container elevated">
    <div class="sidebar-fixed d-none d-md-block">
      <SidebarNav />
    </div>
    <div
      class="offcanvas offcanvas-start d-md-none"
      tabindex="-1"
      :class="store.menuVisible ? 'showing': 'hiding'"
      @click="store.hideMenu"
    >
      <div class="offcanvas-body p-0">
        <SidebarNav />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import SidebarNav from './SidebarNav.vue'
  import { useMainStore } from '@/shared/store'

  export default defineComponent({
    components: {
      SidebarNav,
    },
    setup() {
      return {
        store: useMainStore(),
      }
    },
  })
</script>
<style>
  .sidebar-container .nav {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  .sidebar-container .sidebar-fixed {
    padding-bottom: 100px;
    width: 170px;
    position: sticky;
    top: 46px;
    max-height: 100vh;
    overflow-y: auto; /* vertical slider appears if content overflows */
    z-index: 999;
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
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
  }

  /* Offcanvas scroll for mobile */
  .offcanvas-body {
    overflow-y: auto;
    max-height: 100vh;
  }

  .offcanvas {
    z-index: 1100;
  }

  @media (max-width: 654px) {
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
