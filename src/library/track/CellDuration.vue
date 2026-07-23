// CellDuration.vue
<template>
  <td class="text-start d-md-table-cell">
    {{ formattedDuration }}
  </td>
</template>

<script lang="ts">
  import { defineComponent, computed } from 'vue'
  import { Track } from '@/shared/api'

  export default defineComponent({
    props: { track: { type: Object as () => Track, required: true } },
    setup(props) {
      const formattedDuration = computed(() => {
        const d = props.track?.duration ?? 0
        const min = Math.floor(d / 60)
        const sec = d % 60
        return d ? `${min}:${sec.toString().padStart(2, '0')}` : '-'
      })

      return { formattedDuration }
    }
  })
</script>
