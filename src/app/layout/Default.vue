<template>
  <div>
    <div class="min-vh-100 d-flex">
      <Sidebar />
      <main class="container-fluid py-2">
        <TopNav />
        <slot />
      </main>
    </div>
    <MobileNavBar />
    <Player />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import TopNav from '@/app/TopNav.vue'
  import Sidebar from '@/app/Sidebar.vue'
  import Player from '@/player/Player.vue'
  import MobileNavBar from '@/app/MobileNavBar.vue'

  export default defineComponent({
    components: {
      TopNav,
      Sidebar,
      Player,
      MobileNavBar,
    },
  })
</script>

<style scoped>
  main {
    margin-bottom: 80px;
    overflow-x: hidden;
  }
  @media (max-width: 767px) {
    main {
      margin-bottom: 140px; /* Player + MobileNav */
    }
  }
</style>
