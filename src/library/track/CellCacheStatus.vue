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
  import { defineComponent, ref, watch, onMounted, onUnmounted } from 'vue'
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
      const isCached = ref(false)
      const cacheStore = useCacheStore()

      const refreshCacheStatus = async () => {
        const url = props.track?.url

        if (!url) {
          isCached.value = false
          return
        }

        isCached.value = await cacheStore.hasTrack(url)
      }

      watch(
        () => props.track?.url,
        () => {
          void refreshCacheStatus()
        },
        { immediate: true }
      )

      const cachedHandler = (e: Event) => {
        const cachedUrl = (e as CustomEvent<string>).detail

        if (cachedUrl === props.track?.url) {
          isCached.value = true
        }
      }

      const deletedHandler = (e: Event) => {
        const deletedUrl = (e as CustomEvent<string>).detail

        if (deletedUrl === props.track?.url) {
          isCached.value = false
        }
      }

      onMounted(() => {
        window.addEventListener('audioCached', cachedHandler)
        window.addEventListener('audioCacheDeleted', deletedHandler)
        window.addEventListener('audioCacheClearedAll', refreshCacheStatus)
      })

      onUnmounted(() => {
        window.removeEventListener('audioCached', cachedHandler)
        window.removeEventListener('audioCacheDeleted', deletedHandler)
        window.removeEventListener('audioCacheClearedAll', refreshCacheStatus)
      })

      return {
        isCached
      }
    }
  })
</script>
