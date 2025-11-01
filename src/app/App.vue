<template>
  <component :is="layout">
    <keep-alive include="home,albums,artists,playlists,genres,favourites,files" :max="3">
      <router-view v-slot="{ Component: ViewComponent }">
        <transition name="fade" mode="out-in">
          <component :is="ViewComponent" />
        </transition>
      </router-view>
    </keep-alive>
    <GlobalLoader />
  </component>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import GlobalLoader from '@/shared/components/GlobalLoader.vue'
  import Default from '@/app/layout/Default.vue'
  import Fullscreen from '@/app/layout/Fullscreen.vue'

  export default defineComponent({
    components: {
      Default,
      Fullscreen,
      GlobalLoader,
    },
    computed: {
      layout(): string {
        // Dynamic layout based on route meta
        return (this as any).$route.meta.layout || 'Default'
      },
    },
  })
</script>
