// CellTitle.vue
<template>
  <td>
    <div class="d-flex align-items-center gap-2 overflow-hidden">
      <img
        v-if="showImage && track.image"
        :src="resolveImage(track.image)"
        loading="lazy"
        :alt="track.album"
        class="rounded flex-shrink-0"
        style="width: 45px; height: 45px; object-fit: cover;"
      >

      <div class="truncate-cell">
        <slot>{{ track.title }}</slot>
      </div>
    </div>
  </td>
</template>

<script>
  import { defineComponent } from 'vue'
  import { resolveImage } from '@/shared/images'

  export default defineComponent({
    setup: function () {
      return { resolveImage: resolveImage }
    },
    props: {
      /** Track whose title is displayed. */
      track: { type: Object, required: true },
      /** Whether the album cover thumbnail is shown. */
      showImage: { type: Boolean, default: false }
    },
  })
</script>
