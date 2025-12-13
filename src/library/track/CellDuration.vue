<template>
  <td class="text-start d-md-table-cell">
    <div class="d-inline-flex adapt-text">
      <span>{{ formattedDuration }}</span>
      <Icon
        v-if="isCached"
        icon="check-circle"
        class="ms-2"
        title="Cached"
      />
    </div>
  </td>
</template>

<script lang="ts">
  import { defineComponent, computed, ref, watchEffect, onMounted, onUnmounted } from 'vue'
  import Icon from '@/shared/components/Icon.vue'
  import { Track } from '@/shared/api'
  import { useCacheStore } from '@/player/cache'

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

      const formattedDuration = computed(() => {
        const d = props.track?.duration ?? 0
        const min = Math.floor(d / 60)
        const sec = d % 60
        return d ? `${min}:${sec.toString().padStart(2, '0')}` : '-'
      })

      return { formattedDuration, isCached }
    }
  })
</script>
