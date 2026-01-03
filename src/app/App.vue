<template>
  <div>
    <component :is="layout">
      <router-view v-slot="{ Component, route }">
        <template v-if="route.meta.keepAlive">
          <keep-alive max="3">
            <component :is="Component" />
          </keep-alive>
        </template>
        <template v-else>
          <component :is="Component" />
        </template>
      </router-view>
    </component>
    <GlobalLoader />
  </div>
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
