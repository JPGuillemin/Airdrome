<template>
  <td class="text-start d-md-table-cell">
    <div class="d-inline-flex align-items-center justify-content-end">
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

  export default defineComponent({
    components: { Icon },
    props: { track: { type: Object as () => Track, required: true } },
    setup(props) {
      const isCached = ref(false)

      // Re-check whenever track.url changes
      watchEffect(async() => {
        const url = props.track?.url
        if (!url) return (isCached.value = false)
        const cache = await caches.open('airdrome-cache-v2')
        isCached.value = !!(await cache.match(url))
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
