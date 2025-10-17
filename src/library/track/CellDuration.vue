<template>
  <td class="text-end d-none d-md-table-cell">
    {{ formattedDuration }}
  </td>
</template>

<script lang="ts">
  import { defineComponent, PropType, computed } from 'vue'
  import { Track } from '@/shared/api'

  export default defineComponent({
    props: {
      track: { type: Object as PropType<Track>, required: true }
    },
    setup(props) {
      const formattedDuration = computed(() => {
        if (!props.track.duration) return '-'
        const min = Math.floor(props.track.duration / 60)
        const sec = props.track.duration % 60
        return `${min}:${sec.toString().padStart(2, '0')}`
      })
      return { formattedDuration }
    }
  })
</script>
