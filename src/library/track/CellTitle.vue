<template>
  <td class="d-flex align-items-center gap-2">
    <!-- Optional thumbnail -->
    <img
      v-if="showImage && track.image"
      :src="track.image"
      alt="cover"
      class="rounded"
      style="width: 28px; height: 28px; object-fit: cover;"
    >

    <div class="flex-grow-1 adapt-text">
      <slot>{{ formatTitle(track.title) }}</slot>
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
    methods: {
      formatArtists,
      formatTitle
    }
  })
</script>
