<template>
  <component :is="layout">
    <router-view v-slot="{ Component, route }">
      <!-- Pages to cache -->
      <keep-alive v-if="isCacheable(route.name)" :max="3">
        <component :is="Component" :key="route.fullPath" />
      </keep-alive>
      <!-- Pages to render once (fullscreen, login, player, etc.) -->
      <component
        :is="Component"
        v-else
        :key="route.fullPath"
      />
    </router-view>
    <!-- Global loader -->
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
    methods: {
      // Pages we want to cache in keep-alive
      isCacheable(routeName: string | null | undefined): boolean {
        const cacheable = [
          'albums',
          'artists',
          'playlists',
          'genres',
          'favourites',
          'files',
          'home',
          'search',
        ]
        return !!routeName && cacheable.includes(routeName)
      },
    },
  })
</script>
