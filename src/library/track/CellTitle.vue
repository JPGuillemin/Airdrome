// CellTitle.vue
<template>
  <td>
    <div class="d-flex align-items-center gap-2 overflow-hidden">
      <img
        v-if="showImage && track.image"
        :src="track.image"
        loading="lazy"
        :alt="track.album"
        class="rounded flex-shrink-0"
        style="width: 28px; height: 28px; object-fit: cover;"
      >

      <div class="flex-grow-1 truncate-cell">
        <slot>{{ formatTitle(track.title) }}</slot>
      </div>
    </div>
  </td>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { formatArtists, formatTitle } from '@/shared/utils'

  export default defineComponent({
    props: {
      track: { type: Object, required: true },
      showImage: { type: Boolean, default: false }
    },
    setup() {
      return { formatArtists, formatTitle }
    }
  })
</script>
