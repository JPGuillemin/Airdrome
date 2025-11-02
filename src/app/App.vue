<template>
  <div>
    <component :is="layout">
      <keep-alive max="3">
        <router-view :key="$route.fullPath" />
      </keep-alive>
    </component>
    <ErrorToast />
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
