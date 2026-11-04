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

<script>
  import { defineComponent } from 'vue'

  export default defineComponent({
    name: 'CellAlbum',
    props: {
      /** Track whose album name is displayed. */
      track: { type: Object, required: true }
    }
  })
</script>
