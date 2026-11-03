// CellCacheStatus.vue
<template>
  <td class="text-right">
    <Icon
      :icon="isCached ? 'check-circle' : 'cloud'"
      :title="isCached ? 'Cached' : 'Not cached'"
    />
  </td>
</template>

<script lang="ts">
  import { defineComponent, computed, watch } from 'vue'
  import Icon from '@/shared/components/Icon.vue'
  import { Track } from '@/shared/api'
  import { useCacheStore } from '@/shared/cache'

  export default defineComponent({
    components: { Icon },

    props: {
      track: {
        type: Object as () => Track,
        required: true
      }
    },

    setup(props) {
      const cacheStore = useCacheStore()

      const url = computed(() => props.track?.url)

      // Reads the shared reactive map; the list primes it in bulk.
      const isCached = computed(() => {
        const trackUrl = url.value
        return trackUrl ? cacheStore.cacheStatus.get(trackUrl) === true : false
      })

      watch(
        url,
        (trackUrl) => {
          if (trackUrl && !cacheStore.cacheStatus.has(trackUrl)) {
            void cacheStore.refreshStatus(trackUrl)
          }
        },
        { immediate: true }
      )

      return {
        isCached
      }
    }
  })
</script>
