// CellCacheStatus.vue
<template>
  <td class="text-start cache-status-cell">
    <Icon
      v-if="isCached"
      icon="check-circle"
      title="Cached"
    />
  </td>
</template>

<script lang="ts">
  import { defineComponent, ref, watchEffect, onMounted, onUnmounted } from 'vue'
  import Icon from '@/shared/components/Icon.vue'
  import { Track } from '@/shared/api'
  import { useCacheStore } from '@/shared/cache'

  export default defineComponent({
    components: { Icon },
    props: { track: { type: Object as () => Track, required: true } },
    setup(props) {
      const isCached = ref(false)
      const cacheStore = useCacheStore()

      // Re-check whenever track.url changes
      watchEffect(async() => {
        const url = props.track?.url
        if (!url) return (isCached.value = false)
        isCached.value = await cacheStore.hasTrack(url)
      })

      // Event-based cache update
      onMounted(() => {
        const handler = (e: Event) => {
          const cachedUrl = (e as CustomEvent).detail
          if (cachedUrl === props.track?.url) {
            isCached.value = true
          }
        }
        window.addEventListener('audioCached', handler)

        const clearHandler = async() => {
          const url = props.track?.url
          if (!url) {
            isCached.value = false
            return
          }
          isCached.value = await cacheStore.hasTrack(url)
        }

        window.addEventListener('audioCacheClearedAll', clearHandler)

        // Cleanup
        onUnmounted(() => {
          window.removeEventListener('audioCached', handler)
        })
      })

      return { isCached }
    }
  })
</script>

<style scoped>
  .cache-status-cell {
    width: 1%;
    white-space: nowrap;
  }
</style>
