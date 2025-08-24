<template>
  <div>
    <component :is="layout">
      <keep-alive max="3">
        <router-view :key="$route.fullPath" />
      </keep-alive>
    </component>
    <GlobalLoader />
    <ErrorToast />
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import GlobalLoader from '@/shared/components/GlobalLoader.vue'
  import ErrorToast from './ErrorToast.vue'
  import Default from '@/app/layout/Default.vue'
  import Fullscreen from '@/app/layout/Fullscreen.vue'

  export default defineComponent({
    components: {
      ErrorToast,
      Default,
      Fullscreen,
      GlobalLoader,
    },
    computed: {
      layout(): string {
        return (this as any).$route.meta.layout || 'Default'
      }
    }
  })
</script>
