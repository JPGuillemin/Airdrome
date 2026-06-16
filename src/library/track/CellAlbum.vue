// CellAlbum.vue
<template>
  <td class="d-none d-md-table-cell">
    <div class="truncate-cell">
      <template v-if="track.albumId">
        <router-link :to="{ name: 'album', params: { id: track.albumId } }" @click.stop>
          {{ track.album }}
        </router-link>
      </template>
      <template v-else>
        {{ track.album }}
      </template>
    </div>
  </td>
</template>

<script lang="ts">
  import { defineComponent, PropType } from 'vue'
  import type { Track } from '@/shared/api'

  export default defineComponent({
    name: 'CellAlbum',
    props: {
      track: { type: Object as PropType<Track>, required: true }
    }
  })
</script>
