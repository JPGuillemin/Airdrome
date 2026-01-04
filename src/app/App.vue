<template>
  <div>
    <component :is="layout">
      <router-view v-slot="{ Component, route: viewRoute }">
        <component
          :is="Component"
          v-if="!viewRoute.meta.keepAlive"
          v-bind="routeOnAttributes(viewRoute)"
        />
        <keep-alive v-else max="5">
          <component
            :is="Component"
            v-bind="routeOnAttributes(viewRoute)"
          />
        </keep-alive>
      </router-view>
    </component>
    <GlobalLoader />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router'

  import GlobalLoader from '@/shared/components/GlobalLoader.vue'
  import Default from '@/app/layout/Default.vue'
  import Fullscreen from '@/app/layout/Fullscreen.vue'

  const route = useRoute()

  function routeOnAttributes(r: RouteLocationNormalizedLoaded) {
    const dynamicRoutes = new Set(['album', 'genre', 'artist', ' search', 'queue'])

    return dynamicRoutes.has(r.name as string)
      ? { key: JSON.stringify(r.params) }
      : {}
  }

  const layout = computed(() => {
    return route.meta.layout === 'fullscreen'
      ? Fullscreen
      : Default
  })
</script>
