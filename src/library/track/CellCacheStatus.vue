// CellCacheStatus.vue
<template>
  <td class="text-right">
    <Icon v-if="isCached" icon="check-circle" title="Cached" />
    <Icon v-else icon="cloud" title="Not cached" />
  </td>
</template>

<script>
  import { defineComponent, computed, watch } from 'vue'
  import Icon from '@/shared/components/Icon.vue'
  import { useCacheStore } from '@/shared/cache'

  export default defineComponent({
    components: { Icon: Icon },

    props: {
      /** Track whose cache status is displayed. */
      track: {
        type: Object,
        required: true
      }
    },

    setup: function (props) {
      var cacheStore = useCacheStore()

      var url = computed(function () {
        if (props.track) {
          return props.track.url
        }

        return undefined
      })

      // Reads the shared reactive map; the list primes it in bulk.
      var isCached = computed(function () {
        var trackUrl = url.value

        if (trackUrl) {
          return cacheStore.cacheStatus.get(trackUrl) === true
        }

        return false
      })

      watch(
        url,
        function (trackUrl) {
          if (trackUrl && !cacheStore.cacheStatus.has(trackUrl)) {
            cacheStore.refreshStatus(trackUrl)
          }
        },
        { immediate: true }
      )

      return {
        isCached: isCached
      }
    }
  })
</script>
